// UFC Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';
import { stripDiacritics } from '../utils/fighterMatcher';
import { localTimeToUTC, parseTime12h } from '../utils/timezone';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============
interface ScrapedFighter {
  name: string;
  url: string;
  record: string; // "21-1-1" format
  headshotUrl: string | null;
  localHeadshotPath?: string;
}

interface ScrapedFight {
  fightId: string;
  order: number;
  cardType: 'Main Card' | 'Prelims' | 'Early Prelims';
  weightClass: string;
  isTitle: boolean;
  fighterA: {
    name: string;
    rank?: string;
    country: string;
    odds?: string;
    athleteUrl: string;
  };
  fighterB: {
    name: string;
    rank?: string;
    country: string;
    odds?: string;
    athleteUrl: string;
  };
  startTime?: string;
}

interface ScrapedEventSection {
  cardType: string;
  startTime: string;
  fightCount: number;
}

interface ScrapedEvent {
  eventName: string;
  eventType: string;
  headline: string;
  eventUrl: string;
  venue: string;
  city: string;
  state?: string;
  country: string;
  dateText: string;
  status: string;
  eventImageUrl?: string;
  eventStartTime?: string;
  sections?: ScrapedEventSection[];
  fights?: ScrapedFight[];
}

interface ScrapedEventsData {
  events: ScrapedEvent[];
}

interface ScrapedAthletesData {
  athletes: ScrapedFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse fighter record string "W-L-D" into numbers
 */
function parseRecord(record: string): { wins: number; losses: number; draws: number } {
  const parts = record.split('-').map(n => parseInt(n, 10));
  return {
    wins: parts[0] || 0,
    losses: parts[1] || 0,
    draws: parts[2] || 0
  };
}

/**
 * Map UFC weight class strings to database enum
 */
function mapWeightClass(weightClassStr: string): WeightClass | null {
  const mapping: Record<string, WeightClass> = {
    'Strawweight': WeightClass.STRAWWEIGHT,
    'Flyweight': WeightClass.FLYWEIGHT,
    'Bantamweight': WeightClass.BANTAMWEIGHT,
    'Featherweight': WeightClass.FEATHERWEIGHT,
    'Lightweight': WeightClass.LIGHTWEIGHT,
    'Welterweight': WeightClass.WELTERWEIGHT,
    'Middleweight': WeightClass.MIDDLEWEIGHT,
    'Light Heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'Heavyweight': WeightClass.HEAVYWEIGHT,
    "Women's Strawweight": WeightClass.WOMENS_STRAWWEIGHT,
    "Women's Flyweight": WeightClass.WOMENS_FLYWEIGHT,
    "Women's Bantamweight": WeightClass.WOMENS_BANTAMWEIGHT,
    "Women's Featherweight": WeightClass.WOMENS_FEATHERWEIGHT,
  };

  return mapping[weightClassStr] || null;
}

/**
 * Infer gender from weight class
 */
function inferGenderFromWeightClass(weightClass: WeightClass | null): Gender {
  if (!weightClass) return Gender.MALE;

  const womensClasses: WeightClass[] = [
    WeightClass.WOMENS_STRAWWEIGHT,
    WeightClass.WOMENS_FLYWEIGHT,
    WeightClass.WOMENS_BANTAMWEIGHT,
    WeightClass.WOMENS_FEATHERWEIGHT
  ];

  return womensClasses.includes(weightClass) ? Gender.FEMALE : Gender.MALE;
}

/**
 * Parse fighter name into first/last name
 */
function parseFighterName(fullName: string): { firstName: string; lastName: string; nickname?: string } {
  // Decode URL-encoded characters (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
  let decodedName = fullName;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(fullName)) {
      decodedName = decodeURIComponent(fullName);
    }
  } catch (e) {
    decodedName = fullName;
  }

  // Handle nicknames in quotes: Jon "Bones" Jones
  const nicknameMatch = decodedName.match(/^(.+?)\s+"([^"]+)"\s+(.+)$/);
  if (nicknameMatch) {
    return {
      firstName: stripDiacritics(nicknameMatch[1].trim()),
      nickname: nicknameMatch[2].trim(),
      lastName: stripDiacritics(nicknameMatch[3].trim())
    };
  }

  // Simple first/last split: first word = firstName, everything else = lastName
  const parts = decodedName.trim().split(/\s+/);
  if (parts.length === 1) {
    // Single-name fighters (e.g., "Tawanchai") - store in lastName for proper sorting
    return { firstName: '', lastName: stripDiacritics(parts[0]) };
  }

  const firstName = stripDiacritics(parts[0]);
  const lastName = stripDiacritics(parts.slice(1).join(' '));

  return { firstName, lastName };
}

