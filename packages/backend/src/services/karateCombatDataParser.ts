// Karate Combat Data Parser - Imports scraped Tapology data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stripDiacritics } from '../utils/fighterMatcher';
import { eventTimeToUTC } from '../utils/timezone';
import { uploadEventImage, uploadLocalFileToR2 } from './imageStorage';
import { syncFighterFollowMatchesForFight } from './notificationRuleEngine';
import { upsertFightSwapAware } from '../utils/fightUpsert';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedKarateCombatFighter {
  name: string;
  url?: string;
  imageUrl?: string | null;
  record?: string | null;
}

interface ScrapedKarateCombatFight {
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

interface ScrapedKarateCombatEvent {
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
  eventStartTime?: string | null;
  status: string;
  fights?: ScrapedKarateCombatFight[];
}

interface ScrapedKarateCombatEventsData {
  events: ScrapedKarateCombatEvent[];
}

interface ScrapedKarateCombatAthletesData {
  athletes: ScrapedKarateCombatFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Normalize name by removing accents/diacritics for consistent matching
 */
function normalizeName(name: string): string {
  return stripDiacritics(name).trim();
}

/**
 * Parse weight class string to WeightClass enum
 * Karate Combat uses MMA-style weight classes
 */
function parseKarateCombatWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  if (normalized.includes('heavyweight')) return WeightClass.HEAVYWEIGHT;
  if (normalized.includes('light heavy')) return WeightClass.LIGHT_HEAVYWEIGHT;
  if (normalized.includes('middleweight')) return WeightClass.MIDDLEWEIGHT;
  if (normalized.includes('welterweight')) return WeightClass.WELTERWEIGHT;
  if (normalized.includes('lightweight')) return WeightClass.LIGHTWEIGHT;
  if (normalized.includes('featherweight')) return WeightClass.FEATHERWEIGHT;
  if (normalized.includes('bantamweight')) return WeightClass.BANTAMWEIGHT;
  if (normalized.includes('flyweight')) return WeightClass.FLYWEIGHT;
  if (normalized.includes('strawweight')) return WeightClass.STRAWWEIGHT;

  // Try pound-based matching
  if (normalized.includes('265') || normalized.includes('250')) return WeightClass.HEAVYWEIGHT;
  if (normalized.includes('205')) return WeightClass.LIGHT_HEAVYWEIGHT;
  if (normalized.includes('185')) return WeightClass.MIDDLEWEIGHT;
  if (normalized.includes('170')) return WeightClass.WELTERWEIGHT;
  if (normalized.includes('155')) return WeightClass.LIGHTWEIGHT;
  if (normalized.includes('145')) return WeightClass.FEATHERWEIGHT;
  if (normalized.includes('135')) return WeightClass.BANTAMWEIGHT;
  if (normalized.includes('125')) return WeightClass.FLYWEIGHT;

