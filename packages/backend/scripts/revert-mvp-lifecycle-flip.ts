/**
 * Revert the auto-flipped MVP fights back to UPCOMING.
 *
 * Cause: eventLifecycle.ts Step 2 was missing a useManualLiveTracker guard
 * (fixed in the same commit). When MVP was manually marked LIVE, the next
 * lifecycle tick bulk-flipped every fight to COMPLETED with
 * completionMethod='lifecycle-no-tracker'. Anything you have since marked
 * yourself has a different completionMethod, so the filter is safe.
 *
 * Usage:
 *   npx ts-node packages/backend/scripts/revert-mvp-lifecycle-flip.ts --event-id <id>
 *   npx ts-node packages/backend/scripts/revert-mvp-lifecycle-flip.ts --event-id <id> --apply
 *
 * Default is dry-run; pass --apply to actually update rows.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { eventId?: string; apply: boolean } {
  const out = { apply: false } as { eventId?: string; apply: boolean };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event-id') out.eventId = argv[++i];
    else if (a === '--apply') out.apply = true;
  }
  return out;
}

async function main() {
  const { eventId, apply } = parseArgs(process.argv.slice(2));
  if (!eventId) {
    console.error('Missing --event-id <id>');
    process.exit(1);
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      eventStatus: true,
      scraperType: true,
      useManualLiveTracker: true,
      completionMethod: true,
    },
  });
  if (!event) {
    console.error(`Event ${eventId} not found`);
    process.exit(1);
  }

  console.log('Event:', event);

  const targets = await prisma.fight.findMany({
    where: {
      eventId,
      fightStatus: 'COMPLETED',
      completionMethod: 'lifecycle-no-tracker',
    },
    select: {
      id: true,
      cardType: true,
      orderOnCard: true,
      completedAt: true,
      winner: true,
      method: true,
    },
    orderBy: { orderOnCard: 'asc' },
  });

  console.log(`\nFights to revert (completionMethod='lifecycle-no-tracker'): ${targets.length}`);
  for (const f of targets) {
    console.log(
      `  ${f.id}  order=${f.orderOnCard}  card=${f.cardType}  completedAt=${f.completedAt?.toISOString()}  winner=${f.winner ?? 'null'}  method=${f.method ?? 'null'}`,
    );
  }

  if (targets.some((f) => f.winner || f.method)) {
    console.warn(
      '\nWARNING: at least one target row has a non-null winner or method. ' +
      'That means a result was written after the auto-flip. Review before --apply.',
    );
  }

  if (!apply) {
    console.log('\nDry-run. Re-run with --apply to update.');
    return;
  }

  if (targets.length === 0) {
    console.log('Nothing to revert.');
    return;
  }

  const result = await prisma.fight.updateMany({
    where: {
      eventId,
      fightStatus: 'COMPLETED',
      completionMethod: 'lifecycle-no-tracker',
    },
    data: {
      fightStatus: 'UPCOMING',
      completionMethod: null,
      completedAt: null,
    },
  });

  console.log(`\nReverted ${result.count} fights back to UPCOMING.`);

  if (event.eventStatus === 'COMPLETED') {
    console.log(
      `Note: event itself is COMPLETED (completionMethod=${event.completionMethod}). ` +
      `If you want it LIVE again, flip it via the admin panel — this script only touches fights.`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
