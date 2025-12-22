// Top Rank Boxing Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedTopRankFighter {
  name: string;
  url: string;
  imageUrl: string | null;
  record: string | null; // "21-1-0" format or null
  localImagePath?: string;
}

interface ScrapedTopRankFight {
  fightId: string;
  order: number;
  cardType: string; // "Main Card", "Undercard"
  weightClass: string; // "175 lbs", "Welterweight", etc.
  isTitle: boolean;
  fighterA: {
    name: string;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    country: string;
  };
  fighterB: {
    name: string;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    country: string;
  };
}

interface ScrapedTopRankEvent {
  eventName: string;
  eventUrl: string;
  dateText: string;
  venue: string;
  city: string;
  country: string;
  eventImageUrl: string | null;
  status: string;
  fights?: ScrapedTopRankFight[];
  localImagePath?: string;
}

interface ScrapedTopRankEventsData {
  events: ScrapedTopRankEvent[];
}

interface ScrapedTopRankAthletesData {
  athletes: ScrapedTopRankFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse fighter record string "W-L-D" into numbers
 * Boxing format: "21-1-0" or "21-1" or null
 */
function parseRecord(record: string | null): { wins: number; losses: number; draws: number } {
  if (!record) {
    return { wins: 0, losses: 0, draws: 0 };
  }
  // Handle various formats: "21-1-0", "21-1", "(21-1-0)", etc.
  const cleaned = record.replace(/[()]/g, '').trim();
  const parts = cleaned.split('-').map(n => parseInt(n, 10));
  return {
    wins: parts[0] || 0,
    losses: parts[1] || 0,
    draws: parts[2] || 0
  };
}

/**
 * Parse boxing weight class string to database enum
 * Boxing uses pound-based classes: "175 lbs", "147 lbs", etc.
 * Also handles named classes: "Welterweight", "Light Heavyweight", etc.
 */
function parseBoxingWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  // Map boxing weight classes to MMA equivalents (closest match)
  // Boxing weight classes:
  // - Heavyweight: 200+ lbs
  // - Cruiserweight: 200 lbs
  // - Light Heavyweight: 175 lbs
  // - Super Middleweight: 168 lbs
  // - Middleweight: 160 lbs
  // - Super Welterweight/Jr Middleweight: 154 lbs
  // - Welterweight: 147 lbs
  // - Super Lightweight/Jr Welterweight: 140 lbs
  // - Lightweight: 135 lbs
  // - Super Featherweight/Jr Lightweight: 130 lbs
  // - Featherweight: 126 lbs
  // - Super Bantamweight/Jr Featherweight: 122 lbs
  // - Bantamweight: 118 lbs
  // - Super Flyweight/Jr Bantamweight: 115 lbs
  // - Flyweight: 112 lbs
  // - Light Flyweight/Jr Flyweight: 108 lbs
  // - Minimumweight/Strawweight: 105 lbs

  // Check for named weight classes first
  if (normalized.includes('heavyweight') && !normalized.includes('light')) {
    return WeightClass.HEAVYWEIGHT;
  }
  if (normalized.includes('light heavyweight') || normalized.includes('175')) {
    return WeightClass.LIGHT_HEAVYWEIGHT;
  }
  if (normalized.includes('super middleweight') || normalized.includes('168')) {
    return WeightClass.MIDDLEWEIGHT; // Closest match
  }
  if (normalized.includes('middleweight') || normalized.includes('160')) {
    return WeightClass.MIDDLEWEIGHT;
  }
  if (normalized.includes('super welterweight') || normalized.includes('154')) {
    return WeightClass.WELTERWEIGHT; // Closest match
  }
  if (normalized.includes('welterweight') || normalized.includes('147')) {
    return WeightClass.WELTERWEIGHT;
  }
  if (normalized.includes('super lightweight') || normalized.includes('140')) {
    return WeightClass.LIGHTWEIGHT; // Closest match
  }
  if (normalized.includes('lightweight') || normalized.includes('135')) {
    return WeightClass.LIGHTWEIGHT;
  }
  if (normalized.includes('super featherweight') || normalized.includes('130')) {
    return WeightClass.FEATHERWEIGHT; // Closest match
  }
  if (normalized.includes('featherweight') || normalized.includes('126')) {
    return WeightClass.FEATHERWEIGHT;
  }
  if (normalized.includes('super bantamweight') || normalized.includes('122')) {
    return WeightClass.BANTAMWEIGHT; // Closest match
  }
  if (normalized.includes('bantamweight') || normalized.includes('118')) {
    return WeightClass.BANTAMWEIGHT;
  }
  if (normalized.includes('super flyweight') || normalized.includes('115')) {
    return WeightClass.FLYWEIGHT; // Closest match
  }
  if (normalized.includes('flyweight') || normalized.includes('112')) {
    return WeightClass.FLYWEIGHT;
  }
  if (normalized.includes('strawweight') || normalized.includes('105') || normalized.includes('minimum')) {
    return WeightClass.STRAWWEIGHT;
  }

