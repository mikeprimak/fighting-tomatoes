// UFC Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  // Handle nicknames in quotes: Jon "Bones" Jones
  const nicknameMatch = fullName.match(/^(.+?)\s+"([^"]+)"\s+(.+)$/);
  if (nicknameMatch) {
    return {
      firstName: nicknameMatch[1].trim(),
      nickname: nicknameMatch[2].trim(),
      lastName: nicknameMatch[3].trim()
    };
  }

  // Simple first/last split
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');

  return { firstName, lastName };
}

/**
 * Parse event date text to DateTime
 * Example: "Sat, Oct 4 / 10:00 PM EDT / Main Card"
 */
function parseEventDate(dateText: string, year: number = new Date().getFullYear()): Date {
  // Extract date part: "Sat, Oct 4"
  const dateMatch = dateText.match(/([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+)/);
  if (!dateMatch) {
    throw new Error(`Cannot parse date: ${dateText}`);
  }

  const [, , month, day] = dateMatch;
  const dateStr = `${month} ${day}, ${year}`;
  return new Date(dateStr);
}

/**
 * Parse time string to DateTime on specific date
 * Example: "10:00 PM EDT" on Oct 4, 2025
 */
function parseEventTime(dateText: string, timeStr?: string, year: number = new Date().getFullYear()): Date {
  const baseDate = parseEventDate(dateText, year);

  if (!timeStr) {
    return baseDate;
  }

  // Parse time: "10:00 PM"
  const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!timeMatch) {
    return baseDate;
  }

  let [, hours, minutes, meridiem] = timeMatch;
  let hour24 = parseInt(hours, 10);

  if (meridiem.toUpperCase() === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (meridiem.toUpperCase() === 'AM' && hour24 === 12) {
    hour24 = 0;
  }

  baseDate.setHours(hour24, parseInt(minutes, 10), 0, 0);
  return baseDate;
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped data
 */
async function importFighters(athletesData: ScrapedAthletesData): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName, nickname } = parseFighterName(athlete.name);
    const recordParts = parseRecord(athlete.record);

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
        profileImage: athlete.localHeadshotPath || athlete.headshotUrl || undefined,
        nickname: nickname || undefined,
      },
      create: {
        firstName,
        lastName,
        nickname,
        ...recordParts,
        profileImage: athlete.localHeadshotPath || athlete.headshotUrl || undefined,
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
  year: number = new Date().getFullYear()
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} events...`);

  for (const eventData of eventsData.events) {
    const eventDate = parseEventDate(eventData.dateText, year);
    const mainStartTime = parseEventTime(eventData.dateText, eventData.eventStartTime, year);

    // Find prelim start time from sections
    const prelimSection = eventData.sections?.find(s => s.cardType === 'Prelims');
    let prelimStartTime: Date | undefined;
    if (prelimSection) {
      const prelimTimeMatch = prelimSection.startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (prelimTimeMatch) {
        prelimStartTime = parseEventTime(eventData.dateText, prelimTimeMatch[0], year);
      }
    }

    // Construct banner image URL from localImagePath
    // Use BASE_URL from environment or default to network IP on port 3001
    const baseUrl = process.env.BASE_URL || 'http://10.0.0.53:3001';
    const bannerImageUrl = (eventData as any).localImagePath
      ? `${baseUrl}${(eventData as any).localImagePath}`
      : eventData.eventImageUrl;

    console.log(`  Banner image for ${eventData.eventName}:`, JSON.stringify({
      localImagePath: (eventData as any).localImagePath,
      eventImageUrl: eventData.eventImageUrl,
      finalBannerUrl: bannerImageUrl
    }));

    // Upsert event using name + date unique constraint
    const event = await prisma.event.upsert({
      where: {
        name_date: {
          name: eventData.eventName,
          date: eventDate,
        }
      },
      update: {
        venue: eventData.venue,
        location: `${eventData.city}, ${eventData.state || eventData.country}`,
        bannerImage: bannerImageUrl,
        mainStartTime,
        prelimStartTime,
        hasStarted: eventData.status === 'Live',
        isComplete: eventData.status === 'Complete',
      },
      create: {
        name: eventData.eventName,
        promotion: 'UFC',
        date: eventDate,
        venue: eventData.venue,
        location: `${eventData.city}, ${eventData.state || eventData.country}`,
        bannerImage: bannerImageUrl,
        mainStartTime,
        prelimStartTime,
        hasStarted: eventData.status === 'Live',
        isComplete: eventData.status === 'Complete',
      }
    });

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
          startTime: fightData.startTime,
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
          startTime: fightData.startTime,
          hasStarted: false,
          isComplete: false,
        }
      });

      fightsImported++;
    }

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);
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
