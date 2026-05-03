// Gamebred Data Parser - Imports scraped Tapology data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stripDiacritics } from '../utils/fighterMatcher';
import { eventTimeToUTC } from '../utils/timezone';
import { syncFighterFollowMatchesForFight } from './notificationRuleEngine';
import { getPromotionByCode } from '../config/promotionRegistry';
import { upsertFightSwapAware } from '../utils/fightUpsert';

const prisma = new PrismaClient();

const REGISTRY = getPromotionByCode('GAMEBRED');
const PROMOTION_NAME = REGISTRY?.canonicalPromotion ?? 'Gamebred';
const SCRAPER_TYPE = REGISTRY?.scraperType ?? 'tapology';

interface ScrapedFighter {
  name: string;
  url?: string;
  imageUrl?: string | null;
  record?: string | null;
}

interface ScrapedFight {
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

interface ScrapedEvent {
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
  fights?: ScrapedFight[];
}

interface ScrapedEventsData {
  events: ScrapedEvent[];
}

interface ScrapedAthletesData {
  athletes: ScrapedFighter[];
}

function normalizeName(name: string): string {
  return stripDiacritics(name).trim();
}

/** Parse MMA weight class strings (Gamebred is MMA — pound thresholds match UFC). */
function parseMmaWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();
  if (normalized.includes('heavyweight') || normalized.includes('265')) return WeightClass.HEAVYWEIGHT;
  if (normalized.includes('light heavy') || normalized.includes('205')) return WeightClass.LIGHT_HEAVYWEIGHT;
  if (normalized.includes('middleweight') || normalized.includes('185')) return WeightClass.MIDDLEWEIGHT;
  if (normalized.includes('welterweight') || normalized.includes('170')) return WeightClass.WELTERWEIGHT;
  if (normalized.includes('lightweight') || normalized.includes('155')) return WeightClass.LIGHTWEIGHT;
  if (normalized.includes('featherweight') || normalized.includes('145')) return WeightClass.FEATHERWEIGHT;
  if (normalized.includes('bantamweight') || normalized.includes('135')) return WeightClass.BANTAMWEIGHT;
  if (normalized.includes('flyweight') || normalized.includes('125')) return WeightClass.FLYWEIGHT;
  if (normalized.includes('strawweight') || normalized.includes('115')) return WeightClass.STRAWWEIGHT;
  return null;
}

function parseFighterName(name: string): { firstName: string; lastName: string } {
  const cleanName = normalizeName(name);
  const nameParts = cleanName.split(/\s+/);
  if (nameParts.length === 1) {
    return { firstName: '', lastName: nameParts[0] };
  }
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  return { firstName, lastName };
}

function parseRecord(record: string | null | undefined): { wins: number; losses: number; draws: number } {
  if (!record) return { wins: 0, losses: 0, draws: 0 };
  const recordMatch = record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  return {
    wins: recordMatch ? parseInt(recordMatch[1], 10) : 0,
    losses: recordMatch ? parseInt(recordMatch[2], 10) : 0,
    draws: recordMatch && recordMatch[3] ? parseInt(recordMatch[3], 10) : 0,
  };
}

function parseDate(dateStr: string | null): Date {
  if (!dateStr) return new Date('2099-01-01');
  return new Date(dateStr);
}