  // Try to extract numeric weight
  const weightMatch = normalized.match(/(\d{3})/);
  if (weightMatch) {
    const weight = parseInt(weightMatch[1], 10);
    if (weight >= 200) return WeightClass.HEAVYWEIGHT;
    if (weight >= 175) return WeightClass.LIGHT_HEAVYWEIGHT;
    if (weight >= 160) return WeightClass.MIDDLEWEIGHT;
    if (weight >= 147) return WeightClass.WELTERWEIGHT;
    if (weight >= 135) return WeightClass.LIGHTWEIGHT;
    if (weight >= 126) return WeightClass.FEATHERWEIGHT;
    if (weight >= 118) return WeightClass.BANTAMWEIGHT;
    if (weight >= 112) return WeightClass.FLYWEIGHT;
    return WeightClass.STRAWWEIGHT;
  }

  return null;
}

/**
 * Infer gender from weight class name or fighter context
 * Most Top Rank fights are men's boxing
 */
function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = weightClassStr.toLowerCase();
  if (normalized.includes("women's") || normalized.includes('female')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

/**
 * Parse Top Rank fighter name
 */
function parseTopRankFighterName(
  name: string,
  athleteUrl?: string
): { firstName: string; lastName: string; nickname?: string } {
  // Try to extract from URL if available
  if (athleteUrl && athleteUrl.includes('/boxers/')) {
    const urlMatch = athleteUrl.match(/\/boxers\/([^/]+)\/?$/);
    if (urlMatch) {
      const slug = urlMatch[1];
      const parts = slug.split('-').map(p =>
        p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      );

      if (parts.length >= 2) {
        const firstName = parts[0].trim();
        const lastName = parts.slice(1).join(' ').trim();
        return { firstName, lastName };
      } else if (parts.length === 1) {
        return { firstName: parts[0].trim(), lastName: '' };
      }
    }
  }

  // Handle nicknames in quotes: "Teofimo "The Takeover" Lopez"
  const nicknameMatch = name.match(/^(.+?)\s+"([^"]+)"\s+(.+)$/);
  if (nicknameMatch) {
    return {
      firstName: nicknameMatch[1].trim(),
      nickname: nicknameMatch[2].trim(),
      lastName: nicknameMatch[3].trim()
    };
  }

  // Simple first/last split
  const nameParts = name.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return { firstName: nameParts[0].trim(), lastName: '' };
  }

  const firstName = nameParts[0].trim();
  const lastName = nameParts.slice(1).join(' ').trim();
  return { firstName, lastName };
}

/**
 * Parse Top Rank date string to Date
 * Common formats: "January 25, 2025", "Jan 25 2025", "01/25/2025", "Sat, Jan 31"
 */
function parseTopRankDate(dateText: string): Date {
  if (!dateText) {
    return new Date();
  }

  const months: Record<string, number> = {
    'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
    'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
    'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
    'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
  };

  // Try format with year: "January 25, 2025" or "Jan 25 2025"
  const dateWithYearMatch = dateText.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (dateWithYearMatch) {
    const month = months[dateWithYearMatch[1].toLowerCase()];
    const day = parseInt(dateWithYearMatch[2], 10);
    const year = parseInt(dateWithYearMatch[3], 10);
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Try format without year: "Sat, Jan 31" or "Jan 31"
  const dateWithoutYearMatch = dateText.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s*([A-Za-z]+)\s+(\d{1,2})/i);
  if (dateWithoutYearMatch) {
    const month = months[dateWithoutYearMatch[1].toLowerCase()];
    const day = parseInt(dateWithoutYearMatch[2], 10);
    if (month !== undefined) {
      // Determine year based on whether the date is in the past
      const now = new Date();
      const currentYear = now.getFullYear();
      let eventDate = new Date(currentYear, month, day);

      // If the date is in the past, assume next year
      if (eventDate < now) {
        eventDate = new Date(currentYear + 1, month, day);
      }

      return eventDate;
    }
  }

  // Try standard date parsing as fallback
  const parsed = new Date(dateText);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Fallback to today
  return new Date();
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped Top Rank data
 */
async function importTopRankFighters(
  athletesData: ScrapedTopRankAthletesData
): Promise<Map<string, string>> {
  const fighterUrlToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} Top Rank fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName, nickname } = parseTopRankFighterName(athlete.name, athlete.url);
    const recordParts = parseRecord(athlete.record);

    // Skip if no valid name
    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    // Upload image to R2 storage
    let profileImageUrl: string | null = null;
    if (athlete.imageUrl && athlete.imageUrl.startsWith('http')) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using original URL`);
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
          nickname: nickname || undefined,
        },
        create: {
          firstName,
          lastName,
          nickname,
          ...recordParts,
          profileImage: profileImageUrl,
          gender: Gender.MALE, // Will be updated when we process fights
          sport: Sport.BOXING,
          isActive: true,
        }
      });

      fighterUrlToId.set(athlete.url, fighter.id);
      console.log(`  ✓ ${firstName} ${lastName} (${athlete.record || 'no record'})`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterUrlToId.size} Top Rank fighters\n`);
  return fighterUrlToId;
}

