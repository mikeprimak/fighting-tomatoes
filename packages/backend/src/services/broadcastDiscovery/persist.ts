/**
 * Write classified findings to BroadcastDiscovery, with dedupe against
 * recently-rejected entries so we don't keep re-suggesting the same thing.
 */

import type { PrismaClient } from '@prisma/client';
import type { ClassifiedFinding } from './diff';

const REJECT_DEDUPE_WINDOW_DAYS = 90;

export async function persistFindings(
  prisma: PrismaClient,
  runId: string,
  promotion: string,
  region: string,
  findings: ClassifiedFinding[],
): Promise<{ inserted: number; suppressed: number; bumpedConfirmed: number }> {
  if (findings.length === 0) return { inserted: 0, suppressed: 0, bumpedConfirmed: 0 };

  // Pull recently-rejected entries to filter against.
  const cutoff = new Date(Date.now() - REJECT_DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rejected = await prisma.broadcastDiscovery.findMany({
    where: {
      promotion,
      region,
      status: 'REJECTED',
      reviewedAt: { gte: cutoff },
    },
    select: { channelSlug: true, channelNameRaw: true },
  });
  const rejectedKeys = new Set(
    rejected.map(r => `${r.channelSlug ?? ''}|${r.channelNameRaw.toLowerCase()}`),
  );

  let inserted = 0, suppressed = 0, bumpedConfirmed = 0;

  for (const f of findings) {
    const key = `${f.channelSlug ?? ''}|${f.channelName.toLowerCase()}`;
    if (rejectedKeys.has(key)) {
      suppressed++;
      continue;
    }

    // For CONFIRMED findings, only bump lastDiscoveryAt — don't pile up rows.
    if (f.changeType === 'CONFIRMED' && f.channelSlug) {
      const channel = await prisma.broadcastChannel.findUnique({
        where: { slug: f.channelSlug }, select: { id: true },
      });
      if (channel) {
        await prisma.promotionBroadcastDefault.updateMany({
          where: { promotion, region, channelId: channel.id },
          data: { lastDiscoveryAt: new Date() },
        });
        bumpedConfirmed++;
      }
      continue;
    }

    await prisma.broadcastDiscovery.create({
      data: {
        runId,
        promotion,
        region,
        channelSlug: f.channelSlug,
        channelNameRaw: f.channelName,
        tier: f.tier,
        sourceUrl: f.sourceUrl,
        snippet: f.snippet,
        confidence: f.confidence,
        changeType: f.changeType,
        status: 'PENDING',
      },
    });
    inserted++;
  }

  return { inserted, suppressed, bumpedConfirmed };
}
