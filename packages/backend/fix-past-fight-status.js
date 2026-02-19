#!/usr/bin/env node
/**
 * fix-past-fight-status.js
 *
 * Fixes fights from past events that are incorrectly showing as "upcoming" or "live"
 * because migration scripts didn't set hasStarted/isComplete properly.
 *
 * Root cause: fill-missing-ufc.js (and similar scripts) set:
 *   hasStarted: !!lf.hasstarted
 *   isComplete: !!lf.winner
 * So fights without winner data got isComplete=false even though they happened years ago.
 *
 * Fix: For all past events (date < now), set fights to hasStarted=true, isComplete=true.
 * We only touch fights that are NOT already complete and NOT cancelled.
 *
 * USAGE:
 *   node fix-past-fight-status.js --dry-run    # Preview without changes
 *   node fix-past-fight-status.js              # Execute
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://fightcrewappdb_3gme_user:MTsQsoVBMmM0bj6xp9hX2UkJTNbe5VZN@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp' } }
});

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('');
  console.log('=== FIX PAST FIGHT STATUS ===');
  if (DRY_RUN) console.log('  DRY RUN MODE\n');

  // Count fights in each broken category
  const upcomingCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM fights f
    JOIN events e ON f."eventId" = e.id
    WHERE f."hasStarted" = false
      AND f."isComplete" = false
      AND f."isCancelled" = false
      AND e.date < NOW()
  `;

  const liveCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM fights f
    JOIN events e ON f."eventId" = e.id
    WHERE f."hasStarted" = true
      AND f."isComplete" = false
      AND f."isCancelled" = false
      AND e.date < NOW()
  `;

  console.log(`Category 1 - Past fights showing as "upcoming": ${upcomingCount[0].count}`);
  console.log(`Category 2 - Past fights showing as "live":     ${liveCount[0].count}`);
  console.log(`Total to fix: ${Number(upcomingCount[0].count) + Number(liveCount[0].count)}`);
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN - no changes made.');
    await prisma.$disconnect();
    return;
  }

  // Fix Category 1: upcoming -> completed (set both hasStarted and isComplete)
  const fix1 = await prisma.$executeRaw`
    UPDATE fights f
    SET "hasStarted" = true,
        "isComplete" = true,
        "completionMethod" = 'migration-fix'
    FROM events e
    WHERE f."eventId" = e.id
      AND f."hasStarted" = false
      AND f."isComplete" = false
      AND f."isCancelled" = false
      AND e.date < NOW()
  `;
  console.log(`Fixed Category 1 (upcoming -> completed): ${fix1} fights`);

  // Fix Category 2: live -> completed (set isComplete)
  const fix2 = await prisma.$executeRaw`
    UPDATE fights f
    SET "isComplete" = true,
        "completionMethod" = 'migration-fix'
    FROM events e
    WHERE f."eventId" = e.id
      AND f."hasStarted" = true
      AND f."isComplete" = false
      AND f."isCancelled" = false
      AND e.date < NOW()
  `;
  console.log(`Fixed Category 2 (live -> completed):     ${fix2} fights`);

  console.log(`\nTotal fixed: ${fix1 + fix2}`);

  // Also fix events that should be marked as complete
  const eventFix = await prisma.$executeRaw`
    UPDATE events
    SET "hasStarted" = true,
        "isComplete" = true
    WHERE date < NOW()
      AND ("hasStarted" = false OR "isComplete" = false)
  `;
  console.log(`Events fixed (marked as started+complete): ${eventFix}`);

  // Verify
  const remainingUpcoming = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM fights f
    JOIN events e ON f."eventId" = e.id
    WHERE f."hasStarted" = false
      AND f."isComplete" = false
      AND f."isCancelled" = false
      AND e.date < NOW()
  `;

  const remainingLive = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM fights f
    JOIN events e ON f."eventId" = e.id
    WHERE f."hasStarted" = true
      AND f."isComplete" = false
      AND f."isCancelled" = false
      AND e.date < NOW()
  `;

  console.log(`\n=== VERIFICATION ===`);
  console.log(`Remaining "upcoming" past fights: ${remainingUpcoming[0].count}`);
  console.log(`Remaining "live" past fights:     ${remainingLive[0].count}`);
  console.log('Done!');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
