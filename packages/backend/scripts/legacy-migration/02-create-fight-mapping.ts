/**
 * 02-create-fight-mapping.ts
 *
 * Creates a mapping between legacy fight IDs (integers) and new fight IDs (UUIDs)
 * by matching fighters and event dates.
 *
 * Prerequisites: Run 01-parse-legacy-data.ts first
 *
 * Strategy:
 * 1. Load legacy fights from JSON
 * 2. For each legacy fight, find matching new fight by:
 *    - Fighter names (first + last name for both fighters)
 *    - Event date (same day)
 *    - Try both fighter orderings (fighter1 vs fighter2 could be swapped)
 *
 * Output: fight-mapping.json with legacyId -> newId mappings
 *
 * Usage: npx ts-node scripts/legacy-migration/02-create-fight-mapping.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { LegacyFight, FightMapping } from './types';

const prisma = new PrismaClient();

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');
const OUTPUT_FILE = path.join(DATA_DIR, 'fight-mapping.json');

// Normalization helpers
function normalizeName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' '); // Normalize spaces
}

function normalizeDate(dateStr: string): Date {
  // Handle YYYY-MM-DD format
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIGHT MAPPING GENERATOR');
  console.log('Matching legacy fights to new fights');
  console.log('='.repeat(60));
  console.log('');

  // Load legacy fights
  console.log('[1/3] Loading legacy fights...');
  const legacyFightsPath = path.join(DATA_DIR, 'fights.json');
  if (!fs.existsSync(legacyFightsPath)) {
    console.error('ERROR: fights.json not found. Run 01-parse-legacy-data.ts first.');
    process.exit(1);
  }

  const legacyFights: LegacyFight[] = JSON.parse(fs.readFileSync(legacyFightsPath, 'utf-8'));
  console.log(`    Loaded ${legacyFights.length} legacy fights`);

  // Load all new fights with their fighters
  console.log('[2/3] Loading new fights from database...');
  const newFights = await prisma.fight.findMany({
    include: {
      fighter1: true,
      fighter2: true,
      event: true,
    },
  });
  console.log(`    Loaded ${newFights.length} new fights`);

  // Build lookup index for new fights
  // Key format: "normalizedF1First|normalizedF1Last|normalizedF2First|normalizedF2Last|dateYYYYMMDD"
  const newFightIndex = new Map<string, typeof newFights[0]>();
  for (const fight of newFights) {
    const f1First = normalizeName(fight.fighter1.firstName);
    const f1Last = normalizeName(fight.fighter1.lastName);
    const f2First = normalizeName(fight.fighter2.firstName);
    const f2Last = normalizeName(fight.fighter2.lastName);
    const dateStr = fight.event.date.toISOString().split('T')[0].replace(/-/g, '');

    // Index with both orderings
    const key1 = `${f1First}|${f1Last}|${f2First}|${f2Last}|${dateStr}`;
    const key2 = `${f2First}|${f2Last}|${f1First}|${f1Last}|${dateStr}`;

    newFightIndex.set(key1, fight);
    newFightIndex.set(key2, fight);
  }

  // Match legacy fights to new fights
  console.log('[3/3] Creating fight mappings...');
  const mappings: FightMapping[] = [];
  const unmatchedFights: LegacyFight[] = [];
  const matchedNewFightIds = new Set<string>();

  for (const legacy of legacyFights) {
    const f1First = normalizeName(legacy.f1fn as string);
    const f1Last = normalizeName(legacy.f1ln as string);
    const f2First = normalizeName(legacy.f2fn as string);
    const f2Last = normalizeName(legacy.f2ln as string);
    const dateStr = (legacy.date as string || '').replace(/-/g, '');

    // Try to find match
    const key = `${f1First}|${f1Last}|${f2First}|${f2Last}|${dateStr}`;
    let newFight = newFightIndex.get(key);

    // If not found, try more fuzzy matching
    if (!newFight) {
      // Try matching with just last names (handles first name variations)
      const foundId = findByLastNamesAndDate(newFights, f1Last, f2Last, legacy.date);
      if (foundId) {
        newFight = { id: foundId } as typeof newFights[0];
      }
    }

    if (newFight && !matchedNewFightIds.has(newFight.id)) {
      mappings.push({
        legacyId: legacy.id,
        newId: newFight.id,
        fighter1Name: `${legacy.f1fn} ${legacy.f1ln}`,
        fighter2Name: `${legacy.f2fn} ${legacy.f2ln}`,
        date: legacy.date,
        eventName: legacy.eventname,
      });
      matchedNewFightIds.add(newFight.id);
    } else {
      unmatchedFights.push(legacy);
    }
  }

  // Write mapping file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mappings, null, 2));

  // Write unmatched fights for debugging
  const unmatchedPath = path.join(DATA_DIR, 'unmatched-fights.json');
  fs.writeFileSync(unmatchedPath, JSON.stringify(unmatchedFights, null, 2));

  console.log('');
  console.log('='.repeat(60));
  console.log('MAPPING COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Legacy fights:   ${legacyFights.length}`);
  console.log(`  Matched:         ${mappings.length} (${(mappings.length / legacyFights.length * 100).toFixed(1)}%)`);
  console.log(`  Unmatched:       ${unmatchedFights.length}`);
  console.log('');
  console.log('Output files:');
  console.log(`  ${OUTPUT_FILE}`);
  console.log(`  ${unmatchedPath}`);

  // Show sample of unmatched fights
  if (unmatchedFights.length > 0) {
    console.log('');
    console.log('Sample unmatched fights (first 10):');
    for (const f of unmatchedFights.slice(0, 10)) {
      console.log(`  - [${f.id}] ${f.f1fn} ${f.f1ln} vs ${f.f2fn} ${f.f2ln} (${f.date}) - ${f.eventname}`);
    }
  }

  // Show promotions breakdown of unmatched
  const unmatchedByPromotion = new Map<string, number>();
  for (const f of unmatchedFights) {
    const count = unmatchedByPromotion.get(f.promotion) || 0;
    unmatchedByPromotion.set(f.promotion, count + 1);
  }

  if (unmatchedByPromotion.size > 0) {
    console.log('');
    console.log('Unmatched by promotion:');
    for (const [promotion, count] of [...unmatchedByPromotion.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${promotion}: ${count}`);
    }
  }

  await prisma.$disconnect();
}

function findByLastNamesAndDate(
  newFights: Array<{
    id: string;
    fighter1: { firstName: string; lastName: string };
    fighter2: { firstName: string; lastName: string };
    event: { date: Date };
  }>,
  f1Last: string,
  f2Last: string,
  legacyDate: string
): string | undefined {
  const targetDate = normalizeDate(legacyDate);

  const found = newFights.find(fight => {
    if (!isSameDay(fight.event.date, targetDate)) return false;

    const nf1Last = normalizeName(fight.fighter1.lastName);
    const nf2Last = normalizeName(fight.fighter2.lastName);

    // Try both orderings
    return (
      (nf1Last === f1Last && nf2Last === f2Last) ||
      (nf1Last === f2Last && nf2Last === f1Last)
    );
  });

  return found?.id;
}

// Run the script
main().catch(console.error);
