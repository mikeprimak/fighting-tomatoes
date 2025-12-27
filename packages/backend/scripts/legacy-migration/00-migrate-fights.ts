/**
 * 00-migrate-fights.ts
 *
 * Migrates all fights, events, and fighters from legacy fightingtomatoes.com.
 * This MUST run before other migration scripts because ratings/reviews/tags
 * need fights to exist.
 *
 * Prerequisites:
 * - Run 01-parse-legacy-data.ts first (to create fights.json)
 *
 * What this script does:
 * 1. Creates Events from unique (promotion, eventname, date) combinations
 * 2. Creates Fighters from unique (firstname, lastname) combinations
 * 3. Creates Fights linking events and fighters
 * 4. Outputs fight-mapping.json for use by rating/review/tag scripts
 *
 * Usage: npx ts-node scripts/legacy-migration/00-migrate-fights.ts
 *
 * Options:
 *   --dry-run: Show what would be done without making changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { LegacyFight, FightMapping } from './types';

const prisma = new PrismaClient();

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');
const FIGHTS_FILE = path.join(DATA_DIR, 'fights.json');
const FIGHT_MAPPING_FILE = path.join(DATA_DIR, 'fight-mapping.json');

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// Normalize fighter name
function normalizeName(name: string | null | undefined | number): string {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase();
}

// Create a unique key for an event
function eventKey(promotion: string, eventname: string, date: string): string {
  return `${promotion}|${eventname}|${date}`;
}

// Create a unique key for a fighter
function fighterKey(firstName: string, lastName: string): string {
  return `${normalizeName(firstName)}|${normalizeName(lastName)}`;
}

// Valid weight class values from Prisma enum
type WeightClassEnum = 'STRAWWEIGHT' | 'FLYWEIGHT' | 'BANTAMWEIGHT' | 'FEATHERWEIGHT' |
  'LIGHTWEIGHT' | 'WELTERWEIGHT' | 'MIDDLEWEIGHT' | 'LIGHT_HEAVYWEIGHT' | 'HEAVYWEIGHT' |
  'SUPER_HEAVYWEIGHT' | 'WOMENS_STRAWWEIGHT' | 'WOMENS_FLYWEIGHT' | 'WOMENS_BANTAMWEIGHT' |
  'WOMENS_FEATHERWEIGHT';

// Map legacy weight class to enum
function mapWeightClass(legacy: string | number | null): WeightClassEnum | undefined {
  if (!legacy) return undefined;

  const legacyStr = String(legacy).toLowerCase();

  const mapping: Record<string, WeightClassEnum> = {
    'heavyweight': 'HEAVYWEIGHT',
    'light heavyweight': 'LIGHT_HEAVYWEIGHT',
    'middleweight': 'MIDDLEWEIGHT',
    'welterweight': 'WELTERWEIGHT',
    'lightweight': 'LIGHTWEIGHT',
    'featherweight': 'FEATHERWEIGHT',
    'bantamweight': 'BANTAMWEIGHT',
    'flyweight': 'FLYWEIGHT',
    'strawweight': 'STRAWWEIGHT',
    "women's strawweight": 'WOMENS_STRAWWEIGHT',
    "women's flyweight": 'WOMENS_FLYWEIGHT',
    "women's bantamweight": 'WOMENS_BANTAMWEIGHT',
    "women's featherweight": 'WOMENS_FEATHERWEIGHT',
  };

  return mapping[legacyStr];
}

// Map legacy card position to cardType
function mapCardType(prelimcode: string | null): string {
  if (!prelimcode) return 'Main Card';
  const code = prelimcode.toLowerCase();
  if (code.includes('early')) return 'Early Prelims';
  if (code.includes('prelim')) return 'Prelims';
  return 'Main Card';
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIGHTS MIGRATION (Events + Fighters + Fights)');
  console.log(isDryRun ? '*** DRY RUN MODE - No changes will be made ***' : '');
  console.log('='.repeat(60));
  console.log('');

  // Load legacy fights
  console.log('[1/5] Loading legacy fights...');
  if (!fs.existsSync(FIGHTS_FILE)) {
    console.error('ERROR: fights.json not found. Run 01-parse-legacy-data.ts first.');
    process.exit(1);
  }
  const legacyFights: LegacyFight[] = JSON.parse(fs.readFileSync(FIGHTS_FILE, 'utf-8'));
  console.log(`    Loaded ${legacyFights.length} legacy fights`);

  // Build unique events and fighters
  console.log('[2/5] Extracting unique events and fighters...');

  const uniqueEvents = new Map<string, { promotion: string; eventName: string; date: Date }>();
  const uniqueFighters = new Map<string, { firstName: string; lastName: string; nickname: string; gender: 'MALE' | 'FEMALE' }>();

  let skippedInvalidDate = 0;

  for (const fight of legacyFights) {
    // Safely convert event name to string (can be number like 262 for UFC events)
    const eventName = String(fight.eventname || '');
    const promotion = String(fight.promotion || '');

    // Validate and parse date
    const parsedDate = new Date(fight.date);
    if (isNaN(parsedDate.getTime())) {
      skippedInvalidDate++;
      continue; // Skip fights with invalid dates
    }

    // Extract event
    const evtKey = eventKey(promotion, eventName, fight.date);
    if (!uniqueEvents.has(evtKey)) {
      uniqueEvents.set(evtKey, {
        promotion,
        eventName,
        date: parsedDate,
      });
    }

    // Determine gender from legacy malefemale field
    const gender: 'MALE' | 'FEMALE' = (fight as any).malefemale === 'F' ? 'FEMALE' : 'MALE';

    // Safely extract fighter names (may be null/number in legacy data)
    const f1fn = typeof fight.f1fn === 'string' ? fight.f1fn : '';
    const f1ln = typeof fight.f1ln === 'string' ? fight.f1ln : '';
    const f1nn = typeof fight.f1nn === 'string' ? fight.f1nn : '';
    const f2fn = typeof fight.f2fn === 'string' ? fight.f2fn : '';
    const f2ln = typeof fight.f2ln === 'string' ? fight.f2ln : '';
    const f2nn = typeof fight.f2nn === 'string' ? fight.f2nn : '';

    // Extract fighter 1
    const f1Key = fighterKey(f1fn, f1ln);
    if (f1Key !== '|' && !uniqueFighters.has(f1Key)) {
      uniqueFighters.set(f1Key, {
        firstName: f1fn,
        lastName: f1ln,
        nickname: f1nn,
        gender,
      });
    }

    // Extract fighter 2
    const f2Key = fighterKey(f2fn, f2ln);
    if (f2Key !== '|' && !uniqueFighters.has(f2Key)) {
      uniqueFighters.set(f2Key, {
        firstName: f2fn,
        lastName: f2ln,
        nickname: f2nn,
        gender,
      });
    }
  }

  console.log(`    Found ${uniqueEvents.size} unique events`);
  console.log(`    Found ${uniqueFighters.size} unique fighters`);
  if (skippedInvalidDate > 0) {
    console.log(`    Skipped ${skippedInvalidDate} fights with invalid dates`);
  }

  // Create events
  console.log('[3/5] Creating events...');
  const eventIdMap = new Map<string, string>(); // eventKey -> new UUID
  let eventsCreated = 0;
  let eventsExisting = 0;

  for (const [key, evt] of uniqueEvents) {
    // Check if event already exists
    const existing = await prisma.event.findFirst({
      where: {
        promotion: evt.promotion,
        name: evt.eventName,
        date: evt.date,
      },
    });

    if (existing) {
      eventIdMap.set(key, existing.id);
      eventsExisting++;
    } else if (!isDryRun) {
      try {
        const newEvent = await prisma.event.create({
          data: {
            promotion: evt.promotion,
            name: evt.eventName,
            date: evt.date,
            hasStarted: true,
            isComplete: true,
          },
        });
        eventIdMap.set(key, newEvent.id);
        eventsCreated++;
      } catch (err: unknown) {
        // Handle unique constraint violation (name+date already exists)
        const existingByName = await prisma.event.findFirst({
          where: { name: evt.eventName, date: evt.date },
        });
        if (existingByName) {
          eventIdMap.set(key, existingByName.id);
          eventsExisting++;
        }
      }
    } else {
      eventsCreated++;
    }

    if ((eventsCreated + eventsExisting) % 100 === 0) {
      console.log(`    Processed ${eventsCreated + eventsExisting}/${uniqueEvents.size} events...`);
    }
  }
  console.log(`    Events: ${eventsCreated} created, ${eventsExisting} already existed`);

  // Create fighters
  console.log('[4/5] Creating fighters...');
  const fighterIdMap = new Map<string, string>(); // fighterKey -> new UUID
  let fightersCreated = 0;
  let fightersExisting = 0;

  for (const [key, fighter] of uniqueFighters) {
    // Check if fighter already exists (by name)
    const existing = await prisma.fighter.findFirst({
      where: {
        firstName: { equals: fighter.firstName, mode: 'insensitive' },
        lastName: { equals: fighter.lastName, mode: 'insensitive' },
      },
    });

    if (existing) {
      fighterIdMap.set(key, existing.id);
      fightersExisting++;
    } else if (!isDryRun) {
      try {
        const newFighter = await prisma.fighter.create({
          data: {
            firstName: fighter.firstName,
            lastName: fighter.lastName,
            nickname: fighter.nickname || null,
            gender: fighter.gender,
          },
        });
        fighterIdMap.set(key, newFighter.id);
        fightersCreated++;
      } catch (err: unknown) {
        // Skip fighters that fail to create (duplicates, etc.)
        console.log(`    Warning: Could not create fighter ${fighter.firstName} ${fighter.lastName}`);
      }
    } else {
      fightersCreated++;
    }

    if ((fightersCreated + fightersExisting) % 500 === 0) {
      console.log(`    Processed ${fightersCreated + fightersExisting}/${uniqueFighters.size} fighters...`);
    }
  }
  console.log(`    Fighters: ${fightersCreated} created, ${fightersExisting} already existed`);

  // Create fights
  console.log('[5/5] Creating fights...');
  const fightMappings: FightMapping[] = [];
  let fightsCreated = 0;
  let fightsExisting = 0;
  let fightsSkipped = 0;

  for (let i = 0; i < legacyFights.length; i++) {
    const legacy = legacyFights[i];

    // Safely extract fighter names
    const f1fn = typeof legacy.f1fn === 'string' ? legacy.f1fn : '';
    const f1ln = typeof legacy.f1ln === 'string' ? legacy.f1ln : '';
    const f2fn = typeof legacy.f2fn === 'string' ? legacy.f2fn : '';
    const f2ln = typeof legacy.f2ln === 'string' ? legacy.f2ln : '';

    // Safely convert event fields to strings
    const eventName = String(legacy.eventname || '');
    const promotion = String(legacy.promotion || '');

    // Get event ID
    const evtKey = eventKey(promotion, eventName, legacy.date);
    const eventId = eventIdMap.get(evtKey);
    if (!eventId && !isDryRun) {
      fightsSkipped++;
      continue;
    }

    // Get fighter IDs
    const f1Key = fighterKey(f1fn, f1ln);
    const f2Key = fighterKey(f2fn, f2ln);
    const fighter1Id = fighterIdMap.get(f1Key);
    const fighter2Id = fighterIdMap.get(f2Key);

    if ((!fighter1Id || !fighter2Id) && !isDryRun) {
      fightsSkipped++;
      continue;
    }

    // Check if fight already exists
    const existing = await prisma.fight.findFirst({
      where: {
        eventId: eventId || '',
        fighter1Id: fighter1Id || '',
        fighter2Id: fighter2Id || '',
      },
    });

    if (existing) {
      fightMappings.push({
        legacyId: legacy.id,
        newId: existing.id,
        fighter1Name: `${f1fn} ${f1ln}`.trim(),
        fighter2Name: `${f2fn} ${f2ln}`.trim(),
        date: legacy.date,
        eventName,
      });
      fightsExisting++;
    } else if (!isDryRun && eventId && fighter1Id && fighter2Id) {
      const newFight = await prisma.fight.create({
        data: {
          eventId,
          fighter1Id,
          fighter2Id,
          weightClass: mapWeightClass(legacy.weightclass),
          isTitle: legacy.istitle === 1,
          orderOnCard: legacy.orderoncard || 1,
          cardType: mapCardType(legacy.prelimcode),
          winner: legacy.winner || null,
          method: legacy.method || null,
          round: legacy.round || null,
          time: legacy.time || null,
          averageRating: legacy.percentscore ? legacy.percentscore / 10 : 0,
          totalRatings: legacy.numvotes || 0,
          hasStarted: legacy.hasstarted === 1,
          isComplete: legacy.hasstarted === 1, // Assume completed if started
        },
      });

      fightMappings.push({
        legacyId: legacy.id,
        newId: newFight.id,
        fighter1Name: `${f1fn} ${f1ln}`.trim(),
        fighter2Name: `${f2fn} ${f2ln}`.trim(),
        date: legacy.date,
        eventName,
      });
      fightsCreated++;
    } else if (isDryRun) {
      fightMappings.push({
        legacyId: legacy.id,
        newId: `dry-run-${legacy.id}`,
        fighter1Name: `${f1fn} ${f1ln}`.trim(),
        fighter2Name: `${f2fn} ${f2ln}`.trim(),
        date: legacy.date,
        eventName,
      });
      fightsCreated++;
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`    Processed ${i + 1}/${legacyFights.length} fights...`);
    }
  }

  console.log(`    Fights: ${fightsCreated} created, ${fightsExisting} already existed, ${fightsSkipped} skipped`);

  // Save fight mappings
  fs.writeFileSync(FIGHT_MAPPING_FILE, JSON.stringify(fightMappings, null, 2));
  console.log(`    Saved ${fightMappings.length} fight mappings to fight-mapping.json`);

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Events:   ${eventsCreated} created, ${eventsExisting} existing`);
  console.log(`  Fighters: ${fightersCreated} created, ${fightersExisting} existing`);
  console.log(`  Fights:   ${fightsCreated} created, ${fightsExisting} existing, ${fightsSkipped} skipped`);
  console.log(`  Mappings: ${fightMappings.length} saved`);

  if (isDryRun) {
    console.log('');
    console.log('*** This was a DRY RUN - no changes were made ***');
    console.log('Run without --dry-run to perform the actual migration.');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
