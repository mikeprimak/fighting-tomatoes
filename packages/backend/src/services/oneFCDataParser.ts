// ONE FC Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';

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
      const slug = urlMatch[1];
      // Convert slug to name: "fabricio-andrade" -> ["Fabricio", "Andrade"]
      const parts = slug.split('-').map(p =>
        p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      );

      if (parts.length >= 2) {
        const firstName = parts[0].trim();
        const lastName = parts.slice(1).join(' ').trim();
        return { firstName, lastName };
      } else if (parts.length === 1) {
        // Single name (e.g., "Tawanchai")
        return { firstName: parts[0].trim(), lastName: '' };
      }
    }
  }

  // Fallback: use the provided name
  const nameParts = name.trim().split(/\s+/);
  if (nameParts.length === 1) {
    // Single name - use as first name
    return { firstName: nameParts[0].trim(), lastName: '' };
  }

  const firstName = nameParts[0].trim();
  const lastName = nameParts.slice(1).join(' ').trim();
  return { firstName, lastName };
}

/**
 * Parse ONE FC Unix timestamp to Date
 */
function parseOneFCTimestamp(timestamp: string): Date {
  const timestampNum = parseInt(timestamp, 10);
  return new Date(timestampNum * 1000);
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
    const eventDate = parseOneFCTimestamp(eventData.timestamp);

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
      // Update existing event
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          mainStartTime: eventDate, // ONE FC events have a single start time
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl, // Ensure URL is set
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
        }
      });
    } else {
      // Create new event
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'ONE', // ONE Championship
          date: eventDate,
          mainStartTime: eventDate, // ONE FC events have a single start time
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
            hasStarted: false,
            isComplete: false,
          }
        });

        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to import fight ${fightData.fighterA.name} vs ${fightData.fighterB.name}:`, error);
      }
    }

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);
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
