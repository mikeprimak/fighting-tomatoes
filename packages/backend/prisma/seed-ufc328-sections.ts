import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

(async () => {
  const eventId = 'b992560c-fe62-417b-8953-e3323cdf7b2a';
  const [pp, cbs, fp] = await Promise.all([
    p.broadcastChannel.findUnique({ where: { slug: 'paramount-plus' }, select: { id: true } }),
    p.broadcastChannel.findUnique({ where: { slug: 'cbs' }, select: { id: true } }),
    p.broadcastChannel.findUnique({ where: { slug: 'ufc-fight-pass' }, select: { id: true } }),
  ]);
  if (!pp || !cbs || !fp) {
    console.error('missing channel', { pp, cbs, fp });
    return;
  }
  const rows: Array<{ channelId: string; cardSection: 'EARLY_PRELIMS' | 'PRELIMS' | 'MAIN_CARD'; tier: 'FREE' | 'SUBSCRIPTION' | 'PPV' }> = [
    { channelId: fp.id,  cardSection: 'EARLY_PRELIMS', tier: 'SUBSCRIPTION' },
    { channelId: cbs.id, cardSection: 'PRELIMS',       tier: 'FREE' },
    { channelId: pp.id,  cardSection: 'MAIN_CARD',     tier: 'SUBSCRIPTION' },
  ];
  for (const r of rows) {
    const result = await p.eventBroadcast.upsert({
      where: { eventId_channelId_region: { eventId, channelId: r.channelId, region: 'US' } },
      update: { cardSection: r.cardSection, tier: r.tier, source: 'MANUAL' },
      create: { eventId, channelId: r.channelId, region: 'US', cardSection: r.cardSection, tier: r.tier, source: 'MANUAL' },
    });
    console.log('upsert', { id: result.id, channelId: r.channelId, section: r.cardSection });
  }
  const verify = await p.eventBroadcast.findMany({
    where: { eventId, region: 'US' },
    include: { channel: { select: { slug: true } } },
  });
  console.log('verify rows:', verify.map(v => ({ s: v.cardSection, c: v.channel.slug, t: v.tier })));
  await p.$disconnect();
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