  return null;
}

/**
 * Parse fighter name into first and last name
 */
function parseKarateCombatFighterName(name: string): { firstName: string; lastName: string } {
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
function parseKarateCombatDate(dateStr: string | null): Date {
  if (!dateStr) {
    return new Date('2099-01-01');
  }
  return new Date(dateStr);
}

// ============== PARSER FUNCTIONS ==============

/**
 * Import fighters from scraped data
 */
async function importKarateCombatFighters(
  athletesData: ScrapedKarateCombatAthletesData
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} Karate Combat fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseKarateCombatFighterName(athlete.name);

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
          sport: Sport.MMA,
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

  console.log(`✅ Imported ${fighterNameToId.size} Karate Combat fighters\n`);
  return fighterNameToId;
}

/**
 * Import events and fights from scraped data
 */
async function importKarateCombatEvents(
  eventsData: ScrapedKarateCombatEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} Karate Combat events...`);

  for (const eventData of eventsData.events) {
    const eventDate = parseKarateCombatDate(eventData.eventDate);
    // Parse event start time (Tapology defaults to ET)
    const mainStartTime = eventTimeToUTC(eventDate, eventData.eventStartTime, 'America/New_York');
    if (!mainStartTime) {
      console.warn(`[KarateCombat] ⚠️ No start time found for "${eventData.eventName}" (date: ${eventData.eventDate}). Event will NOT auto-transition to LIVE.`);
    }

    const location = [eventData.city, eventData.state, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    // Use event-specific image if available
    let bannerImage: string | undefined;
    if (eventData.eventImageUrl) {
      try {
        bannerImage = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using source URL`);
        bannerImage = eventData.eventImageUrl;
      }
    }

    // Try to find existing event by URL or exact name
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventData.eventUrl },
          { name: eventData.eventName, promotion: 'Karate Combat' },
        ]
      }
    });

    if (event) {
      // Update existing event - do NOT overwrite eventStatus (lifecycle service manages it),
      // except un-cancel events that reappear on the source site.
      const wasCancelled = event.eventStatus === 'CANCELLED';
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: eventData.venue || undefined,
          location,
          ufcUrl: eventData.eventUrl,
          promotion: 'Karate Combat',
          scraperType: 'tapology',
          bannerImage: bannerImage || undefined,
          ...(wasCancelled ? { eventStatus: 'UPCOMING', completionMethod: null } : {}),
        }
      });
      console.log(`  ✓ Updated event: ${eventData.eventName} (status unchanged: ${event.eventStatus})`);
      if (wasCancelled) {
        console.log(`    ✅ Un-cancelled event (reappeared on source): ${eventData.eventName}`);
        await prisma.fight.updateMany({
          where: { eventId: event.id, fightStatus: 'CANCELLED' },
          data: { fightStatus: 'UPCOMING' },
        });
      }
    } else {
      // Create new event - set initial status based on date
      const now = new Date();
      let initialStatus: 'UPCOMING' | 'COMPLETED' = 'UPCOMING';
      if (eventData.status === 'Complete' || eventDate < now) {
        initialStatus = 'COMPLETED';
      }

      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'Karate Combat',
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImage || undefined,
          ufcUrl: eventData.eventUrl,
          scraperType: 'tapology',
          eventStatus: initialStatus,
        }
      });
      console.log(`  ✓ Created event: ${eventData.eventName} (status: ${initialStatus})`);
    }

    // Import fights for this event
    let fightsImported = 0;
    const fights = eventData.fights || [];

    // ID-based sigs avoid collisions with shared/multi-word last names.
    const scrapedFightSignatures = new Set<string>();

    for (const fightData of fights) {
      // Find or create fighters
      let fighter1Id = fighterNameToId.get(normalizeName(fightData.fighterA.name).toLowerCase());
      let fighter2Id = fighterNameToId.get(normalizeName(fightData.fighterB.name).toLowerCase());

      if (!fighter1Id) {
        const { firstName, lastName } = parseKarateCombatFighterName(fightData.fighterA.name);
        const recordParts = parseRecord(fightData.fighterA.record);
        try {
          const fighter = await prisma.fighter.upsert({
            where: { firstName_lastName: { firstName, lastName } },
            update: {},
            create: {
              firstName,
              lastName,
              gender: Gender.MALE,
              sport: Sport.MMA,
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
        const { firstName, lastName } = parseKarateCombatFighterName(fightData.fighterB.name);
        const recordParts = parseRecord(fightData.fighterB.record);
        try {
          const fighter = await prisma.fighter.upsert({
            where: { firstName_lastName: { firstName, lastName } },
            update: {},
            create: {
              firstName,
              lastName,
              gender: Gender.MALE,
              sport: Sport.MMA,
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

      scrapedFightSignatures.add([fighter1Id, fighter2Id].sort().join('|'));

      const weightClass = parseKarateCombatWeightClass(fightData.weightClass);

      try {
        const upsertedFight = await upsertFightSwapAware(
          prisma,
          { eventId: event.id, fighter1Id, fighter2Id },
          {
            weightClass,
            isTitle: fightData.isTitle,
            scheduledRounds: fightData.scheduledRounds || 3,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
          },
          {
            eventId: event.id,
            fighter1Id,
            fighter2Id,
            weightClass,
            isTitle: fightData.isTitle,
            scheduledRounds: fightData.scheduledRounds || 3,
            orderOnCard: fightData.order,
            cardType: fightData.cardType,
            fightStatus: 'UPCOMING',
          },
        );
        await syncFighterFollowMatchesForFight(upsertedFight.id).catch(err =>
          console.warn('[FollowSync]', err)
        );
        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to upsert fight:`, error);
      }
    }

    console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

    // ============== CANCELLATION DETECTION ==============
    const dbFights = await prisma.fight.findMany({
      where: { eventId: event.id },
      include: {
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
      }
    });

    let cancelledCount = 0;
    let unCancelledCount = 0;

    // Cancellation guards. Once an event has gone LIVE/COMPLETED the live
    // tracker owns the fight list — daily scrapers must not cancel.
    // For UPCOMING events, require the scrape to return ≥75% of the DB's
    // non-cancelled fight count to guard against partial-page renders.
    const eventInProgress = event.eventStatus !== 'UPCOMING';
    const dbNonCancelledCount = dbFights.filter(f => f.fightStatus !== 'CANCELLED').length;
    const cancellationSafetyFloor = Math.max(2, Math.floor(dbNonCancelledCount * 0.75));
    const scrapeLooksComplete = scrapedFightSignatures.size >= cancellationSafetyFloor;
    const canCancelMissing =
      !eventInProgress && (dbNonCancelledCount === 0 || scrapeLooksComplete);

    if (eventInProgress) {
      console.log(`    ⏭️  Skipping cancellation (event is ${event.eventStatus} — live tracker owns this).`);
    } else if (!scrapeLooksComplete && dbNonCancelledCount > 0) {
      console.log(`    ⚠️  Skipping cancellation (scrape returned ${scrapedFightSignatures.size} fights, DB has ${dbNonCancelledCount} non-cancelled, need ≥${cancellationSafetyFloor}). Treating as partial scrape.`);
    }

    for (const dbFight of dbFights) {
      if (dbFight.fightStatus === 'COMPLETED') continue;

      const dbFightSignature = [dbFight.fighter1Id, dbFight.fighter2Id].sort().join('|');

      const fightIsInScrapedData = scrapedFightSignatures.has(dbFightSignature);

      if (dbFight.fightStatus === 'CANCELLED' && fightIsInScrapedData) {
        console.log(`    ✅ Fight reappeared, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { fightStatus: 'UPCOMING' }
        });
        unCancelledCount++;
      } else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData && canCancelMissing) {
        console.log(`    ❌ Fight missing from scraped data, CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { fightStatus: 'CANCELLED' }
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

  // ============== EVENT-LEVEL CANCELLATION DETECTION ==============
  const scrapedEventUrls = new Set(eventsData.events.map(e => e.eventUrl));
  const scrapedEventNames = new Set(eventsData.events.map(e => e.eventName.toLowerCase().trim()));

  const existingUpcomingEvents = await prisma.event.findMany({
    where: { promotion: 'Karate Combat', eventStatus: 'UPCOMING' },
    select: { id: true, name: true, ufcUrl: true },
  });

  let eventsCancelled = 0;
  for (const dbEvent of existingUpcomingEvents) {
    const isStillOnSite = dbEvent.ufcUrl
      ? scrapedEventUrls.has(dbEvent.ufcUrl)
      : scrapedEventNames.has(dbEvent.name.toLowerCase().trim());

    if (!isStillOnSite) {
      await prisma.event.update({ where: { id: dbEvent.id }, data: { eventStatus: 'CANCELLED' } });
      console.log(`  ❌ Cancelling event (no longer on Tapology): ${dbEvent.name}`);
      const cancelledFights = await prisma.fight.updateMany({
        where: { eventId: dbEvent.id, fightStatus: 'UPCOMING' },
        data: { fightStatus: 'CANCELLED' },
      });
      if (cancelledFights.count > 0) console.log(`    ❌ Cancelled ${cancelledFights.count} fights`);
      eventsCancelled++;
    }
  }
  if (eventsCancelled > 0) console.log(`  ⚠ Cancelled ${eventsCancelled} Karate Combat events no longer on Tapology`);

  console.log(`✅ Imported all Karate Combat events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

export async function importKarateCombatData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/karate-combat/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/karate-combat/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting Karate Combat data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    let eventsJson: string;
    try {
      eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    } catch (e) {
      console.log('⚠ Events file not found - scraper likely found no events. Skipping import.');
      return;
    }
    const eventsData: ScrapedKarateCombatEventsData = JSON.parse(eventsJson);

    let athletesData: ScrapedKarateCombatAthletesData = { athletes: [] };
    try {
      const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');
      athletesData = JSON.parse(athletesJson);
    } catch (e) {
      console.log('  Athletes file not found, will create fighters from event data');
    }

    const fighterNameToId = await importKarateCombatFighters(athletesData);
    await importKarateCombatEvents(eventsData, fighterNameToId);

    console.log('✅ Karate Combat data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during Karate Combat import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  importKarateCombatData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
