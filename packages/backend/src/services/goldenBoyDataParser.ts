// Golden Boy Promotions Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';
import { stripDiacritics } from '../utils/fighterMatcher';
import { eventTimeToUTC } from '../utils/timezone';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedGoldenBoyFighter {
  name: string;
  nickname?: string | null;
  url: string;
  imageUrl: string | null;
  localImagePath?: string;
  record?: string | null;
}

interface ScrapedGoldenBoyFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Card" or "Undercard"
  weightClass: string;
  scheduledRounds: number;
  isTitle: boolean;
  fighterA: {
    name: string;
    nickname?: string | null;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    rank: string;
    country: string;
    odds: string;
  };
  fighterB: {
    name: string;
    nickname?: string | null;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    rank: string;
    country: string;
    odds: string;
  };
}

interface ScrapedGoldenBoyEvent {
  eventName: string;
  eventType: string;
  eventUrl: string;
  eventSlug: string;
  venue: string;
  city: string;
  state: string;
  country: string;
  dateText: string;
  eventDate: string | null; // ISO date string
  eventImageUrl: string | null;
  eventStartTime?: string | null;
  status: string;
  fights?: ScrapedGoldenBoyFight[];
  localImagePath?: string;
}

interface ScrapedGoldenBoyEventsData {
  events: ScrapedGoldenBoyEvent[];
}

interface ScrapedGoldenBoyAthletesData {
  athletes: ScrapedGoldenBoyFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse boxing weight class string to WeightClass enum
 * Boxing uses different weight classes than MMA
 */
function parseBoxingWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  // Boxing weight class mappings - using closest MMA equivalents
  // Some boxing weight classes don't have direct MMA equivalents
  const weightClassMapping: Record<string, WeightClass> = {
    'strawweight': WeightClass.STRAWWEIGHT,       // 105 lbs (boxing) / 115 lbs (MMA)
    'light flyweight': WeightClass.STRAWWEIGHT,   // 108 lbs
    'flyweight': WeightClass.FLYWEIGHT,           // 112 lbs
    'super flyweight': WeightClass.FLYWEIGHT,     // 115 lbs
    'bantamweight': WeightClass.BANTAMWEIGHT,     // 118 lbs
    'super bantamweight': WeightClass.BANTAMWEIGHT, // 122 lbs
    'featherweight': WeightClass.FEATHERWEIGHT,   // 126 lbs
    'super featherweight': WeightClass.FEATHERWEIGHT, // 130 lbs
    'junior lightweight': WeightClass.FEATHERWEIGHT,  // 130 lbs
    'lightweight': WeightClass.LIGHTWEIGHT,       // 135 lbs
    'super lightweight': WeightClass.LIGHTWEIGHT, // 140 lbs
    'junior welterweight': WeightClass.LIGHTWEIGHT, // 140 lbs
    'welterweight': WeightClass.WELTERWEIGHT,     // 147 lbs
    'super welterweight': WeightClass.WELTERWEIGHT, // 154 lbs
    'junior middleweight': WeightClass.WELTERWEIGHT, // 154 lbs
    'middleweight': WeightClass.MIDDLEWEIGHT,     // 160 lbs
    'super middleweight': WeightClass.MIDDLEWEIGHT, // 168 lbs
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT, // 175 lbs
    'cruiserweight': WeightClass.LIGHT_HEAVYWEIGHT, // 200 lbs
    'heavyweight': WeightClass.HEAVYWEIGHT,       // 200+ lbs
  };

  // Check for Women's divisions
  const isWomens = normalized.includes("women's") || normalized.includes('womens');

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Infer gender from weight class name
 */
function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('womens') || normalized.includes('female')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse fighter name into first and last name
 */
function parseGoldenBoyFighterName(
  name: string
): { firstName: string; lastName: string } {
  // Decode URL-encoded characters (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
  let decodedName = name;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(name)) {
      decodedName = decodeURIComponent(name);
    }
  } catch (e) {
    decodedName = name;
  }

  const cleanName = decodedName.trim();
  const nameParts = cleanName.split(/\s+/);

  if (nameParts.length === 1) {
    // Single-name fighters - store in lastName for proper sorting
    return { firstName: '', lastName: stripDiacritics(nameParts[0]) };
  }

  const firstName = stripDiacritics(nameParts[0]);
  const lastName = stripDiacritics(nameParts.slice(1).join(' '));
  return { firstName, lastName };
}

/**
 * Parse record string "W-L-D" or "W-L-D, X KO" into numbers
 */
