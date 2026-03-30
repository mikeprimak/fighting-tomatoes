// RAF (Real American Freestyle) Data Parser - Imports scraped data into database
import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stripDiacritics } from '../utils/fighterMatcher';
import { eventTimeToUTC } from '../utils/timezone';
import { uploadEventImage } from './imageStorage';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ScrapedRAFFighter {
  name: string;
  slug?: string;
  imageUrl?: string;
  country?: string;
  age?: string;
  club?: string;
  hometown?: string;
  isChampion?: boolean;
}

interface ScrapedRAFFight {
  order: number;
  weightClass: string;
  isTitle: boolean;
  isInterim?: boolean;
  fighter1: ScrapedRAFFighter;
  fighter2: ScrapedRAFFighter;
  winner: 'fighter1' | 'fighter2' | null;
  scores?: {
    total: { fighter1: string; fighter2: string };
    rounds: { fighter1: string; fighter2: string }[];
  } | null;
  takedowns?: { fighter1: string; fighter2: string } | null;
  status: string;
}

interface ScrapedRAFEvent {
  eventName: string;
  eventUrl: string;
  venue?: string;
  location?: string;
  dateText?: string;
  eventDate: string | null;
  startTime?: string | null;
  timezone?: string;
  bannerImage?: string;
  status: string;
  fights: ScrapedRAFFight[];
}

interface ScrapedRAFData {
  events: ScrapedRAFEvent[];
  scrapedAt: string;
}

interface ScrapedRAFAthletesData {
  athletes: {
    name: string;
    slug?: string;
    imageUrl?: string;
    country?: string;
    club?: string;
    hometown?: string;
  }[];
}

// ============== UTILITY FUNCTIONS ==============

function normalizeName(name: string): string {
  return stripDiacritics(name).trim();
}

/**
 * Parse wrestling weight class to WeightClass enum.
 * RAF uses: Featherweight, Lightweight, Welterweight, Middleweight,
 *           Cruiserweight, Light Heavyweight, Heavyweight, Unlimited
 */
function parseRAFWeightClass(weightClassStr: string): WeightClass | null {
  const normalized = weightClassStr.toLowerCase().trim();

  if (normalized.includes('featherweight')) return WeightClass.FEATHERWEIGHT;
  if (normalized.includes('lightweight')) return WeightClass.LIGHTWEIGHT;
  if (normalized.includes('welterweight')) return WeightClass.WELTERWEIGHT;
  if (normalized.includes('middleweight')) return WeightClass.MIDDLEWEIGHT;
  if (normalized.includes('cruiserweight')) return WeightClass.HEAVYWEIGHT; // No MMA cruiserweight, map to HW
  if (normalized.includes('light heavy')) return WeightClass.LIGHT_HEAVYWEIGHT;
  if (normalized.includes('heavyweight')) return WeightClass.HEAVYWEIGHT;
  if (normalized.includes('unlimited')) return WeightClass.SUPER_HEAVYWEIGHT;

  return null;
}

/**
 * Detect gender from fighter name context (Kennedy Blades is women's)
 * RAF has women's fights — check if the weight class display is different or
 * look for known women's fighters. For now, default to MALE unless obviously female.
 */
function detectGender(fight: ScrapedRAFFight): Gender {
  // Known women's athletes in RAF
  const knownWomen = ['kennedy blades', 'milana dudieva'];
  const f1 = fight.fighter1.name.toLowerCase();
  const f2 = fight.fighter2.name.toLowerCase();
  if (knownWomen.includes(f1) || knownWomen.includes(f2)) return Gender.FEMALE;
  return Gender.MALE;
}

