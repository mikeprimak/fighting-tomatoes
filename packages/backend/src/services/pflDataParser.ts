// PFL Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedPFLFighter {
  name: string;
  url: string;
  imageUrl: string | null;
  localImagePath?: string;
}

interface ScrapedPFLFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Card"
  weightClass: string;
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

interface ScrapedPFLEvent {
  eventName: string;
  eventType: string;
  eventUrl: string;
  eventSlug: string;
  venue: string;
  city: string;
  country: string;
  dateText: string;
  eventDate: string | null; // ISO date string
  eventImageUrl: string | null;
  status: string;
  fights?: ScrapedPFLFight[];
  localImagePath?: string;
  eventStartTime?: string;
}

interface ScrapedPFLEventsData {
  events: ScrapedPFLEvent[];
}

interface ScrapedPFLAthletesData {
  athletes: ScrapedPFLFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse PFL weight class string to WeightClass enum
 * PFL uses standard weight classes: Lightweight, Welterweight, Featherweight, etc.
 */
function parsePFLWeightClass(weightClassStr: string): WeightClass | null {
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
    'heavyweight': WeightClass.HEAVYWEIGHT,
  };

  // Check for Women's divisions
  const isWomens = normalized.includes("women's") || normalized.includes('womens');

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      // Women's featherweight in PFL uses same enum
      return value;
    }
  }

  return null;
}

/**
 * Infer gender from weight class name
 * PFL uses "Women's" prefix for women's divisions
 */
function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('womens')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse PFL fighter name into first and last name
 */
function parsePFLFighterName(
  name: string
): { firstName: string; lastName: string } {
  const cleanName = name.trim();
  const nameParts = cleanName.split(/\s+/);

  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: '' };
  }

  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Parse ISO date string to Date object
 */
function parsePFLDate(dateStr: string | null): Date {
  if (!dateStr) {
    // Return a far future date if no date available
    return new Date('2099-01-01');
  }
  return new Date(dateStr);
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped PFL data
 */
async function importPFLFighters(
  athletesData: ScrapedPFLAthletesData
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} PFL fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parsePFLFighterName(athlete.name);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Upload image to R2 storage
    let profileImageUrl: string | null = null;
    if (athlete.imageUrl && !athlete.imageUrl.includes('generic')) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using PFL URL`);
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
        },
        create: {
          firstName,
          lastName,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.MMA,
          isActive: true,
          wins: 0,
          losses: 0,
          draws: 0,
        }
      });

      fighterNameToId.set(athlete.name.toLowerCase(), fighter.id);
      console.log(`  ✓ ${firstName} ${lastName}`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterNameToId.size} PFL fighters\n`);
  return fighterNameToId;
}

/**
 * Import PFL events and fights from scraped data
 */
async function importPFLEvents(
  eventsData: ScrapedPFLEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} PFL events...`);

  // Deduplicate events by URL
  const uniqueEvents = new Map<string, ScrapedPFLEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse date
    const eventDate = parsePFLDate(eventData.eventDate);

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
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using PFL URL`);
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
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
        }
      });
    } else {
      // Create new event
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'PFL',
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
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
          const { firstName, lastName } = parsePFLFighterName(fightData.fighterA.name);
          try {
            const fighter = await prisma.fighter.upsert({
              where: {
                firstName_lastName: { firstName, lastName }
              },
              update: {},
              create: {
                firstName,
                lastName,
                gender: inferGenderFromWeightClass(fightData.weightClass),
                sport: Sport.MMA,
                isActive: true,
                wins: 0,
                losses: 0,
                draws: 0,
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
          const { firstName, lastName } = parsePFLFighterName(fightData.fighterB.name);
          try {
            const fighter = await prisma.fighter.upsert({
              where: {
                firstName_lastName: { firstName, lastName }
              },
              update: {},
              create: {
                firstName,
                lastName,
                gender: inferGenderFromWeightClass(fightData.weightClass),
                sport: Sport.MMA,
                isActive: true,
                wins: 0,
                losses: 0,
                draws: 0,
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
        await createFight(event.id, f1Id, f2Id, fightData);
        fightsImported++;
        continue;
      }

      await createFight(event.id, fighter1Id, fighter2Id, fightData);
      fightsImported++;
    }

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);
    } else {
      console.log(`    ⚠ No fights found for this event`);
    }
  }

  console.log(`✅ Imported all PFL events\n`);
}

/**
 * Helper to create/upsert a fight
 */
async function createFight(
  eventId: string,
  fighter1Id: string,
  fighter2Id: string,
  fightData: ScrapedPFLFight
): Promise<void> {
  const weightClass = parsePFLWeightClass(fightData.weightClass);
  const gender = inferGenderFromWeightClass(fightData.weightClass);

  // Update fighter gender and weight class
  await prisma.fighter.update({
    where: { id: fighter1Id },
    data: {
      gender,
      weightClass: weightClass || undefined,
    }
  });

  await prisma.fighter.update({
    where: { id: fighter2Id },
    data: {
      gender,
      weightClass: weightClass || undefined,
    }
  });

  // Create title name for championship fights
  const titleName = fightData.isTitle
    ? `PFL ${fightData.weightClass} Championship`
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
        scheduledRounds: fightData.isTitle ? 5 : 3,
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
        scheduledRounds: fightData.isTitle ? 5 : 3,
        orderOnCard: fightData.order,
        cardType: fightData.cardType,
        hasStarted: false,
        isComplete: false,
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
export async function importPFLData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/pfl/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/pfl/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting PFL data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedPFLEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedPFLAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterNameToId = await importPFLFighters(athletesData);

    // Step 2: Import events and fights
    await importPFLEvents(eventsData, fighterNameToId);

    console.log('✅ PFL data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during PFL import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported PFL data
 */
export async function getPFLImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count(),
    prisma.event.count({ where: { promotion: 'PFL' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'PFL' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'PFL',
        date: { gte: new Date() },
        isComplete: false
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
