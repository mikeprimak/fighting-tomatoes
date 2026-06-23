/**
 * Fix the legacy event-order inversion for the SAFE-TO-FIX set only (BACKLOG §8 phase 2).
 * Re-runs the same classification as audit-legacy-event-order.ts and applies the self-inverse
 * transform `newOrder = (minOrder + maxOrder) - oldOrder` to events verdicted
 * INVERTED-HIGH or INVERTED-STRUCTURAL (an authoritative name/title signal, not the rating
 * heuristic alone). Leaves INVERTED-RATING-ONLY / SENTINEL / UNCERTAIN / CORRECT untouched.
 *
 * SAFE: the transform is a bijection over each event's order set (final set == original set),
 * and the Fight unique constraint is (eventId, fighter1Id, fighter2Id) — it does NOT include
 * orderOnCard, so no collision is possible. Applied as a single set-based UPDATE per run.
 *
 * Dry-run by default. Pass --apply to write. After applying, it re-classifies the touched
 * events and asserts they flipped to CORRECT.
 *
 * Usage: from packages/backend/
 *   npx tsx scripts/fix-legacy-event-order.ts            # dry-run (prints what it WOULD do)
 *   npx tsx scripts/fix-legacy-event-order.ts --apply    # writes
 */
import { prisma } from '../src/lib/prisma';
import { Prisma } from '@prisma/client';

type Vote = 'INVERTED' | 'CORRECT' | 'NEUTRAL';
type Verdict =
  | 'SENTINEL' | 'INVERTED-HIGH' | 'INVERTED-STRUCTURAL' | 'INVERTED-RATING-ONLY'
  | 'CORRECT' | 'CORRECT-RATING-ONLY' | 'UNCERTAIN';

const MIN_FIGHTS = 3;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const endVote = (low: number, high: number): Vote =>
  high > low ? 'INVERTED' : low > high ? 'CORRECT' : 'NEUTRAL';

type FightLite = {
  orderOnCard: number; isTitle: boolean; totalRatings: number;
  fighter1: { lastName: string | null } | null;
  fighter2: { lastName: string | null } | null;
};

function classify(name: string, fightsIn: FightLite[]): Verdict | null {
  const fights = [...fightsIn].sort((a, b) => a.orderOnCard - b.orderOnCard);
  if (fights.length < MIN_FIGHTS) return null;
  const orders = fights.map((f) => f.orderOnCard);
  const n = fights.length;
  const first = fights[0];
  const last = fights[fights.length - 1];
  if (orders.some((o) => o > n + 5 || o < 1)) return 'SENTINEL';

  const evName = norm(name);
  const lns = (f: FightLite) =>
    [f.fighter1?.lastName, f.fighter2?.lastName]
      .filter((x): x is string => !!x && x.length >= 3).map(norm);
  const inName = (f: FightLite) => lns(f).some((ln) => evName.includes(ln));
  const firstInName = inName(first), lastInName = inName(last);
  let nameVote: Vote = 'NEUTRAL';
  if (lastInName && !firstInName) nameVote = 'INVERTED';
  else if (firstInName && !lastInName) nameVote = 'CORRECT';

  let titleVote: Vote = 'NEUTRAL';
  if (last.isTitle && !first.isTitle) titleVote = 'INVERTED';
  else if (first.isTitle && !last.isTitle) titleVote = 'CORRECT';

  let ratingVote: Vote = 'NEUTRAL';
  if (first.totalRatings > 0 || last.totalRatings > 0)
    ratingVote = endVote(first.totalRatings, last.totalRatings);

  const structural: Vote = nameVote !== 'NEUTRAL' ? nameVote : titleVote;
  if (structural === 'INVERTED')
    return ratingVote === 'INVERTED' ? 'INVERTED-HIGH'
      : ratingVote === 'CORRECT' ? 'UNCERTAIN' : 'INVERTED-STRUCTURAL';
  if (structural === 'CORRECT')
    return ratingVote === 'INVERTED' ? 'UNCERTAIN' : 'CORRECT';
  return ratingVote === 'INVERTED' ? 'INVERTED-RATING-ONLY'
    : ratingVote === 'CORRECT' ? 'CORRECT-RATING-ONLY' : 'UNCERTAIN';
}

const SELECT = {
  id: true, name: true,
  fights: {
    select: {
      orderOnCard: true, isTitle: true, totalRatings: true,
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } },
    },
  },
} as const;

async function main() {
  const apply = process.argv.includes('--apply');

  const events = await prisma.event.findMany({
    where: { scraperType: null, eventStatus: 'COMPLETED' },
    select: SELECT,
  });

  const targets = events.filter((e) => {
    const v = classify(e.name, e.fights as FightLite[]);
    return v === 'INVERTED-HIGH' || v === 'INVERTED-STRUCTURAL';
  });
  const ids = targets.map((e) => e.id);

  console.log(`\n=== Fix legacy event-order (${apply ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(`Safe-to-fix events (INVERTED-HIGH + INVERTED-STRUCTURAL): ${ids.length}`);
  for (const e of targets.slice(0, 10)) console.log(`  - ${e.name}`);
  if (targets.length > 10) console.log(`  ... and ${targets.length - 10} more`);

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write.`);
    await prisma.$disconnect();
    return;
  }
  if (ids.length === 0) { console.log('Nothing to do.'); await prisma.$disconnect(); return; }

  // Single set-based UPDATE: newOrder = (min+max) - oldOrder, per event, scoped to the
  // target IDs. Postgres evaluates the whole statement against pre-update values and checks
  // constraints at statement end — and orderOnCard isn't in any unique key anyway.
  const affected = await prisma.$executeRaw(Prisma.sql`
    UPDATE "fights" f
    SET "orderOnCard" = b.s - f."orderOnCard"
    FROM (
      SELECT "eventId", MIN("orderOnCard") + MAX("orderOnCard") AS s
      FROM "fights"
      WHERE "eventId" IN (${Prisma.join(ids)})
      GROUP BY "eventId"
    ) b
    WHERE f."eventId" = b."eventId" AND f."eventId" IN (${Prisma.join(ids)})
  `);
  console.log(`\nUpdated ${affected} fight rows across ${ids.length} events.`);

  // Verify: re-fetch the touched events and assert they now classify CORRECT.
  const after = await prisma.event.findMany({ where: { id: { in: ids } }, select: SELECT });
  let stillInverted = 0, nowCorrect = 0, other = 0;
  for (const e of after) {
    const v = classify(e.name, e.fights as FightLite[]);
    if (v === 'CORRECT') nowCorrect++;
    else if (v && v.startsWith('INVERTED')) { stillInverted++; console.log(`  !! still inverted: ${e.name} (${v})`); }
    else { other++; }
  }
  console.log(`\nPost-fix verification: CORRECT=${nowCorrect}  other=${other}  still-inverted=${stillInverted}`);
  if (stillInverted > 0) console.log('⚠ Some events did not flip — investigate before assuming success.');
  else console.log('✅ All targeted events flipped out of INVERTED.');

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