async function importFighters(athletesData: ScrapedAthletesData): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} ${PROMOTION_NAME} fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseFighterName(athlete.name);

    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    const recordParts = athlete.record ? parseRecord(athlete.record) : { wins: 0, losses: 0, draws: 0 };

    try {
      const fighter = await prisma.fighter.upsert({
        where: { firstName_lastName: { firstName, lastName } },
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
        },
      });

      fighterNameToId.set(normalizeName(athlete.name).toLowerCase(), fighter.id);
      console.log(`  ✓ ${firstName} ${lastName}`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterNameToId.size} ${PROMOTION_NAME} fighters\n`);
  return fighterNameToId;
}

async function importEvents(
  eventsData: ScrapedEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} ${PROMOTION_NAME} events...`);

  for (const eventData of eventsData.events) {
    const eventDate = parseDate(eventData.eventDate);
    const mainStartTime = eventTimeToUTC(eventDate, eventData.eventStartTime, 'America/New_York');
    if (!mainStartTime) {
      console.warn(`[Gamebred] ⚠️ No start time found for "${eventData.eventName}" (date: ${eventData.eventDate}). Event will NOT auto-transition to LIVE.`);
    }

    const location = [eventData.city, eventData.state, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    const bannerImage = eventData.eventImageUrl || undefined;

    // Look up by ufcUrl ONLY. Tapology event ID is the unique stable identifier.
    // Falling back to (promotion + name) collides when two upcoming events share
    // a generic title (e.g. "Gamebred Bareknuckle MMA" before headliners are
    // announced) and merges their fights into one row.
    let event = await prisma.event.findFirst({
      where: { ufcUrl: eventData.eventUrl },
    });

    const updateData = {
      name: eventData.eventName,
      date: eventDate,
      mainStartTime: mainStartTime || undefined,
      venue: eventData.venue || undefined,
      location,
      ufcUrl: eventData.eventUrl,
      promotion: PROMOTION_NAME,
      scraperType: SCRAPER_TYPE,
      ...(bannerImage ? { bannerImage } : {}),
    };

    if (event) {
      const wasCancelled = event.eventStatus === 'CANCELLED';
      const updateDataWithUncancel = {
        ...updateData,
        ...(wasCancelled ? { eventStatus: 'UPCOMING' as const, completionMethod: null } : {}),
      };
      try {
        event = await prisma.event.update({
          where: { id: event.id },
          data: updateDataWithUncancel,
        });
        console.log(`  ✓ Updated event: ${eventData.eventName} (status unchanged: ${event.eventStatus})`);
      } catch (err: any) {
        if (err.code === 'P2002' && err.meta?.target?.includes('ufcUrl')) {
          const { ufcUrl: _omit, ...safeUpdate } = updateDataWithUncancel;
          event = await prisma.event.update({
            where: { id: event.id },
            data: safeUpdate,
          });
          console.log(`  ⚠ Updated event without ufcUrl (duplicate row owns it): ${eventData.eventName}`);
        } else {
          throw err;
        }
      }
      if (wasCancelled) {
        console.log(`    ✅ Un-cancelled event (reappeared on source): ${eventData.eventName}`);
        await prisma.fight.updateMany({
          where: { eventId: event.id, fightStatus: 'CANCELLED' },
          data: { fightStatus: 'UPCOMING' },
        });
      }
    } else {
      const now = new Date();
      const initialStatus = (eventData.status === 'Complete' || eventDate < now) ? 'COMPLETED' : 'UPCOMING';
      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: PROMOTION_NAME,
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: eventData.venue || undefined,
          location,
          bannerImage,
          ufcUrl: eventData.eventUrl,
          scraperType: SCRAPER_TYPE,
          eventStatus: initialStatus,
        },
      });
      console.log(`  ✓ Created event: ${eventData.eventName}`);
    }

    let fightsImported = 0;
    const fights = eventData.fights || [];

    const scrapedFightSignatures = new Set<string>();

    for (const fightData of fights) {
      let fighter1Id = fighterNameToId.get(normalizeName(fightData.fighterA.name).toLowerCase());
      let fighter2Id = fighterNameToId.get(normalizeName(fightData.fighterB.name).toLowerCase());

      if (!fighter1Id) {
        const { firstName, lastName } = parseFighterName(fightData.fighterA.name);
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
            },
          });
          fighter1Id = fighter.id;
          fighterNameToId.set(normalizeName(fightData.fighterA.name).toLowerCase(), fighter.id);
        } catch (e) {
          console.warn(`    ⚠ Failed to create fighter: ${fightData.fighterA.name}`);
          continue;
        }
      }

      if (!fighter2Id) {
        const { firstName, lastName } = parseFighterName(fightData.fighterB.name);
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
            },
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

      const weightClass = parseMmaWeightClass(fightData.weightClass);
      const titleName = fightData.isTitle ? `${fightData.weightClass} Championship` : undefined;

      try {
        const upsertedFight = await upsertFightSwapAware(
          prisma,
          { eventId: event.id, fighter1Id, fighter2Id },
          {
            weightClass,
            isTitle: fightData.isTitle,
            titleName,
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
            titleName,
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

    const dbFights = await prisma.fight.findMany({
      where: { eventId: event.id },
      include: {
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
      },
    });

    let cancelledCount = 0;
    let unCancelledCount = 0;

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
          data: { fightStatus: 'UPCOMING' },
        });
        unCancelledCount++;
      } else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData && canCancelMissing) {
        console.log(`    ❌ Fight missing from scraped data, CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { fightStatus: 'CANCELLED' },
        });
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) console.log(`    ⚠️  Marked ${cancelledCount} fights as cancelled`);
    if (unCancelledCount > 0) console.log(`    ✅ Un-cancelled ${unCancelledCount} fights`);
  }

  // Event-level cancellation detection
  const scrapedEventUrls = new Set(eventsData.events.map(e => e.eventUrl));
  const scrapedEventNames = new Set(eventsData.events.map(e => e.eventName.toLowerCase().trim()));

  const existingUpcomingEvents = await prisma.event.findMany({
    where: { promotion: PROMOTION_NAME, eventStatus: 'UPCOMING' },
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
  if (eventsCancelled > 0) console.log(`  ⚠ Cancelled ${eventsCancelled} ${PROMOTION_NAME} events no longer on Tapology`);

  console.log(`✅ Imported all ${PROMOTION_NAME} events\n`);
}

export async function importGamebredData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/gamebred/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/gamebred/latest-athletes.json'),
  } = options;

  console.log(`\n🚀 Starting ${PROMOTION_NAME} data import...`);
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const eventsData: ScrapedEventsData = JSON.parse(eventsJson);

    let athletesData: ScrapedAthletesData = { athletes: [] };
    try {
      const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');
      athletesData = JSON.parse(athletesJson);
    } catch (e) {
      console.log('  Athletes file not found, will create fighters from event data');
    }

    const fighterNameToId = await importFighters(athletesData);
    await importEvents(eventsData, fighterNameToId);

    console.log(`✅ ${PROMOTION_NAME} data import completed successfully!\n`);
  } catch (error) {
    console.error(`❌ Error during ${PROMOTION_NAME} import:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  importGamebredData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
