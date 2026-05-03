import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const REGIONS = ['US','CA','GB','AU','NZ','EU'] as const;

(async () => {
  // Active = has upcoming events
  const active = await p.event.groupBy({
    by: ['promotion'],
    where: { date: { gte: new Date() } },
    _count: { _all: true },
  });
  const promos = active.filter(a => a._count._all > 0).sort((a,b) => b._count._all - a._count._all);

  const defaults = await p.promotionBroadcastDefault.findMany({ select: { promotion: true, region: true, channel: { select: { name: true } } } });
  const byPromoRegion = new Map<string, string[]>();
  for (const d of defaults) {
    const k = `${d.promotion}|${d.region}`;
    if (!byPromoRegion.has(k)) byPromoRegion.set(k, []);
    byPromoRegion.get(k)!.push(d.channel.name);
  }

  console.log('Promotion coverage (✓ = has default; — = gap):\n');
  console.log('Promotion'.padEnd(22), 'Events', ...REGIONS.map(r => r.padEnd(4)));
  console.log('─'.repeat(70));
  for (const a of promos) {
    const cells = REGIONS.map(r => byPromoRegion.has(`${a.promotion}|${r}`) ? '✓'.padEnd(4) : '—'.padEnd(4));
    console.log(a.promotion.padEnd(22), String(a._count._all).padStart(4).padEnd(7), ...cells);
  }
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