/**
 * Import Top Rank events and fights from scraped data
 */
async function importTopRankEvents(
  eventsData: ScrapedTopRankEventsData,
  fighterUrlToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} Top Rank events...`);

  // Deduplicate events by URL
  const uniqueEvents = new Map<string, ScrapedTopRankEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    // Parse date
    const eventDate = parseTopRankDate(eventData.dateText);

    // Parse location
    const location = [eventData.city, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    // Upload event banner to R2 storage
    let bannerImageUrl: string | undefined;
    if (eventData.eventImageUrl && eventData.eventImageUrl.startsWith('http')) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using original URL`);
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
          mainStartTime: eventDate,
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
          promotion: 'TOP_RANK', // Top Rank Boxing
          date: eventDate,
          mainStartTime: eventDate,
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
      // Find fighter IDs from URL map or by name
      let fighter1Id = fighterUrlToId.get(fightData.fighterA.athleteUrl);
      let fighter2Id = fighterUrlToId.get(fightData.fighterB.athleteUrl);

      // If not found by URL, try to find by name
      if (!fighter1Id) {
        const { firstName, lastName } = parseTopRankFighterName(fightData.fighterA.name);
        const fighter = await prisma.fighter.findFirst({
          where: { firstName, lastName }
        });
        fighter1Id = fighter?.id;
      }

      if (!fighter2Id) {
        const { firstName, lastName } = parseTopRankFighterName(fightData.fighterB.name);
        const fighter = await prisma.fighter.findFirst({
          where: { firstName, lastName }
        });
        fighter2Id = fighter?.id;
      }

      // If still not found, create new fighters
      if (!fighter1Id) {
        const { firstName, lastName, nickname } = parseTopRankFighterName(fightData.fighterA.name);
        const recordParts = parseRecord(fightData.fighterA.record);
        const fighter = await prisma.fighter.create({
          data: {
            firstName,
            lastName,
            nickname,
            ...recordParts,
            gender: Gender.MALE,
            sport: Sport.BOXING,
            isActive: true,
          }
        });
        fighter1Id = fighter.id;
        fighterUrlToId.set(fightData.fighterA.athleteUrl, fighter1Id);
        console.log(`    + Created fighter: ${firstName} ${lastName}`);
      }

      if (!fighter2Id) {
        const { firstName, lastName, nickname } = parseTopRankFighterName(fightData.fighterB.name);
        const recordParts = parseRecord(fightData.fighterB.record);
        const fighter = await prisma.fighter.create({
          data: {
            firstName,
            lastName,
            nickname,
            ...recordParts,
            gender: Gender.MALE,
            sport: Sport.BOXING,
            isActive: true,
          }
        });
        fighter2Id = fighter.id;
        fighterUrlToId.set(fightData.fighterB.athleteUrl, fighter2Id);
        console.log(`    + Created fighter: ${firstName} ${lastName}`);
      }

      // Parse weight class
      const weightClass = parseBoxingWeightClass(fightData.weightClass);
      const gender = inferGenderFromWeightClass(fightData.weightClass);

      // Update fighter sport and gender
      await prisma.fighter.update({
        where: { id: fighter1Id },
        data: {
          gender,
          sport: Sport.BOXING,
          weightClass: weightClass || undefined,
        }
      });

      await prisma.fighter.update({
        where: { id: fighter2Id },
        data: {
          gender,
          sport: Sport.BOXING,
          weightClass: weightClass || undefined,
        }
      });

      // Create title name for championship fights
      const titleName = fightData.isTitle
        ? `${fightData.weightClass} World Championship`
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
            scheduledRounds: fightData.isTitle ? 12 : 10, // Boxing title fights are 12 rounds
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
            scheduledRounds: fightData.isTitle ? 12 : 10,
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

  console.log(`✅ Imported all Top Rank events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function - reads JSON files and imports to database
 */
export async function importTopRankData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/toprank/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/toprank/latest-athletes.json'),
  } = options;

  console.log('\n🥊 Starting Top Rank Boxing data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedTopRankEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedTopRankAthletesData = JSON.parse(athletesJson);

    // Step 1: Import fighters first
    const fighterUrlToId = await importTopRankFighters(athletesData);

    // Step 2: Import events and fights
    await importTopRankEvents(eventsData, fighterUrlToId);

    console.log('✅ Top Rank Boxing data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during Top Rank import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get statistics about imported Top Rank data
 */
export async function getTopRankImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count({ where: { sport: Sport.BOXING } }),
    prisma.event.count({ where: { promotion: 'TOP_RANK' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'TOP_RANK' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'TOP_RANK',
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
