// Gold Star Promotions Data Parser - Imports scraped JSON data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadFighterImage, uploadEventImage } from './imageStorage';
import { stripDiacritics } from '../utils/fighterMatcher';
import { eventTimeToUTC } from '../utils/timezone';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedGoldStarFighter {
  name: string;
  nickname?: string | null;
  url: string;
  imageUrl: string | null;
  localImagePath?: string;
  record?: string | null;
}

interface ScrapedGoldStarFight {
  fightId: string;
  order: number;
  cardType: string;
  weightClass: string;
  scheduledRounds: number;
  isTitle: boolean;
  fighterA: {
    name: string;
    nickname?: string | null;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    rank?: string;
    country: string;
    odds?: string;
  };
  fighterB: {
    name: string;
    nickname?: string | null;
    athleteUrl: string;
    imageUrl: string | null;
    record: string;
    rank?: string;
    country: string;
    odds?: string;
  };
}

interface ScrapedGoldStarEvent {
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
  fights?: ScrapedGoldStarFight[];
  localImagePath?: string;
}

interface ScrapedGoldStarEventsData {
  events: ScrapedGoldStarEvent[];
}

interface ScrapedGoldStarAthletesData {
  athletes: ScrapedGoldStarFighter[];
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse boxing weight class string to WeightClass enum.
 * Boxing uses different weight classes than MMA — closest matches used.
 */
function parseBoxingWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  const weightClassMapping: Record<string, WeightClass> = {
    'strawweight': WeightClass.STRAWWEIGHT,
    'light flyweight': WeightClass.STRAWWEIGHT,
    'flyweight': WeightClass.FLYWEIGHT,
    'super flyweight': WeightClass.FLYWEIGHT,
    'bantamweight': WeightClass.BANTAMWEIGHT,
    'super bantamweight': WeightClass.BANTAMWEIGHT,
    'featherweight': WeightClass.FEATHERWEIGHT,
    'super featherweight': WeightClass.FEATHERWEIGHT,
    'junior lightweight': WeightClass.FEATHERWEIGHT,
    'lightweight': WeightClass.LIGHTWEIGHT,
    'super lightweight': WeightClass.LIGHTWEIGHT,
    'junior welterweight': WeightClass.LIGHTWEIGHT,
    'welterweight': WeightClass.WELTERWEIGHT,
    'super welterweight': WeightClass.WELTERWEIGHT,
    'junior middleweight': WeightClass.WELTERWEIGHT,
    'middleweight': WeightClass.MIDDLEWEIGHT,
    'super middleweight': WeightClass.MIDDLEWEIGHT,
    'light heavyweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'cruiserweight': WeightClass.LIGHT_HEAVYWEIGHT,
    'heavyweight': WeightClass.HEAVYWEIGHT,
  };

