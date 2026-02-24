// OKTAGON MMA Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';
import { TBA_FIGHTER_ID, TBA_FIGHTER_NAME, isTBAFighter } from '../constants/tba';
import { stripDiacritics } from '../utils/fighterMatcher';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedOktagonFighter {
  name: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  record: string | null; // "21-1-0" format or null
  url: string;
  slug: string;
  imageUrl: string | null;
  country?: string;
  localImagePath?: string;
}

interface ScrapedOktagonFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Card", "HEAVYWEIGHT TITLE FIGHT", etc.
  weightClass: string; // "Heavyweight", "Flyweight", etc.
  isTitle: boolean;
  fighterA: {
    name: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    record: string;
    country: string;
    imageUrl: string | null;
    athleteUrl: string;
    slug: string;
    rank: string;
    odds: string;
  };
  fighterB: {
    name: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    record: string;
    country: string;
    imageUrl: string | null;
    athleteUrl: string;
    slug: string;
    rank: string;
    odds: string;
  };
}

interface ScrapedOktagonEvent {
  eventName: string;
  eventUrl: string;
  slug: string;
  dateText: string;
  eventDate: string | null; // ISO string
  venue: string;
  city: string;
  country: string;
  eventImageUrl: string | null;
  status: string;
  fights?: ScrapedOktagonFight[];
  localImagePath?: string;
  hasFightCard?: boolean;
}

interface ScrapedOktagonEventsData {
  events: ScrapedOktagonEvent[];
}

interface ScrapedOktagonAthletesData {
  athletes: ScrapedOktagonFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Get localized text from a multilingual object (prefer 'en', fallback to 'cs' or first available)
 */
function getLocalizedText(obj: any): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj.en || obj.cs || obj.de || Object.values(obj)[0] || '';
}

/**
 * Get localized URL from a multilingual object or nested url object
 */
function getLocalizedUrl(obj: any): string | null {
  if (!obj) return null;
  if (typeof obj === 'string') return obj;
  if (obj.url) {
    if (typeof obj.url === 'string') return obj.url;
    return obj.url.en || obj.url.cs || Object.values(obj.url)[0] || null;
  }
  return obj.en || obj.cs || Object.values(obj)[0] || null;
}

/**
 * Parse fighter record string "W-L-D" into numbers
 * OKTAGON format: "21-1-0" or empty string
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
 * Parse OKTAGON weight class string to WeightClass enum
 * Examples: "Heavyweight", "Flyweight", "Light Heavyweight", "Bantamweight"
 */
function parseOktagonWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  const weightClassMapping: Record<string, WeightClass> = {
    'strawweight': WeightClass.STRAWWEIGHT,
    'flyweight': WeightClass.FLYWEIGHT,
    'bantamweight': WeightClass.BANTAMWEIGHT,
    'featherweight': WeightClass.FEATHERWEIGHT,
    'lightweight': WeightClass.LIGHTWEIGHT,
    'welterweight': WeightClass.WELTERWEIGHT,
    'middleweight': WeightClass.MIDDLEWEIGHT,
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'light-heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'cruiserweight': WeightClass.LIGHT_HEAVYWEIGHT, // Map cruiserweight to light heavyweight
    'heavyweight': WeightClass.HEAVYWEIGHT,
  };

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Infer gender from weight class name
 * OKTAGON uses "Women's" prefix for women's divisions
 */
function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('women ')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse OKTAGON event date from ISO string or DD.MM.YYYY format
 */
function parseOktagonDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  if (dateStr.includes('-') && dateStr.includes('T')) {
    return new Date(dateStr);
  }

  // Try DD.MM.YYYY format
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }

  // Try parsing as-is
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped OKTAGON data
 */
