/**
 * Audit upcoming events for How-to-Watch coverage.
 * Lists events with neither per-event EventBroadcast rows nor PromotionBroadcastDefault rows
 * for the standard regions — i.e. events that render an empty HowToWatch card today.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REGIONS = ['US', 'CA', 'GB', 'AU', 'NZ', 'EU'];

(async () => {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 90);

  const events = await prisma.event.findMany({
    where: {
      date: { gte: now, lt: horizon },
      eventStatus: 'UPCOMING',
    },
    select: {
      id: true,
      name: true,
      date: true,
      promotion: true,
      broadcasts: { select: { id: true } },
    },
    orderBy: { date: 'asc' },
  });

  // Cache defaults by promotion
  const promotionsSeen = Array.from(new Set(events.map(e => e.promotion).filter(Boolean) as string[]));
  const defaultsByPromotion: Record<string, Set<string>> = {};
  for (const promotion of promotionsSeen) {
    const defaults = await prisma.promotionBroadcastDefault.findMany({
      where: { promotion, isActive: true },
      select: { region: true },
    });
    defaultsByPromotion[promotion] = new Set(defaults.map(d => d.region));
  }

  const uncovered: typeof events = [];
  const partial: { event: typeof events[number]; missingRegions: string[] }[] = [];

  for (const e of events) {
    if (e.broadcasts.length > 0) continue; // has per-event rows, fine
    const promotionDefaults = defaultsByPromotion[e.promotion ?? ''] ?? new Set();
    const missingRegions = REGIONS.filter(r => !promotionDefaults.has(r));
    if (missingRegions.length === REGIONS.length) {
      uncovered.push(e);
    } else if (missingRegions.length > 0) {
      partial.push({ event: e, missingRegions });
    }
  }

  console.log(`\n=== UPCOMING EVENTS (next 90d) ===`);
  console.log(`Total: ${events.length}`);
  console.log(`Fully uncovered (no per-event rows, no defaults in any region): ${uncovered.length}`);
  console.log(`Partially covered (defaults missing in some regions): ${partial.length}\n`);

  if (uncovered.length) {
    console.log('--- FULLY UNCOVERED ---');
    for (const e of uncovered) {
      console.log(`  ${e.date.toISOString().slice(0,10)}  [${e.promotion}]  ${e.name}  (${e.id})`);
    }
  }

  if (partial.length) {
    console.log('\n--- PARTIAL COVERAGE ---');
    for (const { event, missingRegions } of partial) {
      console.log(`  ${event.date.toISOString().slice(0,10)}  [${event.promotion}]  ${event.name}  — missing: ${missingRegions.join(',')}`);
    }
  }

  await prisma.$disconnect();
})();