function parseRecord(record: string): { wins: number; losses: number; draws: number; kos?: number } {
  // Match patterns like "21-1-0" or "21-1-0, 15 KO" or "21-1-0 (15 KOs)"
  const recordMatch = record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  const koMatch = record.match(/(\d+)\s*KO/i);

  return {
    wins: recordMatch ? parseInt(recordMatch[1], 10) : 0,
    losses: recordMatch ? parseInt(recordMatch[2], 10) : 0,
    draws: recordMatch && recordMatch[3] ? parseInt(recordMatch[3], 10) : 0,
    kos: koMatch ? parseInt(koMatch[1], 10) : undefined
  };
}

/**
 * Parse ISO date string to Date object
 */
function parseGoldenBoyDate(dateStr: string | null): Date {
  if (!dateStr) {
    // Return a far future date if no date available
    return new Date('2099-01-01');
  }
  return new Date(dateStr);
}

/**
 * Parse event start time to Date object.
 * Golden Boy events are in US Pacific (handles PDT/PST automatically).
 */
function parseGoldenBoyEventStartTime(
  eventDate: Date,
  eventStartTime: string | null | undefined
): Date | null {
  return eventTimeToUTC(eventDate, eventStartTime, 'America/Los_Angeles');
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped Golden Boy data
 */
async function importGoldenBoyFighters(
  athletesData: ScrapedGoldenBoyAthletesData
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} Golden Boy fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseGoldenBoyFighterName(athlete.name);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Parse record if available
    const recordParts = athlete.record ? parseRecord(athlete.record) : { wins: 0, losses: 0, draws: 0 };

    // Upload image to R2 storage
    let profileImageUrl: string | null = null;
    if (athlete.imageUrl) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using Golden Boy URL`);
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
          profileImage: profileImageUrl || undefined,
          nickname: athlete.nickname || undefined,
          wins: recordParts.wins,
          losses: recordParts.losses,
          draws: recordParts.draws,
        },
        create: {
          firstName,
          lastName,
          nickname: athlete.nickname || undefined,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.BOXING,
          isActive: true,
          wins: recordParts.wins,
          losses: recordParts.losses,
          draws: recordParts.draws,
        }
      });

      fighterNameToId.set(athlete.name.toLowerCase(), fighter.id);
      console.log(`  ✓ ${firstName} ${lastName}`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterNameToId.size} Golden Boy fighters\n`);
  return fighterNameToId;
}

/**
 * Import Golden Boy events and fights from scraped data
 */
async function importGoldenBoyEvents(
  eventsData: ScrapedGoldenBoyEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} Golden Boy events...`);

  // Deduplicate events by URL
  const uniqueEvents = new Map<string, ScrapedGoldenBoyEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse date
    const eventDate = parseGoldenBoyDate(eventData.eventDate);

    // Parse location
    const location = [eventData.city, eventData.state, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    // Upload event banner to R2 storage
    let bannerImageUrl: string | undefined;
    if (eventData.eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using Golden Boy URL`);
        bannerImageUrl = eventData.eventImageUrl;
      }
    }

    // Parse main card start time
    const mainStartTime = parseGoldenBoyEventStartTime(
      eventDate,
      eventData.eventStartTime
    );

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
      // Update existing event
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          mainStartTime: mainStartTime || undefined,
          eventStatus: eventData.status === 'Complete' ? 'COMPLETED' : eventData.status === 'Live' ? 'LIVE' : 'UPCOMING',
        }
      });
    } else {
      // Create new event
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'Golden Boy',
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          mainStartTime: mainStartTime || undefined,
          eventStatus: eventData.status === 'Complete' ? 'COMPLETED' : eventData.status === 'Live' ? 'LIVE' : 'UPCOMING',
        }
      });
    }

    console.log(`  ✓ Event: ${eventData.eventName} (${eventDate.toLocaleDateString()})`);

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];

    for (const fightData of fights) {
      // Find fighter IDs by name
      const fighter1Id = fighterNameToId.get(fightData.fighterA.name.toLowerCase());
      const fighter2Id = fighterNameToId.get(fightData.fighterB.name.toLowerCase());

      if (!fighter1Id || !fighter2Id) {
        // Try to create fighters on the fly if not found
        let f1Id = fighter1Id;
        let f2Id = fighter2Id;

        if (!f1Id) {
          const { firstName, lastName } = parseGoldenBoyFighterName(fightData.fighterA.name);
          const recordParts = fightData.fighterA.record ? parseRecord(fightData.fighterA.record) : { wins: 0, losses: 0, draws: 0 };
          try {
            const fighter = await prisma.fighter.upsert({
              where: {
                firstName_lastName: { firstName, lastName }
              },
              update: {},
              create: {
                firstName,
                lastName,
                nickname: fightData.fighterA.nickname || undefined,
                gender: inferGenderFromWeightClass(fightData.weightClass),
                sport: Sport.BOXING,
                isActive: true,
                wins: recordParts.wins,
                losses: recordParts.losses,
                draws: recordParts.draws,
              }
            });
            f1Id = fighter.id;
            fighterNameToId.set(fightData.fighterA.name.toLowerCase(), fighter.id);
          } catch (e) {
            console.warn(`    ⚠ Failed to create fighter: ${fightData.fighterA.name}`);
            continue;
          }
        }

        if (!f2Id) {
          const { firstName, lastName } = parseGoldenBoyFighterName(fightData.fighterB.name);
          const recordParts = fightData.fighterB.record ? parseRecord(fightData.fighterB.record) : { wins: 0, losses: 0, draws: 0 };
          try {
            const fighter = await prisma.fighter.upsert({
              where: {
                firstName_lastName: { firstName, lastName }
              },
              update: {},
              create: {
                firstName,
                lastName,
                nickname: fightData.fighterB.nickname || undefined,
                gender: inferGenderFromWeightClass(fightData.weightClass),
                sport: Sport.BOXING,
                isActive: true,
                wins: recordParts.wins,
                losses: recordParts.losses,
                draws: recordParts.draws,
              }
            });
            f2Id = fighter.id;
            fighterNameToId.set(fightData.fighterB.name.toLowerCase(), fighter.id);
          } catch (e) {
            console.warn(`    ⚠ Failed to create fighter: ${fightData.fighterB.name}`);
            continue;
          }
        }

        if (!f1Id || !f2Id) {
          console.warn(`    ⚠ Skipping fight - fighters not found: ${fightData.fighterA.name} vs ${fightData.fighterB.name}`);
          continue;
        }

        // Continue with the created IDs
        await createGoldenBoyFight(event.id, f1Id, f2Id, fightData);
        fightsImported++;
        continue;
      }

      await createGoldenBoyFight(event.id, fighter1Id, fighter2Id, fightData);
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

  console.log(`✅ Imported all Golden Boy events\n`);
}