/**
 * Extract year from event URL if available
 * Fight Night URLs have format: /event/ufc-fight-night-{month}-{day}-{year}
 * e.g., /event/ufc-fight-night-december-13-2025 → 2025
 */
function extractYearFromEventUrl(eventUrl: string, dateText: string): number {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Try to extract year from URL (Fight Night events have full date in URL)
  const urlDateMatch = eventUrl.match(/([a-z]+)-(\d{1,2})-(\d{4})$/i);
  if (urlDateMatch) {
    return parseInt(urlDateMatch[3], 10);
  }

  // For numbered events (UFC 324, etc.), parse month from dateText and apply year rollover logic
  const dateMatch = dateText.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+)/);
  if (dateMatch) {
    const monthStr = dateMatch[2].toLowerCase();
    const months: Record<string, number> = {
      'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
      'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
      'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
      'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
    };

    const eventMonth = months[monthStr];
    const currentMonth = now.getMonth();
    const day = parseInt(dateMatch[3], 10);

    // Create date with current year
    const eventDate = new Date(currentYear, eventMonth, day);

    // Handle year boundary cases:
    // Case 1: Date is in past - check if it should be NEXT year (Dec scraping Jan)
    // Case 2: Date is in future - check if it should be LAST year (Jan scraping Oct/Nov/Dec)
    if (eventDate < now) {
      // Date is in the past with current year
      // Only assume next year for early months (Jan-Mar) when we're in late months (Oct-Dec)
      if (currentMonth >= 9 && eventMonth <= 2) {
        return currentYear + 1;
      }
    } else {
      // Date is in the future with current year
      // If we're in early months (Jan-Mar) and event is late months (Oct-Dec), it's last year
      if (currentMonth <= 2 && eventMonth >= 9) {
        return currentYear - 1;
      }
    }
  }

  return currentYear;
}

/**
 * Parse event date text to DateTime
 * Example: "Sat, Oct 4 / 10:00 PM EDT / Main Card"
 * Returns a UTC Date at noon (12:00) for the parsed calendar date.
 * We use noon UTC instead of midnight so that timezone conversion on the
 * mobile client (which displays the date in local time as a fallback) never
 * shifts the calendar day backwards. UTC-12 to UTC+12 all stay on the same day.
 */
function parseEventDate(dateText: string, year: number = new Date().getFullYear()): Date {
  // Extract date part: "Sat, Oct 4"
  const dateMatch = dateText.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+)/);
  if (!dateMatch) {
    throw new Error(`Cannot parse date: ${dateText}`);
  }

  const [, , month, day] = dateMatch;
  const dateStr = `${month} ${day}, ${year}`;
  // Parse to get month/day, then store as UTC noon
  const parsed = new Date(dateStr);
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
}

/**
 * Parse time string to DateTime on specific date.
 * UFC.com times are always US Eastern (EDT/EST).
 * Converts to UTC using Intl timezone support (handles DST automatically).
 *
 * Example: "10:00 PM EDT" on Oct 4, 2025
 *   → Oct 5, 2025 02:00:00 UTC  (10pm EDT = 2am UTC next day)
 */
function parseEventTime(dateText: string, timeStr?: string, year: number = new Date().getFullYear()): Date {
  const baseDate = parseEventDate(dateText, year);

  if (!timeStr) {
    return baseDate;
  }

  const parsed = parseTime12h(timeStr);
  if (!parsed) {
    return baseDate;
  }

  return localTimeToUTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
    parsed.hour24,
    parsed.minute,
    'America/New_York'
  );
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped data
 */