async function importOktagonFighters(
  athletesData: ScrapedOktagonAthletesData
): Promise<Map<string, string>> {
  const fighterUrlToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} OKTAGON fighters...`);

  for (const athlete of athletesData.athletes) {
    const firstName = stripDiacritics(athlete.firstName || '');
    const lastName = stripDiacritics(athlete.lastName || '');
    const recordParts = parseRecord(athlete.record);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Use local cropped image if available, otherwise try to upload to R2
    let profileImageUrl: string | null = null;
    if (athlete.localImagePath) {
      // Use local cropped image path (these are already cropped headshots)
      profileImageUrl = athlete.localImagePath;
    } else if (athlete.imageUrl) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using OKTAGON URL`);
        profileImageUrl = athlete.imageUrl;
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
          nickname: athlete.nickname || undefined,
        },
        create: {
          firstName,
          lastName,
          nickname: athlete.nickname || undefined,
          ...recordParts,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.MMA,
          isActive: true,
        }
      });

      fighterUrlToId.set(athlete.url, fighter.id);
      console.log(`  ✓ ${firstName} ${lastName} (${athlete.record || 'no record'})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterUrlToId.size} OKTAGON fighters\n`);
  return fighterUrlToId;
}

/**
 * Import OKTAGON events and fights from scraped data
 */
