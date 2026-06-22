/** Read-only: verify the start-time discovery system is live + producing provenance. */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
  const now = new Date();

  // 1) Events whose start time was set BY discovery (provenance present).
  const discovered = await prisma.event.findMany({
    where: { startTimeSource: 'discovery' },
    orderBy: { startTimeDiscoveredAt: 'desc' },
    take: 25,
    select: {
      name: true, promotion: true, date: true, eventStatus: true,
      earlyPrelimStartTime: true, prelimStartTime: true, mainStartTime: true,
      startTimeConfidence: true, startTimeDiscoveredAt: true, startTimeSourceUrls: true,
    },
  });

  console.log(`\n=== Events with startTimeSource='discovery' (most recent 25 of total) ===`);
  const total = await prisma.event.count({ where: { startTimeSource: 'discovery' } });
  console.log(`Total discovery-sourced events: ${total}\n`);
  for (const e of discovered) {
    const fmt = (d: Date | null) => d ? d.toISOString().slice(5, 16).replace('T', ' ') : '—';
    console.log(
      `  ${(e.promotion ?? '?').padEnd(12)} ${e.name.slice(0, 34).padEnd(35)} ` +
      `[${e.eventStatus.padEnd(9)}] early=${fmt(e.earlyPrelimStartTime)} prelim=${fmt(e.prelimStartTime)} main=${fmt(e.mainStartTime)} ` +
      `conf=${e.startTimeConfidence ?? '-'} discAt=${e.startTimeDiscoveredAt?.toISOString().slice(0, 10) ?? '-'} ` +
      `srcs=${Array.isArray(e.startTimeSourceUrls) ? (e.startTimeSourceUrls as any[]).length : 0}`
    );
  }

  // 2) Has discovery run recently at all? (attempt stamp, even on non-applies)
  const recentAttempts = await prisma.event.count({
    where: { startTimeDiscoveredAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
  });
  console.log(`\nEvents stamped with a discovery ATTEMPT in last 7 days: ${recentAttempts}`);

  const lastAttempt = await prisma.event.findFirst({
    where: { startTimeDiscoveredAt: { not: null } },
    orderBy: { startTimeDiscoveredAt: 'desc' },
    select: { startTimeDiscoveredAt: true, name: true },
  });
  console.log(`Most recent discovery attempt: ${lastAttempt?.startTimeDiscoveredAt?.toISOString() ?? 'NEVER'} (${lastAttempt?.name ?? '-'})`);

  // 3) Current GAP: upcoming non-UFC events still missing early-bell times.
  const gap = await prisma.event.findMany({
    where: {
      eventStatus: 'UPCOMING',
      date: { gte: new Date(now.getTime() - 24 * 3600 * 1000), lte: new Date(now.getTime() + 21 * 24 * 3600 * 1000) },
      earlyPrelimStartTime: null,
      prelimStartTime: null,
    },
    orderBy: { date: 'asc' },
    select: { name: true, promotion: true, date: true, startTimeDiscoveredAt: true },
  });
  console.log(`\n=== Upcoming (<=21d) events STILL missing early+prelim times (the gap) ===  ${gap.length} events`);
  for (const e of gap) {
    console.log(`  ${(e.promotion ?? '?').padEnd(12)} ${e.name.slice(0, 40).padEnd(41)} ${e.date.toISOString().slice(0, 10)} lastTry=${e.startTimeDiscoveredAt?.toISOString().slice(0, 10) ?? 'never'}`);
  }

  await prisma.$disconnect();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