async function importFighters(athletesData: ScrapedAthletesData): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();
  const baseUrl = process.env.BASE_URL || 'http://10.0.0.53:3001';

  console.log(`\n📦 Importing ${athletesData.athletes.length} fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName, nickname } = parseFighterName(athlete.name);
    const recordParts = parseRecord(athlete.record);

    // Upload image to R2 storage (falls back to UFC.com URL if R2 not configured)
    // R2 provides reliable, free storage with global CDN delivery
    let profileImageUrl: string | null = null;
    if (athlete.headshotUrl) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.headshotUrl, athlete.name);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${athlete.name}, using UFC.com URL`);
        profileImageUrl = athlete.headshotUrl;
      }
    }

    // Upsert fighter using firstName + lastName unique constraint
    const fighter = await prisma.fighter.upsert({
      where: {
        firstName_lastName: {
          firstName,
          lastName,
        }
      },
      update: {
        ...recordParts,
        profileImage: profileImageUrl,
        nickname: nickname || undefined,
      },
      create: {
        firstName,
        lastName,
        nickname,
        ...recordParts,
        profileImage: profileImageUrl,
        gender: Gender.MALE, // Will be updated when we process fights
        isActive: true,
      }
    });

    fighterNameToId.set(athlete.name, fighter.id);
    console.log(`  ✓ ${athlete.name} (${athlete.record})`);
  }

  console.log(`✅ Imported ${fighterNameToId.size} fighters\n`);
  return fighterNameToId;
}

/**
 * Import events and fights from scraped data
 */