  for (const [key, value] of Object.entries(weightClassMapping)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

function inferGenderFromWeightClass(weightClassStr: string): Gender {
  const normalized = (weightClassStr || '').toLowerCase();
  if (normalized.includes("women's") || normalized.includes('womens') || normalized.includes('female')) {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

function parseGoldStarFighterName(
  name: string
): { firstName: string; lastName: string } {
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
    return { firstName: '', lastName: stripDiacritics(nameParts[0]) };
  }

  const firstName = stripDiacritics(nameParts[0]);
  const lastName = stripDiacritics(nameParts.slice(1).join(' '));
  return { firstName, lastName };
}

function parseRecord(record: string): { wins: number; losses: number; draws: number; kos?: number } {
  const recordMatch = record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
  const koMatch = record.match(/(\d+)\s*KO/i);

  return {
    wins: recordMatch ? parseInt(recordMatch[1], 10) : 0,
    losses: recordMatch ? parseInt(recordMatch[2], 10) : 0,
    draws: recordMatch && recordMatch[3] ? parseInt(recordMatch[3], 10) : 0,
    kos: koMatch ? parseInt(koMatch[1], 10) : undefined
  };
}

function parseGoldStarDate(dateStr: string | null): Date {
  if (!dateStr) {
    return new Date('2099-01-01');
  }
  return new Date(dateStr);
}

/**
 * Parse event start time to Date object.
 * Gold Star Promotions is UK-based, so times are in Europe/London (handles GMT/BST).
 */
function parseGoldStarEventStartTime(
  eventDate: Date,
  eventStartTime: string | null | undefined
): Date | null {
  return eventTimeToUTC(eventDate, eventStartTime, 'Europe/London');
}

// ============== PARSER FUNCTIONS ==============

async function importGoldStarFighters(
  athletesData: ScrapedGoldStarAthletesData
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} Gold Star fighters...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseGoldStarFighterName(athlete.name);

    if (!firstName && !lastName) {
      console.warn(`  ⚠ Skipping athlete with no valid name: ${athlete.name}`);
      continue;
    }

    const recordParts = athlete.record ? parseRecord(athlete.record) : { wins: 0, losses: 0, draws: 0 };

    let profileImageUrl: string | null = null;
    if (athlete.imageUrl) {
      try {
        profileImageUrl = await uploadFighterImage(athlete.imageUrl, `${firstName} ${lastName}`);
      } catch (error) {
        console.warn(`  ⚠ Image upload failed for ${firstName} ${lastName}, using original URL`);
        profileImageUrl = athlete.imageUrl;
      }
    }

    try {
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
          gender: Gender.MALE,
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

  console.log(`✅ Imported ${fighterNameToId.size} Gold Star fighters\n`);
  return fighterNameToId;
}

async function importGoldStarEvents(
  eventsData: ScrapedGoldStarEventsData,
  fighterNameToId: Map<string, string>
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} Gold Star events...`);

  const uniqueEvents = new Map<string, ScrapedGoldStarEvent>();
  for (const event of eventsData.events) {
    if (!uniqueEvents.has(event.eventUrl)) {
      uniqueEvents.set(event.eventUrl, event);
    }
  }
  console.log(`  📋 ${uniqueEvents.size} unique events (${eventsData.events.length - uniqueEvents.size} duplicates removed)`);

  for (const [eventUrl, eventData] of Array.from(uniqueEvents.entries())) {
    const eventDate = parseGoldStarDate(eventData.eventDate);

    const location = [eventData.city, eventData.state, eventData.country]
      .filter(Boolean)
      .join(', ') || 'TBA';

    let bannerImageUrl: string | undefined;
    if (eventData.eventImageUrl) {
      try {
        bannerImageUrl = await uploadEventImage(eventData.eventImageUrl, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using original URL`);
        bannerImageUrl = eventData.eventImageUrl;
      }
    }

    const mainStartTime = parseGoldStarEventStartTime(
      eventDate,
      eventData.eventStartTime
    );
    if (!mainStartTime) {
      console.warn(`[GoldStar] ⚠️ No start time found for "${eventData.eventName}" (date: ${eventData.dateText}). Event will NOT auto-transition to LIVE.`);
    }

    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventUrl },
          { name: eventData.eventName, date: eventDate }
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
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          mainStartTime: mainStartTime || undefined,
          scraperType: 'tapology',
          ...(wasCancelled ? { eventStatus: 'UPCOMING', completionMethod: null } : {}),
        }
      });
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
          promotion: 'Gold Star',
          date: eventDate,
          venue: eventData.venue || undefined,
          location,
          bannerImage: bannerImageUrl,
          ufcUrl: eventUrl,
          mainStartTime: mainStartTime || undefined,
          scraperType: 'tapology',
          eventStatus: initialStatus,
        }
      });
    }

    console.log(`  ✓ Event: ${eventData.eventName} (${eventDate.toLocaleDateString()})`);

    let fightsImported = 0;
    const fights = eventData.fights || [];

    for (const fightData of fights) {
      const fighter1Id = fighterNameToId.get(fightData.fighterA.name.toLowerCase());
      const fighter2Id = fighterNameToId.get(fightData.fighterB.name.toLowerCase());

      if (!fighter1Id || !fighter2Id) {
        let f1Id = fighter1Id;
        let f2Id = fighter2Id;

        if (!f1Id) {
          const { firstName, lastName } = parseGoldStarFighterName(fightData.fighterA.name);
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
          const { firstName, lastName } = parseGoldStarFighterName(fightData.fighterB.name);
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

        await createGoldStarFight(event.id, f1Id, f2Id, fightData);
        fightsImported++;
        continue;
      }

      await createGoldStarFight(event.id, fighter1Id, fighter2Id, fightData);
      fightsImported++;
    }

    if (fights.length > 0) {
      console.log(`    ✓ Imported ${fightsImported}/${fights.length} fights`);

      const scrapedFighterNames = new Set<string>();
      for (const fightData of fights) {
        scrapedFighterNames.add(fightData.fighterA.name.toLowerCase().trim());
        scrapedFighterNames.add(fightData.fighterB.name.toLowerCase().trim());
      }

      const scrapedFightPairs = new Set<string>();
      for (const fightData of fights) {
        const pairKey = [
          fightData.fighterA.name.toLowerCase().trim(),
          fightData.fighterB.name.toLowerCase().trim()
        ].sort().join('|');
        scrapedFightPairs.add(pairKey);
      }

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
        const dbFightPairKey = [fighter1Name, fighter2Name].sort().join('|');

        if (!scrapedFightPairs.has(dbFightPairKey)) {
          const fighter1Rebooked = scrapedFighterNames.has(fighter1Name);
          const fighter2Rebooked = scrapedFighterNames.has(fighter2Name);

          if (fighter1Rebooked || fighter2Rebooked) {
            console.log(`    ❌ Cancelling fight (fighter rebooked): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
          } else {
            console.log(`    ❌ Cancelling fight (not in scraped data): ${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`);
          }

          await prisma.fight.update({
            where: { id: dbFight.id },
            data: { fightStatus: 'CANCELLED' }
          });
          cancelledCount++;
        }
      }

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

  // ============== EVENT-LEVEL CANCELLATION DETECTION ==============
  const scrapedEventUrls = new Set(Array.from(uniqueEvents.keys()));
  const scrapedEventNames = new Set(Array.from(uniqueEvents.values()).map(e => e.eventName.toLowerCase().trim()));

  const existingUpcomingEvents = await prisma.event.findMany({
    where: { promotion: 'Gold Star', eventStatus: 'UPCOMING' },
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
  if (eventsCancelled > 0) console.log(`  ⚠ Cancelled ${eventsCancelled} Gold Star events no longer on Tapology`);

  console.log(`✅ Imported all Gold Star events\n`);
}

async function createGoldStarFight(
  eventId: string,
  fighter1Id: string,
  fighter2Id: string,
  fightData: ScrapedGoldStarFight
): Promise<void> {
  const weightClass = parseBoxingWeightClass(fightData.weightClass);
  const gender = inferGenderFromWeightClass(fightData.weightClass);

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

export async function importGoldStarData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/goldstar/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/goldstar/latest-athletes.json'),
  } = options;

  console.log('\n🚀 Starting Gold Star data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    const eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');

    const eventsData: ScrapedGoldStarEventsData = JSON.parse(eventsJson);
    const athletesData: ScrapedGoldStarAthletesData = JSON.parse(athletesJson);

    const fighterNameToId = await importGoldStarFighters(athletesData);
    await importGoldStarEvents(eventsData, fighterNameToId);

    console.log('✅ Gold Star data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during Gold Star import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getGoldStarImportStats(): Promise<{
  totalFighters: number;
  totalEvents: number;
  totalFights: number;
  upcomingEvents: number;
}> {
  const [totalFighters, totalEvents, totalFights, upcomingEvents] = await Promise.all([
    prisma.fighter.count({ where: { sport: Sport.BOXING } }),
    prisma.event.count({ where: { promotion: 'Gold Star' } }),
    prisma.fight.count({
      where: {
        event: { promotion: 'Gold Star' }
      }
    }),
    prisma.event.count({
      where: {
        promotion: 'Gold Star',
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
