// Zuffa Boxing Data Parser - Imports scraped Tapology data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stripDiacritics } from '../utils/fighterMatcher';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedZuffaFighter {
  name: string;
  url?: string;
  imageUrl?: string | null;
  record?: string | null;
}

interface ScrapedZuffaFight {
  fightId: string;
  order: number;
  cardType: string;
  weightClass: string;
  scheduledRounds: number;
  isTitle: boolean;
  fighterA: {
    name: string;
    athleteUrl?: string;
    imageUrl?: string | null;
    record?: string;
    country?: string;
  };
  fighterB: {
    name: string;
    athleteUrl?: string;
    imageUrl?: string | null;
    record?: string;
    country?: string;
  };
}

interface ScrapedZuffaEvent {
  eventName: string;
  eventUrl: string;
  eventSlug: string;
  venue: string;
  city: string;
  state?: string;
  country: string;
  dateText: string;
  eventDate: string | null;
  eventImageUrl?: string | null;
  status: string;
  fights?: ScrapedZuffaFight[];
}

interface ScrapedZuffaEventsData {
  events: ScrapedZuffaEvent[];
}

interface ScrapedZuffaAthletesData {
  athletes: ScrapedZuffaFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Normalize name by removing accents/diacritics for consistent matching
 * Uses stripDiacritics which also handles ł, đ, ø, æ, ß
 * "Cárdenas" -> "Cardenas", "José" -> "Jose", "Błachowicz" -> "Blachowicz"
 */
function normalizeName(name: string): string {
  return stripDiacritics(name).trim();
}

/**
 * Parse boxing weight class string to WeightClass enum
 */
function parseBoxingWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  // Boxing weight class mappings using pound values
  if (normalized.includes('200') || normalized.includes('heavyweight')) {
    return WeightClass.HEAVYWEIGHT;
  }
  if (normalized.includes('175') || normalized.includes('light heavy')) {
    return WeightClass.LIGHT_HEAVYWEIGHT;
  }
  if (normalized.includes('168') || normalized.includes('super middle')) {
    return WeightClass.MIDDLEWEIGHT;
  }
  if (normalized.includes('160') || normalized.includes('middleweight')) {
    return WeightClass.MIDDLEWEIGHT;
  }
  if (normalized.includes('154') || normalized.includes('super welter')) {
    return WeightClass.WELTERWEIGHT;
  }
  if (normalized.includes('147') || normalized.includes('welterweight')) {
    return WeightClass.WELTERWEIGHT;
  }
  if (normalized.includes('140') || normalized.includes('super light')) {
    return WeightClass.LIGHTWEIGHT;
  }
  if (normalized.includes('135') || normalized.includes('lightweight')) {
    return WeightClass.LIGHTWEIGHT;
  }
  if (normalized.includes('130') || normalized.includes('super feather')) {
    return WeightClass.FEATHERWEIGHT;
  }
  if (normalized.includes('126') || normalized.includes('featherweight')) {
    return WeightClass.FEATHERWEIGHT;
  }
  if (normalized.includes('122') || normalized.includes('super bantam')) {
    return WeightClass.BANTAMWEIGHT;
  }
  if (normalized.includes('118') || normalized.includes('bantamweight')) {
    return WeightClass.BANTAMWEIGHT;
  }
  if (normalized.includes('115') || normalized.includes('super fly')) {
    return WeightClass.FLYWEIGHT;
  }
  if (normalized.includes('112') || normalized.includes('flyweight')) {
    return WeightClass.FLYWEIGHT;
  }
  if (normalized.includes('105') || normalized.includes('strawweight') || normalized.includes('minimum')) {
    return WeightClass.STRAWWEIGHT;
  }

  return null;
}

/**
 * Parse fighter name into first and last name
 * Names are normalized (accents removed) for consistent database matching
 */