async function importEvents(
  eventsData: ScrapedEventsData,
  fighterNameToId: Map<string, string>,
  _year: number = new Date().getFullYear() // kept for backwards compatibility but not used
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} events...`);

  for (const eventData of eventsData.events) {
    // Extract year from event URL (handles year rollover correctly)
    const eventYear = extractYearFromEventUrl(eventData.eventUrl, eventData.dateText);

    const eventDate = parseEventDate(eventData.dateText, eventYear);

    // Only set mainStartTime if we have a valid time from scraper or dateText
    // Don't assume midnight when no time is available
    let mainStartTime: Date | undefined;
    if (eventData.eventStartTime) {
      // Use scraped eventStartTime if available
      mainStartTime = parseEventTime(eventData.dateText, eventData.eventStartTime, eventYear);
    } else {
      // Try to extract time from dateText as fallback (e.g., "Sat, Jan 24 / 9:00 PM EST / Main Card")
      const dateTextTimeMatch = eventData.dateText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
      if (dateTextTimeMatch) {
        mainStartTime = parseEventTime(eventData.dateText, dateTextTimeMatch[1], eventYear);
      }
      // If no time found anywhere, mainStartTime stays undefined
    }

    // Find prelim start time from sections
    const prelimSection = eventData.sections?.find(s => s.cardType === 'Prelims');
    let prelimStartTime: Date | undefined;
    if (prelimSection) {
      const prelimTimeMatch = prelimSection.startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (prelimTimeMatch) {
        prelimStartTime = parseEventTime(eventData.dateText, prelimTimeMatch[0], eventYear);
      }
    }

    // Find early prelim start time from sections
    const earlyPrelimSection = eventData.sections?.find(s => s.cardType === 'Early Prelims');
    let earlyPrelimStartTime: Date | undefined;
    if (earlyPrelimSection) {
      const earlyPrelimTimeMatch = earlyPrelimSection.startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (earlyPrelimTimeMatch) {
        earlyPrelimStartTime = parseEventTime(eventData.dateText, earlyPrelimTimeMatch[0], eventYear);
      }
    }

    // Upload event banner to R2 storage (falls back to UFC.com URL if R2 not configured)
    // R2 provides reliable, free storage with global CDN delivery
    let bannerImageUrl: string | undefined;
    if (eventData.eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using UFC.com URL`);
        bannerImageUrl = eventData.eventImageUrl;
      }
    }

    console.log(`  Banner image for ${eventData.eventName}: ${bannerImageUrl || 'none'}`);

    // Check if event already exists - we want to preserve existing dates to prevent
    // year parsing bugs from overwriting correct dates (e.g., "Sat, Oct 25" could be
    // parsed as 2026 when it should be 2025 if scraper runs in early 2026)
    const existingEvent = await prisma.event.findUnique({
      where: { ufcUrl: eventData.eventUrl },
      select: { id: true, date: true, eventStatus: true },
    });

    // Build update data - do NOT overwrite eventStatus (lifecycle service manages it)
    const updateData: any = {
      name: eventData.eventName,
      venue: eventData.venue,
      location: `${eventData.city}, ${eventData.state || eventData.country}`,
      bannerImage: bannerImageUrl,
      earlyPrelimStartTime,
      prelimStartTime,
      mainStartTime,
    };

    // Only update date if:
    // 1. Event doesn't exist yet, OR
    // 2. Event exists but is not complete (still upcoming, might need date correction)
    // This prevents year parsing bugs from corrupting completed event dates
    if (!existingEvent || existingEvent.eventStatus !== 'COMPLETED') {
      updateData.date = eventDate;
    } else {
      console.log(`    ℹ Preserving existing date for completed event: ${existingEvent.date.toISOString()}`);
    }

    // Set initial status for new events based on date
    const now = new Date();
    const initialStatus = (eventData.status === 'Complete' || eventDate < now) ? 'COMPLETED' : 'UPCOMING';

    // Upsert event using ufcUrl as unique identifier (most reliable for UFC events).
    // Falls back to name lookup if unique constraints conflict (e.g., duplicate events,
    // date shifts from timezone fix, or events created by another scraper).
    let event;
    try {
      event = await prisma.event.upsert({
        where: {
          ufcUrl: eventData.eventUrl,
        },
        update: updateData,
        create: {
          name: eventData.eventName,
          promotion: 'UFC',
          date: eventDate,
          venue: eventData.venue,
          location: `${eventData.city}, ${eventData.state || eventData.country}`,
          bannerImage: bannerImageUrl,
          ufcUrl: eventData.eventUrl,
          earlyPrelimStartTime,
          prelimStartTime,
          mainStartTime,
          eventStatus: initialStatus,
        }
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Unique constraint conflict — try to find and update the existing event by name.
        // Don't set ufcUrl in fallback to avoid secondary unique conflicts from duplicates.
        const existing = await prisma.event.findFirst({
          where: { name: eventData.eventName, promotion: 'UFC' },
        });
        if (existing) {
          try {
            event = await prisma.event.update({
              where: { id: existing.id },
              data: updateData,
            });
            console.log(`    ℹ Updated existing event by name: ${eventData.eventName}`);
          } catch (updateErr: any) {
            console.warn(`    ⚠ Could not update event ${eventData.eventName}: ${updateErr.message}`);
            continue;
          }
        } else {
          console.warn(`    ⚠ Skipping event ${eventData.eventName}: unique constraint conflict, no match by name`);
          continue;
        }
      } else {
        throw err;
      }
    }

    console.log(`  ✓ Event: ${eventData.eventName}`);

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];
    for (const fightData of fights) {
      const fighter1Id = fighterNameToId.get(fightData.fighterA.name);
      const fighter2Id = fighterNameToId.get(fightData.fighterB.name);

      if (!fighter1Id || !fighter2Id) {
        console.warn(`    ⚠ Skipping fight - fighters not found: ${fightData.fighterA.name} vs ${fightData.fighterB.name}`);
        continue;
      }

      const weightClass = mapWeightClass(fightData.weightClass);
      const gender = inferGenderFromWeightClass(weightClass);

      // Update fighter genders and weight classes
      await prisma.fighter.update({
        where: { id: fighter1Id },
        data: {
          gender,
          weightClass: weightClass || undefined,
          isChampion: fightData.fighterA.rank === 'C' || undefined,
        }
      });

      await prisma.fighter.update({
        where: { id: fighter2Id },
        data: {
          gender,
          weightClass: weightClass || undefined,
          isChampion: fightData.fighterB.rank === 'C' || undefined,
        }
      });

      // Upsert fight using eventId + fighter1Id + fighter2Id unique constraint
      const titleName = fightData.isTitle ? `UFC ${fightData.weightClass} Championship` : undefined;

      await prisma.fight.upsert({
        where: {
          eventId_fighter1Id_fighter2Id: {
            eventId: event.id,
            fighter1Id,
            fighter2Id,
          }
        },
        update: {
          weightClass,
          isTitle: fightData.isTitle,
          titleName,
          scheduledRounds: fightData.isTitle ? 5 : 3,
          orderOnCard: fightData.order,
          cardType: fightData.cardType,  // "Main Card", "Prelims", or "Early Prelims" from UFC.com
          startTime: fightData.startTime,
          ufcFightId: fightData.fightId,  // UFC's data-fmid for reliable live tracking
        },
        create: {
          eventId: event.id,
          fighter1Id,
          fighter2Id,
          weightClass,
          isTitle: fightData.isTitle,
          titleName,
          scheduledRounds: fightData.isTitle ? 5 : 3,
          orderOnCard: fightData.order,
          cardType: fightData.cardType,  // "Main Card", "Prelims", or "Early Prelims" from UFC.com
          ufcFightId: fightData.fightId,  // UFC's data-fmid for reliable live tracking
          startTime: fightData.startTime,
          fightStatus: 'UPCOMING',
        }
      });

      fightsImported++;
    }

    // ============== CANCELLATION DETECTION ==============
    // Check for fights that were replaced (e.g., fighter rebooked with new opponent)
    // This handles cases where a fight is cancelled and one/both fighters get rebooked

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

      // Build a set of all fighter names in the current scraped data for this event
      const scrapedFighterNames = new Set<string>();
      for (const fightData of fights) {
        scrapedFighterNames.add(fightData.fighterA.name.toLowerCase().trim());
        scrapedFighterNames.add(fightData.fighterB.name.toLowerCase().trim());
      }

      // Build a map of scraped fight pairs (to check if a specific matchup exists)
      const scrapedFightPairs = new Set<string>();
      for (const fightData of fights) {
        const pairKey = [
          fightData.fighterA.name.toLowerCase().trim(),
          fightData.fighterB.name.toLowerCase().trim()
        ].sort().join('|');
        scrapedFightPairs.add(pairKey);
      }

      // Get all existing fights for this event from the database
      const existingDbFights = await prisma.fight.findMany({
        where: {
          eventId: event.id,
          fightStatus: { in: ['UPCOMING', 'LIVE'] },
        },
        include: {
          fighter1: true,
          fighter2: true,
        }
      });

      let cancelledCount = 0;
      let unCancelledCount = 0;

      for (const dbFight of existingDbFights) {
        const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();

        // Create the pair key for this DB fight
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        // Check if this exact matchup still exists in scraped data
        if (!scrapedFightPairs.has(dbFightPairKey)) {
          // Matchup no longer exists - check if either fighter was rebooked
          const fighter1Rebooked = scrapedFighterNames.has(fighter1Name);
          const fighter2Rebooked = scrapedFighterNames.has(fighter2Name);

          if (fighter1Rebooked || fighter2Rebooked) {
            // At least one fighter appears in a different fight - this was a rebooking
            console.log(`    ❌ Cancelling fight (fighter rebooked): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

            await prisma.fight.update({
              where: { id: dbFight.id },
              data: { fightStatus: 'CANCELLED' }
            });

            cancelledCount++;
          } else {
            // Neither fighter appears in scraped data - fight was fully cancelled
            console.log(`    ❌ Cancelling fight (not in scraped data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

            await prisma.fight.update({
              where: { id: dbFight.id },
              data: { fightStatus: 'CANCELLED' }
            });

            cancelledCount++;
          }
        }
      }

      // Also check for fights that were previously cancelled but now reappear (un-cancel them)
      const cancelledDbFights = await prisma.fight.findMany({
        where: {
          eventId: event.id,
          fightStatus: 'CANCELLED',
        },
        include: {
          fighter1: true,
          fighter2: true,
        }
      });

      for (const dbFight of cancelledDbFights) {
        const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`.toLowerCase().trim();
        const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`.toLowerCase().trim();
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        if (scrapedFightPairs.has(dbFightPairKey)) {
          // Fight reappeared in scraped data - un-cancel it
          console.log(`    ✅ Un-cancelling fight (reappeared in data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

          await prisma.fight.update({
            where: { id: dbFight.id },
            data: { fightStatus: 'UPCOMING' }
          });

          unCancelledCount++;
        }
      }

      if (cancelledCount > 0) {
        console.log(`    ⚠ Cancelled ${cancelledCount} fights due to rebooking/cancellation`);
      }
      if (unCancelledCount > 0) {
        console.log(`    ✅ Un-cancelled ${unCancelledCount} fights (reappeared in data)`);
      }
    } else {
      console.log(`    ⚠ No fights found for this event`);
    }
  }

  console.log(`✅ Imported all events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importUFCData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
  year?: number;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/latest-athletes.json'),
    year = new Date().getFullYear()
  } = options;

  console.log('\n🚀 Starting UFC data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterNameToId = await importFighters(athletesData);

    // Step 2: Import events and fights
    await importEvents(eventsData, fighterNameToId, year);

    console.log('✅ UFC data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported data
 */
export async function getImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count(),
    prisma.event.count(),
    prisma.fight.count(),
    prisma.event.count({
      where: {
        date: { gte: new Date() },
        eventStatus: { not: 'COMPLETED' }
      }
    })
  ]);

  return {
    totalFighters,
    totalEvents,
    totalFights,
    upcomingEvents
  };
}
