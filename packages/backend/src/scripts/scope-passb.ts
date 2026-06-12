import { prisma } from '../lib/prisma';
async function main() {
  const targets = await prisma.fight.findMany({
    where: {
      fightStatus: 'COMPLETED',
      winner: { not: null },
      aiPostFightSummary: null,
      totalRatings: { gte: 1 },
    },
    select: { id: true, eventId: true, totalRatings: true,
      event: { select: { promotion: true, date: true, name: true } } },
    orderBy: { totalRatings: 'desc' },
    take: 2000,
  });
  const events = new Map<string, { n: number; promotion: string; date: Date; name: string }>();
  for (const f of targets) {
    const e = events.get(f.eventId) ?? { n: 0, promotion: f.event.promotion, date: f.event.date, name: f.event.name };
    e.n++;
    events.set(f.eventId, e);
  }
  const byPromo = new Map<string, number>();
  for (const e of events.values()) byPromo.set(e.promotion, (byPromo.get(e.promotion) ?? 0) + 1);
  const years = new Map<number, number>();
  for (const e of events.values()) { const y = e.date.getUTCFullYear(); years.set(y, (years.get(y) ?? 0) + 1); }
  console.log(`target fights: ${targets.length}`);
  console.log(`distinct events: ${events.size}`);
  console.log(`rating range: ${targets[0].totalRatings} .. ${targets[targets.length - 1].totalRatings}`);
  console.log('events by promotion:', Object.fromEntries([...byPromo.entries()].sort((a, b) => b[1] - a[1])));
  console.log('events by year:', Object.fromEntries([...years.entries()].sort()));
  // how many extra (non-target) recap-less fights ride along on these events?
  const extra = await prisma.fight.count({
    where: {
      eventId: { in: [...events.keys()] },
      fightStatus: 'COMPLETED', winner: { not: null }, aiPostFightSummary: null,
      aiPostFightEnrichedAt: null,
    },
  });
  console.log(`total recap-less fights on those events (incl. ride-alongs): ${extra}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