/**
 * Helper to create/upsert a fight
 */
async function createGoldenBoyFight(
  eventId: string,
  fighter1Id: string,
  fighter2Id: string,
  fightData: ScrapedGoldenBoyFight
): Promise<void> {
  const weightClass = parseBoxingWeightClass(fightData.weightClass);
  const gender = inferGenderFromWeightClass(fightData.weightClass);

  // Update fighter gender, weight class, and sport
  await prisma.fighter.update({
    where: { id: fighter1Id },
    data: {
      gender,
      weightClass: weightClass || undefined,
      sport: Sport.BOXING,
    }
  });

  await prisma.fighter.update({
    where: { id: fighter2Id },
    data: {
      gender,
      weightClass: weightClass || undefined,
      sport: Sport.BOXING,
    }
  });

  // Create title name for championship fights
  const titleName = fightData.isTitle
    ? `${fightData.weightClass} Championship`
    : undefined;

  try {
    await prisma.fight.upsert({
      where: {
        eventId_fighter1Id_fighter2Id: {
          eventId,
          fighter1Id,
          fighter2Id,
        }
      },
      update: {
        weightClass,
        isTitle: fightData.isTitle,
        titleName,
        scheduledRounds: fightData.scheduledRounds || (fightData.isTitle ? 12 : 10),
        orderOnCard: fightData.order,
        cardType: fightData.cardType,
      },
      create: {
        eventId,
        fighter1Id,
        fighter2Id,
        weightClass,
        isTitle: fightData.isTitle,
        titleName,
        scheduledRounds: fightData.scheduledRounds || (fightData.isTitle ? 12 : 10),
        orderOnCard: fightData.order,
        cardType: fightData.cardType,
        fightStatus: 'UPCOMING',
      }
    });
  } catch (error) {
    console.warn(`    ⚠ Failed to upsert fight:`, error);
  }
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importGoldenBoyData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/goldenboy/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/goldenboy/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting Golden Boy data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedGoldenBoyEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedGoldenBoyAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterNameToId = await importGoldenBoyFighters(athletesData);

    // Step 2: Import events and fights
    await importGoldenBoyEvents(eventsData, fighterNameToId);

    console.log('✅ Golden Boy data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during Golden Boy import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported Golden Boy data
 */
export async function getGoldenBoyImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count({ where: { sport: Sport.BOXING } }),
    prisma.event.count({ where: { promotion: 'Golden Boy' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'Golden Boy' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'Golden Boy',
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