async function importOktagonEvents(
  eventsData: ScrapedOktagonEventsData,
  fighterUrlToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} OKTAGON events...`);

  // Deduplicate events by URL
  const uniqueEvents = new Map<string, ScrapedOktagonEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse date
    const eventDate = parseOktagonDate(eventData.eventDate || eventData.dateText);

    if (!eventDate) {
      console.warn(`  ⚠ Skipping event with invalid date: ${eventData.eventName}`);
      continue;
    }

    // Extract mainStartTime from eventDate if it contains real time data (not midnight UTC)
    // OKTAGON's API returns full ISO datetimes like "2025-12-28T18:00:00.000Z"
    const hasRealTime = eventDate.getUTCHours() !== 0 || eventDate.getUTCMinutes() !== 0;
    const mainStartTime = hasRealTime ? eventDate : undefined;

    // Parse venue and city (handle localized objects)
    const venue = getLocalizedText(eventData.venue);
    const city = getLocalizedText(eventData.city);
    const country = eventData.country || '';

    // Parse location
    const location = [city, country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    // Get event banner URL (handle localized objects)
    const eventImageUrl = getLocalizedUrl(eventData.eventImageUrl);

    // Upload event banner to R2 storage
    let bannerImageUrl: string | undefined;
    if (eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using OKTAGON URL`);
        bannerImageUrl = eventImageUrl;
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
          mainStartTime,
          venue: venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
        }
      });
    } else {
      // Create new event - set initial status based on date
      const now = new Date();
      const initialStatus = (eventData.status === 'Complete' || eventDate < now) ? 'COMPLETED' : 'UPCOMING';
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'OKTAGON', // OKTAGON MMA
          date: eventDate,
          mainStartTime,
          venue: venue || undefined,
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
      // Check if fighterB is TBA (missing opponent)
      const isFighterBTBA = !fightData.fighterB.name ||
                            fightData.fighterB.name.trim() === '' ||
                            fightData.fighterB.name.toUpperCase() === 'TBA' ||
                            fightData.fighterB.name.toUpperCase() === 'TBD' ||
                            (!fightData.fighterB.firstName && !fightData.fighterB.lastName);

      // Find fighter IDs from URL map
      let fighter1Id = fighterUrlToId.get(fightData.fighterA.athleteUrl);
      let fighter2Id = isFighterBTBA ? TBA_FIGHTER_ID : fighterUrlToId.get(fightData.fighterB.athleteUrl);

      // If not found by URL, try to find by name
      if (!fighter1Id && fightData.fighterA.firstName && fightData.fighterA.lastName) {
        const fighter1 = await prisma.fighter.findUnique({
          where: {
            firstName_lastName: {
              firstName: stripDiacritics(fightData.fighterA.firstName),
              lastName: stripDiacritics(fightData.fighterA.lastName),
            }
          }
        });
        if (fighter1) {
          fighter1Id = fighter1.id;
          fighterUrlToId.set(fightData.fighterA.athleteUrl, fighter1.id);
        }
      }

      // Skip fighter2 lookup if it's TBA
      if (!isFighterBTBA && !fighter2Id && fightData.fighterB.firstName && fightData.fighterB.lastName) {
        const fighter2 = await prisma.fighter.findUnique({
          where: {
            firstName_lastName: {
              firstName: stripDiacritics(fightData.fighterB.firstName),
              lastName: stripDiacritics(fightData.fighterB.lastName),
            }
          }
        });
        if (fighter2) {
          fighter2Id = fighter2.id;
          fighterUrlToId.set(fightData.fighterB.athleteUrl, fighter2.id);
        }
      }

      // If still not found, create/upsert the fighters
      // Single-name fighters are stored with firstName empty, lastName containing the name
      if (!fighter1Id) {
        const recordParts = parseRecord(fightData.fighterA.record);
        const nameParts = fightData.fighterA.name.split(' ').filter((p: string) => p.length > 0);
        let firstName = stripDiacritics(fightData.fighterA.firstName || '');
        let lastName = stripDiacritics(fightData.fighterA.lastName || '');
        if (!firstName && !lastName && nameParts.length > 0) {
          if (nameParts.length === 1) {
            // Single-name fighter - store in lastName
            firstName = '';
            lastName = stripDiacritics(nameParts[0]);
          } else {
            firstName = stripDiacritics(nameParts[0]);
            lastName = stripDiacritics(nameParts.slice(1).join(' '));
          }
        }
        const fighter1 = await prisma.fighter.upsert({
          where: {
            firstName_lastName: { firstName, lastName }
          },
          create: {
            firstName,
            lastName,
            nickname: fightData.fighterA.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterA.imageUrl || undefined,
            gender: inferGenderFromWeightClass(fightData.weightClass),
            sport: Sport.MMA,
            isActive: true,
          },
          update: {
            nickname: fightData.fighterA.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterA.imageUrl || undefined,
          }
        });
        fighter1Id = fighter1.id;
        fighterUrlToId.set(fightData.fighterA.athleteUrl, fighter1.id);
        console.log(`    + Upserted fighter: ${fightData.fighterA.name}`);
      }

      // Skip fighter2 creation if it's TBA - use the global TBA fighter
      // Single-name fighters are stored with firstName empty, lastName containing the name
      if (!fighter2Id && !isFighterBTBA) {
        const recordParts = parseRecord(fightData.fighterB.record);
        const nameParts = fightData.fighterB.name.split(' ').filter((p: string) => p.length > 0);
        let firstName = stripDiacritics(fightData.fighterB.firstName || '');
        let lastName = stripDiacritics(fightData.fighterB.lastName || '');
        if (!firstName && !lastName && nameParts.length > 0) {
          if (nameParts.length === 1) {
            // Single-name fighter - store in lastName
            firstName = '';
            lastName = stripDiacritics(nameParts[0]);
          } else {
            firstName = stripDiacritics(nameParts[0]);
            lastName = stripDiacritics(nameParts.slice(1).join(' '));
          }
        }
        const fighter2 = await prisma.fighter.upsert({
          where: {
            firstName_lastName: { firstName, lastName }
          },
          create: {
            firstName,
            lastName,
            nickname: fightData.fighterB.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterB.imageUrl || undefined,
            gender: inferGenderFromWeightClass(fightData.weightClass),
            sport: Sport.MMA,
            isActive: true,
          },
          update: {
            nickname: fightData.fighterB.nickname || undefined,
            ...recordParts,
            profileImage: fightData.fighterB.imageUrl || undefined,
          }
        });
        fighter2Id = fighter2.id;
        fighterUrlToId.set(fightData.fighterB.athleteUrl, fighter2.id);
        console.log(`    + Upserted fighter: ${fightData.fighterB.name}`);
      } else if (isFighterBTBA) {
        fighter2Id = TBA_FIGHTER_ID;
        console.log(`    📋 Fighter B is TBA - using placeholder`);
      }

      // Parse weight class
      const weightClass = parseOktagonWeightClass(fightData.weightClass);
      const gender = inferGenderFromWeightClass(fightData.weightClass);

      // Update fighter weight class and gender (skip TBA fighter)
      await prisma.fighter.update({
        where: { id: fighter1Id },
        data: {
          gender,
          weightClass: weightClass || undefined,
        }
      });

      // Don't update TBA fighter's weight class/gender
      if (!isTBAFighter(fighter2Id)) {
        await prisma.fighter.update({
          where: { id: fighter2Id },
          data: {
            gender,
            weightClass: weightClass || undefined,
          }
        });
      }

      // Create title name for championship fights
      const titleName = fightData.isTitle
        ? `OKTAGON ${fightData.weightClass} Championship`
        : undefined;

      // Upsert fight (skip if fighter2Id is undefined)
      if (!fighter2Id) {
        console.warn(`    ⚠ Skipping fight - fighter2Id not found for ${fightData.fighterB.name}`);
        continue;
      }

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
      // OKTAGON uses firstName/lastName directly in scraped data
      const scrapedFighterNames = new Set<string>();
      for (const fightData of fights) {
        // Skip TBA fighters
        if (fightData.fighterA.firstName || fightData.fighterA.lastName) {
          scrapedFighterNames.add(`${fightData.fighterA.firstName || ''} ${fightData.fighterA.lastName || ''}`.toLowerCase().trim());
        }
        if (fightData.fighterB.firstName || fightData.fighterB.lastName) {
          scrapedFighterNames.add(`${fightData.fighterB.firstName || ''} ${fightData.fighterB.lastName || ''}`.toLowerCase().trim());
        }
      }

      // Build a map of scraped fight pairs (to check if a specific matchup exists)
      const scrapedFightPairs = new Set<string>();
      for (const fightData of fights) {
        // Skip fights with TBA fighters for pair matching
        const isFighterBTBA = !fightData.fighterB.name ||
                              fightData.fighterB.name.trim() === '' ||
                              fightData.fighterB.name.toUpperCase() === 'TBA' ||
                              fightData.fighterB.name.toUpperCase() === 'TBD' ||
                              (!fightData.fighterB.firstName && !fightData.fighterB.lastName);

        if (!isFighterBTBA) {
          const pairKey = [
            `${fightData.fighterA.firstName || ''} ${fightData.fighterA.lastName || ''}`.toLowerCase().trim(),
            `${fightData.fighterB.firstName || ''} ${fightData.fighterB.lastName || ''}`.toLowerCase().trim()
          ].sort().join('|');
          scrapedFightPairs.add(pairKey);
        }
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
        // Skip fights with TBA fighter (they're expected to change)
        if (isTBAFighter(dbFight.fighter2Id)) {
          continue;
        }

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
        // Skip fights with TBA fighter
        if (isTBAFighter(dbFight.fighter2Id)) {
          continue;
        }

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

  console.log(`✅ Imported all OKTAGON events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importOktagonData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/oktagon/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/oktagon/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting OKTAGON data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedOktagonEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedOktagonAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterUrlToId = await importOktagonFighters(athletesData);

    // Step 2: Import events and fights
    await importOktagonEvents(eventsData, fighterUrlToId);

    console.log('✅ OKTAGON data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during OKTAGON import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported OKTAGON data
 */
export async function getOktagonImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count(),
    prisma.event.count({ where: { promotion: 'OKTAGON' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'OKTAGON' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'OKTAGON',
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

// Run if called directly
if (require.main === module) {
  importOktagonData()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
