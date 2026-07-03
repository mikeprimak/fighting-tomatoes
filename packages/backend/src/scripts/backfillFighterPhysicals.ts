/**
 * Backfill fighter physicals (height / reach / stance) from the ufcstats.com
 * directory. SEO step 7 — these feed the Person JSON-LD on web fighter pages.
 *
 * Sibling of backfillFighterRecords.ts and reuses its conservative matching:
 * we only write when exactly one ufcstats fighter and exactly one of our
 * fighters share a normalized full name, and the ufcstats side is unambiguous
 * (same-named fighters with conflicting physicals are skipped, never guessed).
 *
 * FILL-ONLY: each of height/reach/stance is written only when our column is
 * currently NULL. A populated value (from a previous run or another source) is
 * never overwritten, so this is safe to re-run any time (quarterly alongside
 * the records backfill — see docs/operations/maintenance.md).
 *
 *   pnpm exec tsx src/scripts/backfillFighterPhysicals.ts            # dry run
 *   pnpm exec tsx src/scripts/backfillFighterPhysicals.ts --apply    # write
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../lib/prisma';
import { fetchAllUFCStatsFighters, UFCStatsFighterRow } from '../services/scrapeUFCStatsFighters';
import { normalizeName } from '../utils/fighterMatcher';

const APPLY = process.argv.includes('--apply');

function fullKey(first: string, last: string): string {
  return `${normalizeName(first)} ${normalizeName(last)}`.trim().replace(/\s+/g, ' ');
}

function physicalsKey(r: UFCStatsFighterRow): string {
  return `${r.height ?? ''}|${r.reach ?? ''}|${r.stance ?? ''}`;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  // 1. Pull the full ufcstats directory.
  console.log('Fetching ufcstats fighter directory…');
  const stats = await fetchAllUFCStatsFighters((letter, pageCount, total) => {
    process.stdout.write(`  ${letter.toUpperCase()}: ${pageCount} (running ${total})\n`);
  });
  console.log(`Total ufcstats fighters: ${stats.length}\n`);

  // 2. Index by normalized name, flagging ambiguity. Two same-named entries
  //    with identical physicals are fine; conflicting physicals are unusable.
  const statsByName = new Map<string, { row: UFCStatsFighterRow; ambiguous: boolean }>();
  for (const row of stats) {
    if (!row.height && !row.reach && !row.stance) continue; // nothing to offer
    const key = fullKey(row.firstName, row.lastName);
    if (!key) continue;
    const existing = statsByName.get(key);
    if (!existing) {
      statsByName.set(key, { row, ambiguous: false });
    } else if (physicalsKey(existing.row) !== physicalsKey(row)) {
      existing.ambiguous = true;
    }
  }

  // 3. Our fighters missing at least one physical column.
  const ours = await prisma.fighter.findMany({
    where: { OR: [{ height: null }, { reach: null }, { stance: null }] },
    select: { id: true, firstName: true, lastName: true, height: true, reach: true, stance: true },
  });
  console.log(`Our fighters missing a physical: ${ours.length}`);

  const oursByName = new Map<string, typeof ours>();
  for (const f of ours) {
    const key = fullKey(f.firstName, f.lastName);
    if (!key) continue;
    const arr = oursByName.get(key) ?? [];
    arr.push(f);
    oursByName.set(key, arr);
  }

  // 4. Match + plan fill-only updates.
  type Update = { id: string; name: string; data: { height?: string; reach?: string; stance?: string } };
  const updates: Update[] = [];
  const skippedAmbiguousStats: string[] = [];
  const skippedAmbiguousOurs: string[] = [];
  let unmatched = 0;

  for (const [key, group] of oursByName) {
    const hit = statsByName.get(key);
    if (!hit) { unmatched += group.length; continue; }
    if (hit.ambiguous) { skippedAmbiguousStats.push(key); continue; }
    if (group.length > 1) { skippedAmbiguousOurs.push(key); continue; }
    const f = group[0];
    const r = hit.row;
    const data: Update['data'] = {};
    if (f.height == null && r.height) data.height = r.height;
    if (f.reach == null && r.reach) data.reach = r.reach;
    if (f.stance == null && r.stance) data.stance = r.stance;
    if (Object.keys(data).length === 0) continue;
    updates.push({ id: f.id, name: `${f.firstName} ${f.lastName}`, data });
  }

  console.log('');
  console.log(`Matched & fillable:                ${updates.length}`);
  console.log(`Unmatched (not in ufcstats):       ${unmatched}`);
  console.log(`Skipped — ambiguous ufcstats name: ${skippedAmbiguousStats.length}`);
  console.log(`Skipped — duplicate on our side:   ${skippedAmbiguousOurs.length}`);
  for (const u of updates.slice(0, 15)) {
    console.log(`  ${u.name}: ${JSON.stringify(u.data)}`);
  }

  // 5. Audit log.
  const logPath = path.join(__dirname, '..', '..', 'prisma', 'fighter-physicals-backfill.json');
  fs.writeFileSync(logPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    applied: APPLY,
    ufcstatsTotal: stats.length,
    counts: {
      matched: updates.length,
      unmatched,
      ambiguousStats: skippedAmbiguousStats.length,
      ambiguousOurs: skippedAmbiguousOurs.length,
    },
    updates,
    skippedAmbiguousStats,
    skippedAmbiguousOurs,
  }, null, 2));
  console.log(`\nAudit log written: ${logPath}`);

  // 6. Apply.
  if (!APPLY) {
    console.log('\nDry run — no writes. Re-run with --apply to commit.');
    return;
  }

  console.log(`\nApplying ${updates.length} updates…`);
  let done = 0;
  for (const u of updates) {
    await prisma.fighter.update({ where: { id: u.id }, data: u.data });
    if (++done % 250 === 0) console.log(`  …${done}/${updates.length}`);
  }
  console.log(`Done. Updated ${done} fighters.`);
}

main()
  .catch(e => { console.error('ERROR', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
