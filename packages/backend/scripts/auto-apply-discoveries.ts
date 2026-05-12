/**
 * Auto-apply high-confidence BroadcastDiscovery findings.
 *
 * Safe-by-default rules:
 *   1. status = PENDING
 *   2. confidence ≥ MIN_CONFIDENCE (default 0.90)
 *   3. channelSlug resolves to a known BroadcastChannel
 *   4. tier is set
 *   5. changeType IN ('NEW', 'CHANGED')
 *
 * For both NEW and CHANGED we *additively* upsert a PromotionBroadcastDefault
 * row — we do NOT deactivate sibling defaults. This is intentionally less
 * aggressive than the admin Apply endpoint, which deactivates siblings on
 * CHANGED. The auto-applier should never silently turn off a working
 * broadcaster; the human admin keeps that power.
 *
 * Usage:
 *   pnpm tsx scripts/auto-apply-discoveries.ts                # apply
 *   AUTO_APPLY_DRY_RUN=1 pnpm tsx scripts/auto-apply-discoveries.ts
 *   AUTO_APPLY_MIN_CONFIDENCE=0.85 pnpm tsx scripts/auto-apply-discoveries.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIN_CONFIDENCE = parseFloat(process.env.AUTO_APPLY_MIN_CONFIDENCE ?? '0.90');
const DRY_RUN = process.env.AUTO_APPLY_DRY_RUN === '1';

(async () => {
  const candidates = await prisma.broadcastDiscovery.findMany({
    where: {
      status: 'PENDING',
      confidence: { gte: MIN_CONFIDENCE },
      channelSlug: { not: null },
      tier: { not: null },
      changeType: { in: ['NEW', 'CHANGED'] },
    },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'asc' }],
  });

  console.log(
    `[auto-apply] ${DRY_RUN ? 'DRY-RUN ' : ''}min-confidence=${MIN_CONFIDENCE} ` +
    `→ ${candidates.length} candidate(s)`,
  );

  if (candidates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Cache channel id lookups
  const slugs = Array.from(new Set(candidates.map(c => c.channelSlug!).filter(Boolean)));
  const channels = await prisma.broadcastChannel.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, name: true },
  });
  const slugToChannel = new Map(channels.map(c => [c.slug, c]));

  let applied = 0, skipped = 0;
  const log: string[] = [];

  for (const d of candidates) {
    const channel = slugToChannel.get(d.channelSlug!);
    if (!channel) {
      skipped++;
      log.push(`  SKIP  ${d.channelSlug}: channel not found in DB`);
      continue;
    }
    const tier = d.tier!;

    // Idempotent upsert: if the (promotion, region, channel) default exists, bump
    // tier + lastDiscoveryAt. Otherwise create.
    const existing = await prisma.promotionBroadcastDefault.findUnique({
      where: { promotion_region_channelId: {
        promotion: d.promotion, region: d.region, channelId: channel.id,
      } },
    });

    const action = existing
      ? (existing.tier === tier ? 'bump' : `update (tier ${existing.tier} → ${tier})`)
      : 'create';

    log.push(
      `  ${DRY_RUN ? 'would ' : ''}${action.padEnd(28)} ` +
      `conf=${d.confidence.toFixed(2)}  ${d.changeType.padEnd(7)}  ` +
      `${d.promotion.padEnd(18)} ${d.region.padEnd(3)} → ${channel.name} [${tier}]`,
    );

    if (DRY_RUN) {
      applied++;
      continue;
    }

    if (existing) {
      await prisma.promotionBroadcastDefault.update({
        where: { id: existing.id },
        data: { tier: tier as any, isActive: true, lastDiscoveryAt: new Date() },
      });
    } else {
      await prisma.promotionBroadcastDefault.create({
        data: {
          promotion: d.promotion,
          region: d.region,
          channelId: channel.id,
          tier: tier as any,
          isActive: true,
          lastDiscoveryAt: new Date(),
          note: d.snippet.slice(0, 200),
        },
      });
    }

    await prisma.broadcastDiscovery.update({
      where: { id: d.id },
      data: {
        status: 'APPLIED',
        reviewedAt: new Date(),
        reviewNote: `Auto-applied (confidence ${d.confidence.toFixed(2)} ≥ ${MIN_CONFIDENCE})`,
      },
    });

    applied++;
  }

  console.log(log.join('\n'));
  console.log(
    `\n[auto-apply] ${DRY_RUN ? 'would apply' : 'applied'} ${applied}, skipped ${skipped}.`,
  );

  // Show what's still pending after auto-apply
  if (!DRY_RUN) {
    const stillPending = await prisma.broadcastDiscovery.count({ where: { status: 'PENDING' } });
    console.log(`[auto-apply] remaining PENDING: ${stillPending} (need human review)`);
  }

  await prisma.$disconnect();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
