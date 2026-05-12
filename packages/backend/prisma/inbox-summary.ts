import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const counts = await p.broadcastDiscovery.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  console.log('--- All-time counts by status ---');
  console.log(counts);

  const pending = await p.broadcastDiscovery.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    select: {
      promotion: true,
      region: true,
      cardSection: true,
      channelNameRaw: true,
      channelSlug: true,
      tier: true,
      confidence: true,
      changeType: true,
    },
  });
  console.log(`\n--- PENDING findings (${pending.length}) ---`);
  for (const f of pending) {
    const conf = f.confidence.toFixed(2);
    const slug = f.channelSlug ? `[${f.channelSlug}]` : '[NEW CHANNEL]';
    const sec = (f.cardSection || 'WHOLE_EVENT').padEnd(13);
    console.log(
      `  ${conf}  ${f.changeType.padEnd(9)}  ${f.promotion.padEnd(8)}  ${f.region.padEnd(3)}  ${sec}  ${f.channelNameRaw.padEnd(28)} ${slug}  tier=${f.tier ?? '?'}`,
    );
  }
  await p.$disconnect();
})();