function parseZuffaFighterName(name: string): { firstName: string; lastName: string } {
  // Normalize to remove accents for consistent matching
  const cleanName = normalizeName(name);
  const nameParts = cleanName.split(/\s+/);

  if (nameParts.length === 1) {
    return { firstName: '', lastName: nameParts[0] };
  }

  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Parse record string "W-L-D" into numbers
 */
function parseRecord(record: string | null | undefined): { wins: number; losses: number; draws: number } {
  if (!record) {
    return { wins: 0, losses: 0, draws: 0 };
  }
  const recordMatch = record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  return {
    wins: recordMatch ? parseInt(recordMatch[1], 10) : 0,
    losses: recordMatch ? parseInt(recordMatch[2], 10) : 0,
    draws: recordMatch && recordMatch[3] ? parseInt(recordMatch[3], 10) : 0,
  };
}

/**
 * Parse ISO date string to Date object
 */
function parseZuffaDate(dateStr: string | null): Date {
  if (!dateStr) {
    return new Date('2099-01-01');
  }
  return new Date(dateStr);
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped data
 */
async function importZuffaFighters(
  athletesData: ScrapedZuffaAthletesData
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} Zuffa Boxing fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseZuffaFighterName(athlete.name);

    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    const recordParts = athlete.record ? parseRecord(athlete.record) : { wins: 0, losses: 0, draws: 0 };

    try {
      const fighter = await prisma.fighter.upsert({
        where: {
          firstName_lastName: {
            firstName,
            lastName,
          }
        },
        update: {
          profileImage: athlete.imageUrl || undefined,
          wins: recordParts.wins,
          losses: recordParts.losses,
          draws: recordParts.draws,
        },
        create: {
          firstName,
          lastName,
          profileImage: athlete.imageUrl || undefined,
          gender: Gender.MALE,
          sport: Sport.BOXING,
          isActive: true,
          wins: recordParts.wins,
          losses: recordParts.losses,
          draws: recordParts.draws,
        }
      });

      fighterNameToId.set(normalizeName(athlete.name).toLowerCase(), fighter.id);
      console.log(`  ✓ ${firstName} ${lastName}`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterNameToId.size} Zuffa Boxing fighters\n`);
  return fighterNameToId;
}

/**
 * Import events and fights from scraped data
 */
// Default banner for Zuffa Boxing events (until they have event-specific banners)
const ZUFFA_BOXING_DEFAULT_BANNER = '/images/events/zuffa-boxing/zuffa-boxing-banner-default.jpg';

async function importZuffaEvents(
  eventsData: ScrapedZuffaEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} Zuffa Boxing events...`);

  for (const eventData of eventsData.events) {
    const eventDate = parseZuffaDate(eventData.eventDate);
    const location = [eventData.city, eventData.state, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    // Use event-specific image if available, otherwise use default banner
    const bannerImage = eventData.eventImageUrl || ZUFFA_BOXING_DEFAULT_BANNER;

    // Try to find existing event by URL or exact name
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventData.eventUrl },
          { name: eventData.eventName, promotion: 'Zuffa Boxing' },
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
          ufcUrl: eventData.eventUrl,
          promotion: 'Zuffa Boxing',
          bannerImage,
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
        }
      });
      console.log(`  ✓ Updated event: ${eventData.eventName}`);
    } else {
      // Create new event
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'Zuffa Boxing',
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage,
          ufcUrl: eventData.eventUrl,
          hasStarted: eventData.status === 'Live',
          isComplete: eventData.status === 'Complete',
        }
      });
      console.log(`  ✓ Created event: ${eventData.eventName}`);
    }

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];

    // Track scraped fight signatures for cancellation detection
    const scrapedFightSignatures = new Set<string>();

    for (const fightData of fights) {
      // Build signature for this scraped fight (sorted last names)
      const scrapedSignature = [
        normalizeName(fightData.fighterA.name).split(/\s+/).pop()?.toLowerCase() || '',
        normalizeName(fightData.fighterB.name).split(/\s+/).pop()?.toLowerCase() || ''
      ].sort().join('|');
      scrapedFightSignatures.add(scrapedSignature);
      // Find or create fighters (use normalized names for lookup)
      let fighter1Id = fighterNameToId.get(normalizeName(fightData.fighterA.name).toLowerCase());
      let fighter2Id = fighterNameToId.get(normalizeName(fightData.fighterB.name).toLowerCase());

      if (!fighter1Id) {
        const { firstName, lastName } = parseZuffaFighterName(fightData.fighterA.name);
        const recordParts = parseRecord(fightData.fighterA.record);
        try {
          const fighter = await prisma.fighter.upsert({
            where: { firstName_lastName: { firstName, lastName } },
            update: {},
            create: {
              firstName,
              lastName,
              gender: Gender.MALE,
              sport: Sport.BOXING,
              isActive: true,
              wins: recordParts.wins,
              losses: recordParts.losses,
              draws: recordParts.draws,
            }
          });
          fighter1Id = fighter.id;
          fighterNameToId.set(normalizeName(fightData.fighterA.name).toLowerCase(), fighter.id);
        } catch (e) {
          console.warn(`    ⚠ Failed to create fighter: ${fightData.fighterA.name}`);
          continue;
        }
      }

      if (!fighter2Id) {
        const { firstName, lastName } = parseZuffaFighterName(fightData.fighterB.name);
        const recordParts = parseRecord(fightData.fighterB.record);
        try {
          const fighter = await prisma.fighter.upsert({
            where: { firstName_lastName: { firstName, lastName } },
            update: {},
            create: {
              firstName,
              lastName,
              gender: Gender.MALE,
              sport: Sport.BOXING,
              isActive: true,
              wins: recordParts.wins,
              losses: recordParts.losses,
              draws: recordParts.draws,
            }
          });
          fighter2Id = fighter.id;
          fighterNameToId.set(normalizeName(fightData.fighterB.name).toLowerCase(), fighter.id);
        } catch (e) {
          console.warn(`    ⚠ Failed to create fighter: ${fightData.fighterB.name}`);
          continue;
        }
      }

      if (!fighter1Id || !fighter2Id) {
        console.warn(`    ⚠ Skipping fight - fighters not found: ${fightData.fighterA.name} vs ${fightData.fighterB.name}`);
        continue;
      }

      const weightClass = parseBoxingWeightClass(fightData.weightClass);
      const titleName = fightData.isTitle ? `${fightData.weightClass} Championship` : undefined;

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
            scheduledRounds: fightData.scheduledRounds || 10,
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
            scheduledRounds: fightData.scheduledRounds || 10,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
            hasStarted: false,
            isComplete: false,
          }
        });
        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to upsert fight:`, error);
      }
    }

    console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

    // ============== CANCELLATION DETECTION ==============
    // Check for fights in DB that were NOT in the scraped data (possibly cancelled)
    // Also check for previously cancelled fights that have reappeared (un-cancel them)

    const dbFights = await prisma.fight.findMany({
      where: { eventId: event.id },
      include: {
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
      }
    });

    let cancelledCount = 0;
    let unCancelledCount = 0;

    for (const dbFight of dbFights) {
      // Skip fights that are already complete
      if (dbFight.isComplete) {
        continue;
      }

      // Create signature for this DB fight
      const dbFightSignature = [
        dbFight.fighter1.lastName.toLowerCase().trim(),
        dbFight.fighter2.lastName.toLowerCase().trim()
      ].sort().join('|');

      const fightIsInScrapedData = scrapedFightSignatures.has(dbFightSignature);

      // Case 1: Fight was cancelled but has reappeared in scraped data -> UN-CANCEL it
      if (dbFight.isCancelled && fightIsInScrapedData) {
        console.log(`    ✅ Fight reappeared, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { isCancelled: false }
        });

        unCancelledCount++;
      }
      // Case 2: Fight is NOT cancelled and missing from scraped data -> CANCEL it
      else if (!dbFight.isCancelled && !fightIsInScrapedData) {
        console.log(`    ❌ Fight missing from scraped data, CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { isCancelled: true }
        });

        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      console.log(`    ⚠️  Marked ${cancelledCount} fights as cancelled`);
    }
    if (unCancelledCount > 0) {
      console.log(`    ✅ Un-cancelled ${unCancelledCount} fights`);
    }
  }

  console.log(`✅ Imported all Zuffa Boxing events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

/**
 * Main import function
 */
export async function importZuffaBoxingData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/zuffa-boxing/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/zuffa-boxing/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting Zuffa Boxing data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    // Read JSON files - events file may not exist if scraper found nothing
    let eventsJson: string;
    try {
      eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    } catch (e) {
      console.log('⚠ Events file not found - scraper likely found no events. Skipping import.');
      return;
    }
    const eventsData: ScrapedZuffaEventsData = JSON.parse(eventsJson);

    // Athletes file is optional
    let athletesData: ScrapedZuffaAthletesData = { athletes: [] };
    try {
      const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');
      athletesData = JSON.parse(athletesJson);
    } catch (e) {
      console.log('  Athletes file not found, will create fighters from event data');
    }

    // Step 1: Import fighters
    const fighterNameToId = await importZuffaFighters(athletesData);

    // Step 2: Import events and fights
    await importZuffaEvents(eventsData, fighterNameToId);

    console.log('✅ Zuffa Boxing data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during Zuffa Boxing import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  importZuffaBoxingData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
