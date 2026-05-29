/**
 * BKFC stale-matchup cleanup (ONE-TIME WRITE).
 *
 * Companion to auditBKFCStaleMatchups.ts. Cancels the 7 phantom BKFC fight rows
 * the audit confirmed on 2026-05-29 — early provisional matchups whose opponents
 * later changed, leaving a COMPLETED-with-no-result row alongside the real scored
 * bout. Decision (Mike, 2026-05-29): CANCEL all, including the 4 with prediction-
 * only engagement (no ratings/reviews; predictions are unscoreable because the
 * matchup never happened, and FightPrediction's unique(userId,fightId) makes a
 * merge collide with predictions on the real bout).
 *
 * Sets fightStatus=CANCELLED (matches how the 17 correct cancellations look).
 * Predictions/comments stay attached to the cancelled row — nothing is destroyed,
 * they simply stop rendering. Fail-closed: only updates rows still winner=null and
 * not already CANCELLED, so a row that gained a real result since the audit is
 * left untouched.
 *
 * Run from packages/backend (uses DATABASE_URL = Render external):
 *   node_modules/.bin/ts-node src/scripts/cleanupBKFCStaleMatchups.ts
 *
 * See docs/HANDOFF-bkfc-stale-matchups-2026-05-29.md
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Confirmed phantom rows from the 2026-05-29 audit (fightId -> human label).
const PHANTOM_FIGHT_IDS: Record<string, string> = {
  '4ef5f298-9759-4d9c-98c0-bcbd9282f111': 'BKFC Hawaii #5 Cisneros vs Baesman',
  '0e245a56-151e-4c71-b91b-f63d46741024': 'BKFC Hawaii #7 Pakala vs Guzman',
  '3f6d1dee-9165-412a-85b9-eb9ae1e60207': 'BKFC Hawaii #12 Saragosa vs Davis Henry',
  '6b8f26ff-17fe-4bad-bb8c-2624f432ee9f': 'Newcastle 2 #2 Fox vs Lilley',
  'b100f78f-77a9-4e07-98f0-3eccd6f7438d': 'Newcastle 2 #5 Lilley vs Ekedi',
  '14af4a6f-c16c-4ada-812e-ded9f7a1db78': 'Newcastle 2 #8 Shaw vs Spelman',
  '5c70b0fe-aa27-4670-a5be-6106cdb212f0': 'Newcastle 2 #11 Walker vs Gregory',
  // Added 2026-05-29 (round 2): the audit's last-name matcher MISSED this one
  // because there are two "Walters" fighter records — the real scored bout is
  // Heckert vs "Justi" Walters (8d7e830a, COMPLETED), this phantom points at a
  // duplicate "Justin" Walters (c13678e2). Same person, scraper-split record;
  // pairing looked present by last name so the diff passed it. UPCOMING, zero
  // engagement. (The duplicate Fighter rows are a separate dedup concern.)
  'ca6ca1f4-fad9-40e7-9a0a-cdf570e29b78': 'BKFC Clearwater #5 Heckert vs Walters (dup-fighter phantom)',
};

async function main() {
  const ids = Object.keys(PHANTOM_FIGHT_IDS);
  console.log(`\n=== BKFC stale-matchup cleanup ===`);
  console.log(`Cancelling ${ids.length} confirmed phantom rows...\n`);

  // Pre-flight: re-read each row, confirm it's a BKFC fight still winner=null.
  const rows = await prisma.fight.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, winner: true, method: true, fightStatus: true,
      event: { select: { name: true, scraperType: true } },
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } },
    },
  });

  const safeToCancel: string[] = [];
  for (const id of ids) {
    const label = PHANTOM_FIGHT_IDS[id];
    const row = rows.find(r => r.id === id);
    if (!row) {
      console.log(`  SKIP  ${label} — row not found (already deleted?)`);
      continue;
    }
    if (row.event.scraperType !== 'bkfc') {
      console.log(`  SKIP  ${label} — not a BKFC event (${row.event.scraperType}); refusing.`);
      continue;
    }
    if (row.fightStatus === 'CANCELLED') {
      console.log(`  SKIP  ${label} — already CANCELLED.`);
      continue;
    }
    if (row.winner) {
      console.log(`  SKIP  ${label} — has a winner now (${row.winner}); fail-closed, not touching.`);
      continue;
    }
    safeToCancel.push(id);
    console.log(`  WILL CANCEL  ${label} [${row.fightStatus}]`);
  }

  if (safeToCancel.length === 0) {
    console.log(`\nNothing to do.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const result = await prisma.fight.updateMany({
    where: {
      id: { in: safeToCancel },
      winner: null,                  // belt-and-suspenders fail-closed
      event: { scraperType: 'bkfc' },
    },
    data: {
      fightStatus: 'CANCELLED',
      completionMethod: 'stale-matchup-cleanup-2026-05-29',
    },
  });

  console.log(`\n✓ Cancelled ${result.count} phantom row(s).`);
  console.log(`(Predictions/comments remain attached to the cancelled rows; they simply stop rendering.)`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
