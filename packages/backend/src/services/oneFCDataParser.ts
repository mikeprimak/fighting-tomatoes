// ONE FC Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';
import { stripDiacritics } from '../utils/fighterMatcher';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedOneFCFighter {
  name: string;
  url: string;
  imageUrl: string | null;
  record: string | null; // "21-1-0" format or null
  headshotUrl: string | null;
  localImagePath?: string;
}

interface ScrapedOneFCFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Card"
  weightClass: string; // "BantamweightMMA", "Flyweight Submission Grappling", etc.
  isTitle: boolean;
  fighterA: {
    name: string;
    athleteUrl: string;
    imageUrl: string | null;
    rank: string;
    country: string;
    odds: string;
  };
  fighterB: {
    name: string;
    athleteUrl: string;
    imageUrl: string | null;
    rank: string;
    country: string;
    odds: string;
  };
}

interface ScrapedOneFCEvent {
  eventName: string;
  eventUrl: string;
  dateText: string; // "Nov 21 (Fri) 7:30AM EST"
  timestamp: string; // Unix timestamp as string
  venue: string;
  city: string;
  country: string;
  eventImageUrl: string | null;
  status: string;
  startTime?: string | null; // ISO 8601 datetime from schema.org or partial time string
  fights?: ScrapedOneFCFight[];
  localImagePath?: string;
}

interface ScrapedOneFCEventsData {
  events: ScrapedOneFCEvent[];
}

interface ScrapedOneFCAthletesData {
  athletes: ScrapedOneFCFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse fighter record string "W-L-D" into numbers
 * ONE FC format: "21-1-0" or null
 */
function parseRecord(record: string | null): { wins: number; losses: number; draws: number } {
  if (!record) {
    return { wins: 0, losses: 0, draws: 0 };
  }
  const parts = record.split('-').map(n => parseInt(n, 10));
  return {
    wins: parts[0] || 0,
    losses: parts[1] || 0,
    draws: parts[2] || 0
  };
}

/**
 * Parse ONE FC weight class string to extract weight class and discipline
 * Examples:
 * - "BantamweightMMA" -> { weightClass: BANTAMWEIGHT, sport: MMA }
 * - "Flyweight Submission Grappling" -> { weightClass: FLYWEIGHT, sport: null (submission grappling) }
 * - "Featherweight Muay Thai" -> { weightClass: FEATHERWEIGHT, sport: MUAY_THAI }
 * - "Bantamweight Kickboxing" -> { weightClass: BANTAMWEIGHT, sport: KICKBOXING }
 */
function parseOneFCWeightClass(weightClassStr: string): { weightClass: WeightClass | null; sport: Sport } {
  // Normalize the string
  const normalized = weightClassStr.toLowerCase().trim();

  // Determine sport/discipline
  let sport: Sport = Sport.MMA;
  if (normalized.includes('muay thai')) {
    sport = Sport.MUAY_THAI;
  } else if (normalized.includes('kickboxing')) {
    sport = Sport.KICKBOXING;
  } else if (normalized.includes('submission grappling') || normalized.includes('grappling')) {
    // Submission grappling doesn't have a direct enum, use MMA as fallback
    // The weightClass string will indicate it's grappling
    sport = Sport.MMA; // Fallback - schema doesn't have SUBMISSION_GRAPPLING
  }

  // Extract weight class
  const weightClassMapping: Record<string, WeightClass> = {
    'strawweight': WeightClass.STRAWWEIGHT,
    'atomweight': WeightClass.STRAWWEIGHT, // ONE's atomweight maps to strawweight
    'flyweight': WeightClass.FLYWEIGHT,
    'bantamweight': WeightClass.BANTAMWEIGHT,
    'featherweight': WeightClass.FEATHERWEIGHT,
    'lightweight': WeightClass.LIGHTWEIGHT,
    'welterweight': WeightClass.WELTERWEIGHT,
    'middleweight': WeightClass.MIDDLEWEIGHT,
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'heavyweight': WeightClass.HEAVYWEIGHT,
  };

  let weightClass: WeightClass | null = null;
  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      weightClass = value;
      break;
    }
  }

  return { weightClass, sport };
}

