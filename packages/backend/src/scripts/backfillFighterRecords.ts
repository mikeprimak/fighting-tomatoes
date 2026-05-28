/**
 * Backfill fighter W-L-D records from the ufcstats.com directory.
 *
 * 84.8% of our Fighter rows sit at the 0-0-0 default because only the active
 * UFC roster gets records from the daily ufc.com scrape. This pulls the full
 * ufcstats fighter directory (UFC / Zuffa-tracked only) and fills records on
 * MMA fighters currently at 0-0-0, matched by normalized full name.
 *
 * Matching is deliberately conservative — we only write when exactly one
 * ufcstats fighter and exactly one of our 0-0-0 fighters share a normalized
 * name. Any ambiguity (duplicate names on either side, or conflicting ufcstats
 * records for the same name) is skipped and logged, never guessed. Worst case
 * is leaving a 0-0-0 row untouched; we never overwrite a populated record.
 *
 *   pnpm exec tsx src/scripts/backfillFighterRecords.ts            # dry run
 *   pnpm exec tsx src/scripts/backfillFighterRecords.ts --apply    # write
 */

import { PrismaClient, Sport } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fetchAllUFCStatsFighters, UFCStatsFighterRow } from '../services/scrapeUFCStatsFighters';
import { normalizeName } from '../utils/fighterMatcher';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function fullKey(first: string, last: string): string {
  return `${normalizeName(first)} ${normalizeName(last)}`.trim().replace(/\s+/g, ' ');
}

function recordKey(r: { wins: number; losses: number; draws: number }): string {
  return `${r.wins}-${r.losses}-${r.draws}`;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  // 1. Pull the full ufcstats directory.
  console.log('Fetching ufcstats fighter directory…');
  const stats = await fetchAllUFCStatsFighters((letter, pageCount, total) => {
    process.stdout.write(`  ${letter.toUpperCase()}: ${pageCount} (running ${total})\n`);
  });
  console.log(`Total ufcstats fighters: ${stats.length}\n`);

  // 2. Build a normalized-name → record index, flagging ambiguity.
  //    If the same name maps to conflicting records, it's ambiguous → unusable.
  const statsByName = new Map<string, { row: UFCStatsFighterRow; ambiguous: boolean }>();
  for (const row of stats) {
    const key = fullKey(row.firstName, row.lastName);
    if (!key) continue;
    const existing = statsByName.get(key);
    if (!existing) {
      statsByName.set(key, { row, ambiguous: false });
    } else if (recordKey(existing.row) !== recordKey(row)) {
      existing.ambiguous = true; // two different people share this name
    }
  }

  // 3. Load our MMA fighters currently at 0-0-0.
  const ours = await prisma.fighter.findMany({
    where: { sport: Sport.MMA, wins: 0, losses: 0, draws: 0, noContests: 0 },
    select: { id: true, firstName: true, lastName: true },
  });
  console.log(`Our empty-record MMA fighters: ${ours.length}`);

  // Group our side by name to detect our own duplicates.
  const oursByName = new Map<string, typeof ours>();
  for (const f of ours) {
    const key = fullKey(f.firstName, f.lastName);
    if (!key) continue;
    const arr = oursByName.get(key) ?? [];
    arr.push(f);
    oursByName.set(key, arr);
  }

  // 4. Match + plan updates.
  const updates: { id: string; name: string; wins: number; losses: number; draws: number }[] = [];
  const skippedAmbiguousStats: string[] = [];
  const skippedAmbiguousOurs: string[] = [];
  const skippedZeroRecord: string[] = [];
  let unmatched = 0;

  for (const [key, group] of oursByName) {
    const hit = statsByName.get(key);
    if (!hit) { unmatched += group.length; continue; }
    if (hit.ambiguous) { skippedAmbiguousStats.push(key); continue; }
    if (group.length > 1) { skippedAmbiguousOurs.push(key); continue; }
    const r = hit.row;
    if (r.wins === 0 && r.losses === 0 && r.draws === 0) {
      skippedZeroRecord.push(key); // ufcstats also has them at 0-0-0; nothing to gain
      continue;
    }
    const f = group[0];
    updates.push({ id: f.id, name: `${f.firstName} ${f.lastName}`, wins: r.wins, losses: r.losses, draws: r.draws });
  }

  console.log('');
  console.log(`Matched & fillable:        ${updates.length}`);
  console.log(`Unmatched (not in ufcstats): ${unmatched}`);
  console.log(`Skipped — ambiguous ufcstats name: ${skippedAmbiguousStats.length}`);
  console.log(`Skipped — duplicate on our side:   ${skippedAmbiguousOurs.length}`);
  console.log(`Skipped — ufcstats also 0-0-0:     ${skippedZeroRecord.length}`);

  console.log('\nSample of planned updates:');
  for (const u of updates.slice(0, 20)) {
    console.log(`  ${u.name}: ${u.wins}-${u.losses}-${u.draws}`);
  }

  // 5. Write a full audit log.
  const logPath = path.join(__dirname, '..', '..', 'prisma', 'fighter-records-backfill.json');
  fs.writeFileSync(logPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    applied: APPLY,
    ufcstatsTotal: stats.length,
    counts: {
      matched: updates.length,
      unmatched,
      ambiguousStats: skippedAmbiguousStats.length,
      ambiguousOurs: skippedAmbiguousOurs.length,
      zeroRecord: skippedZeroRecord.length,
    },
    updates,
    skippedAmbiguousStats,
    skippedAmbiguousOurs,
  }, null, 2));
  console.log(`\nAudit log written: ${logPath}`);

  // 6. Apply.
  if (!APPLY) {
    console.log('\nDry run — no writes. Re-run with --apply to commit these records.');
    return;
  }

  console.log(`\nApplying ${updates.length} updates…`);
  let done = 0;
  for (const u of updates) {
    await prisma.fighter.update({
      where: { id: u.id },
      data: { wins: u.wins, losses: u.losses, draws: u.draws },
    });
    if (++done % 250 === 0) console.log(`  …${done}/${updates.length}`);
  }
  console.log(`Done. Updated ${done} fighters.`);
}

main()
  .catch(e => { console.error('ERROR', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