function parseFighterName(name: string): { firstName: string; lastName: string } {
  const cleanName = normalizeName(name);
  const nameParts = cleanName.split(/\s+/);
  if (nameParts.length === 1) {
    return { firstName: '', lastName: nameParts[0] };
  }
  return { firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') };
}

/**
 * Parse event date string to a Date object (date only, no time).
 */
function parseRAFEventDate(dateStr: string | null): Date {
  if (!dateStr) return new Date('2099-01-01');
  return new Date(dateStr);
}

// ============== IMPORT FUNCTIONS ==============

async function importRAFFighters(
  athletesData: ScrapedRAFAthletesData,
): Promise<Map<string, string>> {
  const fighterNameToId = new Map<string, string>();

  console.log(`\n📦 Importing ${athletesData.athletes.length} RAF athletes...`);

  for (const athlete of athletesData.athletes) {
    const { firstName, lastName } = parseFighterName(athlete.name);
    if (!firstName && !lastName) continue;

    try {
      // Upload athlete image to R2 if available
      let profileImage: string | undefined;
      if (athlete.imageUrl && athlete.imageUrl.startsWith('http')) {
        profileImage = athlete.imageUrl;
      }

      const fighter = await prisma.fighter.upsert({
        where: {
          firstName_lastName: { firstName, lastName },
        },
        update: {
          profileImage: profileImage || undefined,
        },
        create: {
          firstName,
          lastName,
          profileImage: profileImage || undefined,
          gender: Gender.MALE,
          sport: Sport.MMA,
          isActive: true,
        },
      });

      fighterNameToId.set(normalizeName(athlete.name).toLowerCase(), fighter.id);
      console.log(`  ✓ ${firstName} ${lastName}`);
    } catch (error) {
      console.error(`  ✗ Failed to import ${firstName} ${lastName}:`, error);
    }
  }

  console.log(`✅ Imported ${fighterNameToId.size} RAF athletes\n`);
  return fighterNameToId;
}

async function importRAFEvents(
  eventsData: ScrapedRAFData,
  fighterNameToId: Map<string, string>,
): Promise<void> {
  console.log(`\n📦 Importing ${eventsData.events.length} RAF events...`);

  for (const eventData of eventsData.events) {
    const eventDate = parseRAFEventDate(eventData.eventDate);
    // Use eventTimeToUTC (same utility as other scrapers) — startTime is "8:00 PM" format
    const mainStartTime = eventTimeToUTC(eventDate, eventData.startTime, 'America/New_York');

    const location = eventData.location || eventData.venue || 'TBA';
    const venue = eventData.venue || '';

    // Upload banner image
    let bannerImage: string | undefined;
    if (eventData.bannerImage) {
      try {
        bannerImage = await uploadEventImage(eventData.bannerImage, eventData.eventName);
      } catch (error) {
        console.warn(`  ⚠ Banner upload failed for ${eventData.eventName}, using source URL`);
        bannerImage = eventData.bannerImage;
      }
    }

    // Find or create event
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { ufcUrl: eventData.eventUrl },
          { name: eventData.eventName, promotion: 'RAF' },
        ],
      },
    });

    if (event) {
      event = await prisma.event.update({
        where: { id: event.id },
        data: {
          name: eventData.eventName,
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: venue || undefined,
          location,
          ufcUrl: eventData.eventUrl || undefined,
          promotion: 'RAF',
          scraperType: 'raf',
          bannerImage: bannerImage || undefined,
        },
      });
      console.log(`  ✓ Updated event: ${eventData.eventName} (status unchanged: ${event.eventStatus})`);
    } else {
      // Trust the gallery status (based on "buy tickets" vs "view recap" buttons)
      // over date comparison, since eventDate is midnight which can be before now
      // even on event day
      let initialStatus: 'UPCOMING' | 'COMPLETED' = 'UPCOMING';
      if (eventData.status === 'Complete') {
        initialStatus = 'COMPLETED';
      }

      event = await prisma.event.create({
        data: {
          name: eventData.eventName,
          promotion: 'RAF',
          date: eventDate,
          mainStartTime: mainStartTime || undefined,
          venue: venue || undefined,
          location,
          bannerImage: bannerImage || undefined,
          ufcUrl: eventData.eventUrl || undefined,
          scraperType: 'raf',
          eventStatus: initialStatus,
        },
      });
      console.log(`  ✓ Created event: ${eventData.eventName} (status: ${initialStatus})`);
    }

    // Import fights
    let fightsImported = 0;
    const scrapedFightSignatures = new Set<string>();

    for (const fightData of eventData.fights) {
      // Build signature for cancellation detection
      const scrapedSignature = [
        normalizeName(fightData.fighter1.name).split(/\s+/).pop()?.toLowerCase() || '',
        normalizeName(fightData.fighter2.name).split(/\s+/).pop()?.toLowerCase() || '',
      ].sort().join('|');
      scrapedFightSignatures.add(scrapedSignature);

      // Find or create fighters
      let fighter1Id = fighterNameToId.get(normalizeName(fightData.fighter1.name).toLowerCase());
      let fighter2Id = fighterNameToId.get(normalizeName(fightData.fighter2.name).toLowerCase());

      const gender = detectGender(fightData);

      if (!fighter1Id) {
        const { firstName, lastName } = parseFighterName(fightData.fighter1.name);
        try {
          const fighter = await prisma.fighter.upsert({
            where: { firstName_lastName: { firstName, lastName } },
            update: {},
            create: {
              firstName,
              lastName,
              gender,
              sport: Sport.MMA,
              isActive: true,
              profileImage: fightData.fighter1.imageUrl || undefined,
            },
          });
          fighter1Id = fighter.id;
          fighterNameToId.set(normalizeName(fightData.fighter1.name).toLowerCase(), fighter.id);
        } catch {
          console.warn(`    ⚠ Failed to create fighter: ${fightData.fighter1.name}`);
          continue;
        }
      }

      if (!fighter2Id) {
        const { firstName, lastName } = parseFighterName(fightData.fighter2.name);
        try {
          const fighter = await prisma.fighter.upsert({
            where: { firstName_lastName: { firstName, lastName } },
            update: {},
            create: {
              firstName,
              lastName,
              gender,
              sport: Sport.MMA,
              isActive: true,
              profileImage: fightData.fighter2.imageUrl || undefined,
            },
          });
          fighter2Id = fighter.id;
          fighterNameToId.set(normalizeName(fightData.fighter2.name).toLowerCase(), fighter.id);
        } catch {
          console.warn(`    ⚠ Failed to create fighter: ${fightData.fighter2.name}`);
          continue;
        }
      }

      if (!fighter1Id || !fighter2Id) continue;

      const weightClass = parseRAFWeightClass(fightData.weightClass);

      // Determine winner for completed fights
      let winnerId: string | null = null;
      let method: string | null = null;
      if (fightData.winner === 'fighter1') winnerId = fighter1Id;
      else if (fightData.winner === 'fighter2') winnerId = fighter2Id;

      // Build method string from scores if available
      if (winnerId && fightData.scores) {
        const { total } = fightData.scores;
        method = `Decision (${total.fighter1}-${total.fighter2})`;
      }

      const fightStatus = fightData.winner ? 'COMPLETED' : 'UPCOMING';

      try {
        await prisma.fight.upsert({
          where: {
            eventId_fighter1Id_fighter2Id: {
              eventId: event.id,
              fighter1Id,
              fighter2Id,
            },
          },
          update: {
            weightClass,
            isTitle: fightData.isTitle,
            scheduledRounds: 3, // RAF matches are 3 rounds
            orderOnCard: fightData.order,
            cardType: 'Main Card', // RAF has no card sections
            ...(fightStatus === 'COMPLETED' ? {
              fightStatus: 'COMPLETED',
              winner: winnerId,
              method,
            } : {}),
          },
          create: {
            eventId: event.id,
            fighter1Id,
            fighter2Id,
            weightClass,
            isTitle: fightData.isTitle,
            scheduledRounds: 3,
            orderOnCard: fightData.order,
            cardType: 'Main Card',
            fightStatus,
            winner: winnerId,
            method,
          },
        });
        fightsImported++;
      } catch (error) {
        console.warn(`    ⚠ Failed to upsert fight:`, error);
      }
    }

    console.log(`    ✓ Imported ${fightsImported}/${eventData.fights.length} fights`);

    // ============== CANCELLATION DETECTION ==============
    const dbFights = await prisma.fight.findMany({
      where: { eventId: event.id },
      include: {
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
      },
    });

    let cancelledCount = 0;
    let unCancelledCount = 0;

    for (const dbFight of dbFights) {
      if (dbFight.fightStatus === 'COMPLETED') continue;

      const dbFightSignature = [
        stripDiacritics(dbFight.fighter1.lastName).toLowerCase().trim(),
        stripDiacritics(dbFight.fighter2.lastName).toLowerCase().trim(),
      ].sort().join('|');

      const fightIsInScrapedData = scrapedFightSignatures.has(dbFightSignature);

      if (dbFight.fightStatus === 'CANCELLED' && fightIsInScrapedData) {
        console.log(`    ✅ Fight reappeared, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { fightStatus: 'UPCOMING' },
        });
        unCancelledCount++;
      } else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData) {
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

  console.log(`✅ Imported all RAF events\n`);
}

// ============== MAIN IMPORT FUNCTION ==============

export async function importRAFData(options: {
  eventsFilePath?: string;
  athletesFilePath?: string;
} = {}): Promise<void> {
  const {
    eventsFilePath = path.join(__dirname, '../../scraped-data/raf/latest-events.json'),
    athletesFilePath = path.join(__dirname, '../../scraped-data/raf/latest-athletes.json'),
  } = options;

  console.log('\n🤼 Starting RAF data import...');
  console.log(`📁 Events file: ${eventsFilePath}`);
  console.log(`📁 Athletes file: ${athletesFilePath}\n`);

  try {
    let eventsJson: string;
    try {
      eventsJson = await fs.readFile(eventsFilePath, 'utf-8');
    } catch {
      console.log('⚠ Events file not found - scraper likely found no events. Skipping import.');
      return;
    }
    const eventsData: ScrapedRAFData = JSON.parse(eventsJson);

    let athletesData: ScrapedRAFAthletesData = { athletes: [] };
    try {
      const athletesJson = await fs.readFile(athletesFilePath, 'utf-8');
      athletesData = JSON.parse(athletesJson);
    } catch {
      console.log('  Athletes file not found, will create fighters from event data');
    }

    const fighterNameToId = await importRAFFighters(athletesData);
    await importRAFEvents(eventsData, fighterNameToId);

    console.log('✅ RAF data import completed successfully!\n');
  } catch (error) {
    console.error('❌ Error during RAF import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  importRAFData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
