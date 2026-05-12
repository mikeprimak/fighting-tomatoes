import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const counts = await p.broadcastDiscovery.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  console.log('--- BroadcastDiscovery by status ---');
  console.log(counts);

  const recent = await p.broadcastDiscovery.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      promotion: true,
      region: true,
      status: true,
      confidence: true,
      channelSlug: true,
      channelNameRaw: true,
      createdAt: true,
      changeType: true,
    },
  });
  console.log('--- 10 most recent ---');
  console.log(JSON.stringify(recent, null, 2));
  await p.$disconnect();
})();
