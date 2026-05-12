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

  // Pull entries the admin already triaged (rejected OR marked duplicate) within
  // the dedupe window, so we don't keep re-suggesting the same thing every
  // Monday. Without this, Duplicate would only mark the row but not suppress
  // future suggestions — defeating the point of the button.
  const cutoff = new Date(Date.now() - REJECT_DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const suppressedRows = await prisma.broadcastDiscovery.findMany({
    where: {
      promotion,
      region,
      status: { in: ['REJECTED', 'DUPLICATE'] },
      reviewedAt: { gte: cutoff },
    },
    select: { channelSlug: true, channelNameRaw: true },
  });
  const suppressedKeys = new Set(
    suppressedRows.map(r => `${r.channelSlug ?? ''}|${r.channelNameRaw.toLowerCase()}`),
  );

  let inserted = 0, suppressed = 0, bumpedConfirmed = 0;

  for (const f of findings) {
    const key = `${f.channelSlug ?? ''}|${f.channelName.toLowerCase()}`;
    if (suppressedKeys.has(key)) {
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
