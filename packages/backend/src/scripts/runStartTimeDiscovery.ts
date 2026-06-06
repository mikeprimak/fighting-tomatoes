/**
 * Start-Time Discovery — CLI runner.
 *
 * Resolves the real first-bell (prelim / early-prelim) start times for upcoming
 * events whose source (Tapology, etc.) only published the main-card time, so the
 * event flips LIVE when the card actually starts instead of hours late.
 *
 * Usage:
 *   npx tsx src/scripts/runStartTimeDiscovery.ts                 # batch over upcoming gap events
 *   npx tsx src/scripts/runStartTimeDiscovery.ts --dry-run       # preview, no writes
 *   npx tsx src/scripts/runStartTimeDiscovery.ts --max 10
 *   npx tsx src/scripts/runStartTimeDiscovery.ts --event-id <uuid> [--dry-run]   # one event (ignores selection filters)
 *
 * Env: BRAVE_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL.
 */

import { prisma } from '../lib/prisma';
import { runStartTimeDiscovery, discoverStartTimesForEvent } from '../services/startTimeDiscovery/run';


function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(name);

async function main() {
  const dryRun = hasFlag('--dry-run');
  const eventId = arg('--event-id');
  const max = arg('--max') ? Number(arg('--max')) : undefined;

  console.log(`\n[startTimeDiscovery] ${dryRun ? 'DRY-RUN' : 'APPLY'} ${eventId ? `event=${eventId}` : 'batch'}\n`);

  if (eventId) {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, name: true, date: true, promotion: true, location: true,
        earlyPrelimStartTime: true, prelimStartTime: true, mainStartTime: true, startTimeSource: true,
      },
    });
    if (!ev) {
      console.error(`Event not found: ${eventId}`);
      process.exit(1);
    }
    const outcome = await discoverStartTimesForEvent(prisma, ev as any, { dryRun });
    console.log(JSON.stringify(outcome, null, 2));
  } else {
    const outcomes = await runStartTimeDiscovery(prisma, { dryRun, maxEvents: max });
    const applied = outcomes.filter((o) => o.result?.applied).length;
    console.log(`\n[startTimeDiscovery] Done. ${applied}/${outcomes.length} events updated.`);
  }
}

main()
  .catch((e) => {
    console.error('[startTimeDiscovery] Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