/**
 * Infer gender from weight class name
 * ONE FC uses "Women's" prefix for women's divisions
 */
function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('atomweight')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse ONE FC fighter name
 * ONE FC data often has just the last name (e.g., "Andrade")
 * We need to extract full names from the athlete URL
 * URL format: https://www.onefc.com/athletes/fabricio-andrade/
 */
function parseOneFCFighterName(
  name: string,
  athleteUrl?: string
): { firstName: string; lastName: string; nickname?: string } {
  // Try to extract full name from URL
  if (athleteUrl) {
    const urlMatch = athleteUrl.match(/\/athletes\/([^/]+)\/?$/);
    if (urlMatch) {
      // Decode URL-encoded characters (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
      let slug = urlMatch[1];
      try {
        if (/%[0-9A-Fa-f]{2}/.test(slug)) {
          slug = decodeURIComponent(slug);
        }
      } catch (e) {
        // Keep original slug if decoding fails
      }

      // Convert slug to name: "fabricio-andrade" -> ["Fabricio", "Andrade"]
      const parts = slug.split('-').map(p =>
        p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      );

      if (parts.length >= 2) {
        const firstName = stripDiacritics(parts[0].trim());
        const lastName = stripDiacritics(parts.slice(1).join(' ').trim());
        return { firstName, lastName };
      } else if (parts.length === 1) {
        // Single-name fighters (e.g., "Tawanchai") - store in lastName for proper sorting
        return { firstName: '', lastName: stripDiacritics(parts[0].trim()) };
      }
    }
  }

  // Fallback: use the provided name
  const nameParts = name.trim().split(/\s+/);
  if (nameParts.length === 1) {
    // Single-name fighters (e.g., "Tawanchai") - store in lastName for proper sorting
    return { firstName: '', lastName: stripDiacritics(nameParts[0].trim()) };
  }

  const firstName = stripDiacritics(nameParts[0].trim());
  const lastName = stripDiacritics(nameParts.slice(1).join(' ').trim());
  return { firstName, lastName };
}

/**
 * Parse ONE FC Unix timestamp to Date
 */
function parseOneFCTimestamp(timestamp: string): Date {
  const timestampNum = parseInt(timestamp, 10);
  return new Date(timestampNum * 1000);
}

/**
 * Parse start time string into a Date object
 * Handles:
 * - ISO 8601 datetime strings (e.g., "2026-01-24T02:00:00+00:00")
 * - Partial time strings (e.g., "9:00 AM ICT") - combined with event date
 * - dateText format (e.g., "Jan 23 (Fri) 9:00PM EST") - from events listing
 *
 * @param startTimeStr - Time extracted from event page (may be wrong if promo banner picked up)
 * @param dateText - dateText from events listing (more reliable)
 * @param eventDate - Event date from timestamp
 */
