/**
 * Tapology fight-bleed detector (read-only).
 *
 * Finds the fight-bleed signature: the same fighter-pair appearing on MORE
 * THAN ONE event of the same promotion (scraperType='tapology'). Splits results
 * into:
 *   - BLEED SIGNATURE: two such events <= REMATCH_MIN_DAYS apart — almost
 *     certainly a bled copy of an adjacent event's bout (or an event-level
 *     duplicate row), NOT a rematch. These are corrective-cleanup candidates.
 *   - LIKELY REMATCH: events > REMATCH_MIN_DAYS apart — real rematches; ignore.
 *
 * This is the validation half of the bleed hardening (Layer 1 scrapers + Layer 2
 * import backstop). Run it after a cleanup or after a scraper change to confirm
 * the cross-event dup count is what you expect. It does NOT modify anything.
 *
 * NOTE: some same-date BLEED-SIGNATURE pairs are actually event-level
 * duplication (one real card split into two Event rows) — that's the separate
 * `project_cross_scraper_event_dedup` workstream, not in-card fight bleed.
 *
 * Run from packages/backend (uses DATABASE_URL = Render external):
 *   node_modules/.bin/ts-node src/scripts/detectTapologyFightBleed.ts
 *
 * See docs/plans/tapology-fight-bleed-hardening-2026-05-26.md
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REMATCH_MIN_DAYS = 30;

async function main() {
  const fights = await prisma.fight.findMany({
    where: { event: { scraperType: 'tapology' } },
    select: {
      fighter1Id: true,
      fighter2Id: true,
      event: { select: { id: true, name: true, promotion: true, date: true } },
    },
  });

  const byPair = new Map<string, Map<string, { name: string; date: Date | null }>>();
  for (const f of fights) {
    const pair = [f.fighter1Id, f.fighter2Id].sort().join('|');
    const key = `${f.event.promotion}::${pair}`;
    if (!byPair.has(key)) byPair.set(key, new Map());
    byPair.get(key)!.set(f.event.id, { name: f.event.name, date: f.event.date });
  }

  const bleed: string[] = [];
  let rematch = 0;
  for (const [key, eventsMap] of byPair) {
    const events = [...eventsMap.values()];
    if (events.length < 2) continue;
    let close = false;
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i].date, b = events[j].date;
        if (a && b && Math.abs(a.getTime() - b.getTime()) / 86_400_000 <= REMATCH_MIN_DAYS) close = true;
      }
    }
    const [promo] = key.split('::');
    const line = `  [${promo}] ` + events
      .map(e => `${e.name} (${e.date ? e.date.toISOString().slice(0, 10) : '?'})`)
      .join('  ||  ');
    if (close) bleed.push(line);
    else rematch++;
  }

  console.log(`\nTapology fights scanned: ${fights.length}`);
  console.log(`Same-pair-on-multiple-same-promotion-events groups: ${bleed.length + rematch}`);
  console.log(`  BLEED SIGNATURE (<= ${REMATCH_MIN_DAYS}d apart) — cleanup candidates: ${bleed.length}`);
  bleed.forEach(l => console.log(l));
  console.log(`  LIKELY REMATCH (> ${REMATCH_MIN_DAYS}d apart) — ignore: ${rematch}`);

  await prisma.$disconnect();
  process.exit(bleed.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
