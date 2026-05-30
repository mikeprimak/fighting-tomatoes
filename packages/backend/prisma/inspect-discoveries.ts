import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const rows = await p.broadcastDiscovery.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ promotion: 'asc' }, { region: 'asc' }, { confidence: 'desc' }],
  });
  console.log('Found', rows.length, 'pending discoveries:');
  for (const r of rows) {
    console.log('---');
    console.log(`[${r.changeType}] ${r.promotion} / ${r.region} → ${r.channelNameRaw} (slug=${r.channelSlug ?? 'null'}, tier=${r.tier ?? 'null'}, conf=${r.confidence})`);
    console.log('  src:', r.sourceUrl);
    console.log('  snippet:', r.snippet.slice(0, 180));
  }
  await p.$disconnect();
})();