function parseOneFCStartTime(
  startTimeStr: string | null | undefined,
  dateText: string | null | undefined,
  eventDate: Date
): Date | null {
  // Try dateText first as it's more reliable (from events listing page)
  // Format: "Jan 23 (Fri) 9:00PM EST"
  if (dateText) {
    const dateTextMatch = dateText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,4})?/i);
    if (dateTextMatch) {
      let hours = parseInt(dateTextMatch[1], 10);
      const minutes = parseInt(dateTextMatch[2], 10);
      const isPM = dateTextMatch[3].toUpperCase() === 'PM';
      const tz = dateTextMatch[4] || 'EST';

      // Convert to 24-hour format
      if (isPM && hours !== 12) {
        hours += 12;
      } else if (!isPM && hours === 12) {
        hours = 0;
      }

      // Detect timezone offset
      let tzOffset = -5; // Default to EST
      if (tz === 'PST' || tz === 'PT') {
        tzOffset = -8;
      } else if (tz === 'UTC' || tz === 'GMT') {
        tzOffset = 0;
      } else if (tz === 'ICT') {
        tzOffset = 7;
      }

      // Create date using event date + parsed time
      const result = new Date(eventDate);
      result.setUTCHours(hours - tzOffset, minutes, 0, 0);

      return result;
    }
  }

  // Fallback to startTimeStr (from event page)
  if (!startTimeStr) {
    return null;
  }

  // Try parsing as ISO 8601 first
  const isoDate = new Date(startTimeStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try parsing as partial time (e.g., "9:00 AM ICT")
  const timeMatch = startTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const isPM = timeMatch[3].toUpperCase() === 'PM';

    // Convert to 24-hour format
    if (isPM && hours !== 12) {
      hours += 12;
    } else if (!isPM && hours === 12) {
      hours = 0;
    }

    // Detect timezone offset from the string
    // ONE FC events in Bangkok are typically in ICT (UTC+7)
    let tzOffset = 7; // Default to Bangkok time (ICT)
    if (startTimeStr.includes('EST')) {
      tzOffset = -5;
    } else if (startTimeStr.includes('PST')) {
      tzOffset = -8;
    } else if (startTimeStr.includes('UTC') || startTimeStr.includes('GMT')) {
      tzOffset = 0;
    }

    // Create date using event date + parsed time
    const result = new Date(eventDate);
    result.setUTCHours(hours - tzOffset, minutes, 0, 0);

    return result;
  }

  return null;
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped ONE FC data
 */
