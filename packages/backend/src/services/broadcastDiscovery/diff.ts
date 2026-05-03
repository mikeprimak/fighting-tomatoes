/**
 * Compare extracted findings to current PromotionBroadcastDefault rows
 * and classify each finding as NEW, CONFIRMED, or CHANGED.
 */

import type { PrismaClient } from '@prisma/client';
import type { ExtractedFinding } from './extract';

export type ChangeType = 'NEW' | 'CONFIRMED' | 'CHANGED';

export interface ClassifiedFinding extends ExtractedFinding {
  channelSlug: string | null; // null when no matching channel exists in DB
  changeType: ChangeType;
}

/**
 * Match a free-text channel name to a known BroadcastChannel.slug.
 * Uses normalised case-insensitive equality first, then a substring check.
 */
export async function resolveChannelSlug(
  prisma: PrismaClient,
  channelName: string,
): Promise<string | null> {
  const normalised = channelName.trim().toLowerCase().replace(/\s+/g, ' ');
  const all = await prisma.broadcastChannel.findMany({
    select: { slug: true, name: true },
  });
  // Exact (case-insensitive) match first
  const exact = all.find(c => c.name.toLowerCase() === normalised);
  if (exact) return exact.slug;
  // Substring match — channel name appears within the extracted text or vice-versa
  const sub = all.find(c =>
    normalised.includes(c.name.toLowerCase()) ||
    c.name.toLowerCase().includes(normalised),
  );
  return sub?.slug ?? null;
}

export async function classifyFindings(
  prisma: PrismaClient,
  promotion: string,
  region: string,
  findings: ExtractedFinding[],
): Promise<ClassifiedFinding[]> {
  const existing = await prisma.promotionBroadcastDefault.findMany({
    where: { promotion, region, isActive: true },
    include: { channel: { select: { slug: true } } },
  });
  const existingSlugs = new Set(existing.map(e => e.channel.slug));

  const result: ClassifiedFinding[] = [];
  for (const f of findings) {
    const channelSlug = await resolveChannelSlug(prisma, f.channelName);
    let changeType: ChangeType;
    if (!channelSlug) {
      // We can't resolve it to a known channel — treat as NEW; admin will create.
      changeType = 'NEW';
    } else if (existingSlugs.has(channelSlug)) {
      changeType = 'CONFIRMED';
    } else if (existing.length > 0) {
      // We had something on file for this region but not this channel.
      changeType = 'CHANGED';
    } else {
      changeType = 'NEW';
    }
    result.push({ ...f, channelSlug, changeType });
  }
  return result;
}
