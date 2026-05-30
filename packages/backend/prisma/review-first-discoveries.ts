/**
 * One-shot reviewer for the first discovery run.
 * Applies the high-confidence findings, rejects the noise.
 *
 * After this run is processed, future discoveries get reviewed via the
 * admin panel (UI to be added later).
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const pending = await p.broadcastDiscovery.findMany({
    where: { status: 'PENDING' },
    orderBy: { confidence: 'desc' },
  });

  for (const d of pending) {
    let action: 'APPLY' | 'REJECT' | 'DUPLICATE';
    let note = '';
    let overrideSlug: string | null = null;

    // Decisions:
    if (d.promotion === 'ONE' && d.region === 'EU' && d.channelSlug === 'sky-sports') {
      action = 'APPLY';
      note = 'Applied: 0.92 confidence, official onefc.com page lists Sky Sports for EU.';
    } else if (d.promotion === 'ONE' && d.region === 'EU' && d.channelSlug === 'prime-video') {
      action = 'REJECT';
      note = 'Rejected: Prime Video for ONE is US/CA only. Snippet does not specify EU coverage.';
    } else if (d.promotion === 'ONE' && d.region === 'NZ') {
      action = 'DUPLICATE';
      note = 'Already have sky-sport-nz default for ONE/NZ. LLM mapped "Sky Sport" to UK sky-sports slug — actual NZ channel is sky-sport-nz.';
    } else if (d.promotion === 'Zuffa Boxing' && d.region === 'EU' && d.channelSlug === 'sky-sports') {
      // We already have one of these. Apply one, mark the second as duplicate.
      const existingZuffaEu = await p.promotionBroadcastDefault.findFirst({
        where: { promotion: 'Zuffa Boxing', region: 'EU', isActive: true },
      });
      if (existingZuffaEu) {
        action = 'DUPLICATE';
        note = 'Already applied via the previous discovery row.';
      } else {
        action = 'APPLY';
        note = 'Applied: Sky Sports primary UK/IE broadcaster also covers "several major European markets" per press release.';
      }
    } else {
      console.log('SKIP (no rule):', d.id, d.promotion, d.region, d.channelSlug);
      continue;
    }

    if (action === 'APPLY') {
      const slug = overrideSlug ?? d.channelSlug;
      if (!slug) { console.log('SKIP (no slug):', d.id); continue; }
      const channel = await p.broadcastChannel.findUnique({ where: { slug }, select: { id: true } });
      if (!channel) { console.log('SKIP (channel missing):', slug); continue; }
      const tier = (d.tier ?? 'SUBSCRIPTION') as 'FREE' | 'SUBSCRIPTION' | 'PPV';

      const existing = await p.promotionBroadcastDefault.findUnique({
        where: { promotion_region_channelId: { promotion: d.promotion, region: d.region, channelId: channel.id } },
      });
      if (existing) {
        await p.promotionBroadcastDefault.update({
          where: { id: existing.id },
          data: { tier, isActive: true, lastDiscoveryAt: new Date() },
        });
      } else {
        await p.promotionBroadcastDefault.create({
          data: {
            promotion: d.promotion, region: d.region, channelId: channel.id,
            tier, isActive: true, lastDiscoveryAt: new Date(),
            note: d.snippet.slice(0, 200),
          },
        });
      }
    }

    await p.broadcastDiscovery.update({
      where: { id: d.id },
      data: {
        status: action === 'APPLY' ? 'APPLIED' : action === 'REJECT' ? 'REJECTED' : 'DUPLICATE',
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });

    console.log(`${action.padEnd(10)} ${d.promotion}/${d.region} → ${d.channelSlug ?? '(none)'} — ${note}`);
  }

  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