async function importOneFCFighters(
  athletesData: ScrapedOneFCAthletesData
): Promise<Map<string, string>> {
  const fighterUrlToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} ONE FC fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseOneFCFighterName(athlete.name, athlete.url);
    const recordParts = parseRecord(athlete.record);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Upload image to R2 storage
    let profileImageUrl: string | null = null;
    const imageUrl = athlete.imageUrl || athlete.headshotUrl;
    if (imageUrl && !imageUrl.includes('generic_')) {
      try {
        profileImageUrl = await uploadFighterImage(imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using ONE FC URL`);
        profileImageUrl = imageUrl;
      }
    }

    try {
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
          profileImage: profileImageUrl || undefined,
        },
        create: {
          firstName,
          lastName,
          ...recordParts,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.MMA, // Default, will be updated per fight
          isActive: true,
        }
      });

      fighterUrlToId.set(athlete.url, fighter.id);
      console.log(`  ✓ ${firstName} ${lastName} (${athlete.record || 'no record'})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterUrlToId.size} ONE FC fighters\n`);
  return fighterUrlToId;
}

/**
 * Import ONE FC events and fights from scraped data
 */
async function importOneFCEvents(
  eventsData: ScrapedOneFCEventsData,
  fighterUrlToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} ONE FC events...`);

  // Deduplicate events by URL (scraped data may have duplicates)
  const uniqueEvents = new Map<string, ScrapedOneFCEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse timestamp to date
    // Note: ONE FC timestamp already includes the event start time, not just the date
    const eventDate = parseOneFCTimestamp(eventData.timestamp);

    // Use the timestamp as the main start time (it already includes time, not just date)
    // The dateText confirms this: "Jan 23 (Fri) 9:00PM EST" matches timestamp of 2026-01-24T02:00:00Z
    const mainStartTime = eventDate;
    console.log(`  📅 Start time: ${mainStartTime.toISOString()} (from timestamp, dateText: ${eventData.dateText})`);

    // Parse location
    const location = [eventData.city, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    // Upload event banner to R2 storage
    let bannerImageUrl: string | undefined;
    if (eventData.eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using ONE FC URL`);
        bannerImageUrl = eventData.eventImageUrl;
      }
    }

    // Try to find existing event by URL first, then by name+date
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventUrl },
          { name: eventData.eventName, date: eventDate }
        ]
      }
    });

    if (event) {
      // Update existing event - do NOT overwrite eventStatus (lifecycle service manages it)
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl, // Ensure URL is set
        }
      });
    } else {
      // Create new event - set initial status based on date
      const now = new Date();
      const initialStatus = (eventData.status === 'Complete' || eventDate < now) ? 'COMPLETED' : 'UPCOMING';
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'ONE', // ONE Championship
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          eventStatus: initialStatus,
        }
      });
    }

    console.log(`  ✓ Event: ${eventData.eventName} (${eventDate.toLocaleDateString()})`);

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];

    for (const fightData of fights) {
      // Find fighter IDs from URL map
      const fighter1Id = fighterUrlToId.get(fightData.fighterA.athleteUrl);
      const fighter2Id = fighterUrlToId.get(fightData.fighterB.athleteUrl);

      if (!fighter1Id || !fighter2Id) {
        console.warn(`    ⚠ Skipping fight - fighters not found: ${fightData.fighterA.name} vs ${fightData.fighterB.name}`);
        continue;
      }

      // Parse weight class and sport
      const { weightClass, sport } = parseOneFCWeightClass(fightData.weightClass);
      const gender = inferGenderFromWeightClass(fightData.weightClass);

      // Update fighter sport and gender
      await prisma.fighter.update({
        where: { id: fighter1Id },
        data: {
          gender,
          sport,
          weightClass: weightClass || undefined,
        }
      });

      await prisma.fighter.update({
        where: { id: fighter2Id },
        data: {
          gender,
          sport,
          weightClass: weightClass || undefined,
        }
      });

      // Create title name for championship fights
      const titleName = fightData.isTitle
        ? `ONE ${fightData.weightClass} World Championship`
        : undefined;

      // Upsert fight
      try {
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
            cardType: fightData.cardType,
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
            cardType: fightData.cardType,
            fightStatus: 'UPCOMING',
          }
        });

        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to import fight ${fightData.fighterA.name} vs ${fightData.fighterB.name}:`, error);
      }
    }

    // ============== CANCELLATION DETECTION ==============
    // Check for fights that were replaced (e.g., fighter rebooked with new opponent)
    // This handles cases where a fight is cancelled and one/both fighters get rebooked

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

      // Build a set of all fighter names in the current scraped data for this event
      const scrapedFighterNames = new Set<string>();
      for (const fightData of fights) {
        // Parse names from athlete URLs for consistency with DB storage
        const nameA = parseOneFCFighterName(fightData.fighterA.name, fightData.fighterA.athleteUrl);
        const nameB = parseOneFCFighterName(fightData.fighterB.name, fightData.fighterB.athleteUrl);
        scrapedFighterNames.add(`${nameA.firstName} ${nameA.lastName}`.toLowerCase().trim());
        scrapedFighterNames.add(`${nameB.firstName} ${nameB.lastName}`.toLowerCase().trim());
      }

      // Build a map of scraped fight pairs (to check if a specific matchup exists)
      const scrapedFightPairs = new Set<string>();
      for (const fightData of fights) {
        const nameA = parseOneFCFighterName(fightData.fighterA.name, fightData.fighterA.athleteUrl);
        const nameB = parseOneFCFighterName(fightData.fighterB.name, fightData.fighterB.athleteUrl);
        const pairKey = [
          `${nameA.firstName} ${nameA.lastName}`.toLowerCase().trim(),
          `${nameB.firstName} ${nameB.lastName}`.toLowerCase().trim()
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
            // Neither fighter appears in scraped data at all - fight may have been fully cancelled
            // Only mark as cancelled if event is in the near future (within 7 days)
            const daysUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

            if (daysUntilEvent <= 7) {
              console.log(`    ❌ Cancelling fight (not in scraped data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);

              await prisma.fight.update({
                where: { id: dbFight.id },
                data: { fightStatus: 'CANCELLED' }
              });

              cancelledCount++;
            } else {
              console.log(`    ⚠ Fight missing from scraped data (not cancelling, event > 7 days out): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
            }
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

  console.log(`✅ Imported all ONE FC events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importOneFCData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/onefc/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/onefc/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting ONE FC data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedOneFCEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedOneFCAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterUrlToId = await importOneFCFighters(athletesData);

    // Step 2: Import events and fights
    await importOneFCEvents(eventsData, fighterUrlToId);

    console.log('✅ ONE FC data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during ONE FC import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported ONE FC data
 */
export async function getOneFCImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count(),
    prisma.event.count({ where: { promotion: 'ONE' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'ONE' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'ONE',
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
