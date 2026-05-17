/**
 * Single-event enrichment primitive.
 *
 * Flow:
 *   1. Load the card (UPCOMING fights) from the DB — authoritative.
 *   2. Fetch editorial sources (Brave) + optional structured page text
 *      (UFC.com via Puppeteer or Tapology HTML) as ADDITIONAL editorial.
 *   3. Send {card, sources} to the LLM. It enriches by fightId, never
 *      invents fights.
 *   4. Write straight back by fightId.
 */

import { PrismaClient } from '@prisma/client';
import {
  fetchUFCEventPreview,
  type PreviewBrowserHandle,
} from './fetchUFCEventPreview';
import { fetchTapologyEventPreview } from './fetchTapologyEventPreview';
import { fetchEditorialPreviews } from './fetchEditorialPreviews';
import {
  extractFightEnrichment,
  type CardItem,
} from './extractFightEnrichment';
import { persistEnrichment, type PersistResult } from './persist';

// Haiku 4.5 prices per 1M tokens (2026-01).
const PRICE_INPUT_PER_MTOK = 1.0;
const PRICE_CACHE_WRITE_PER_MTOK = 1.25;
const PRICE_CACHE_READ_PER_MTOK = 0.1;
const PRICE_OUTPUT_PER_MTOK = 5.0;

export interface EnrichOneEventOptions {
  dryRun?: boolean;
  /** Reuse a Puppeteer browser across many UFC events (cron path). Optional. */
  browserHandle?: PreviewBrowserHandle;
  /** Max editorial articles to fetch (default 3). */
  editorialTopN?: number;
}

export interface EnrichOneEventResult {
  eventId: string;
  eventName: string;
  promotion: string;
  cardSize: number;
  sourcesFetched: Array<{ url: string; chars: number; label: string }>;
  fightsEnriched: number;       // LLM returned a record we could write
  fightsWithNarrative: number;  // of those, how many had whyCare/storylines/stakes
  uncoveredFightIds: string[];  // card fights LLM didn't speak to (no editorial coverage)
  ghostFightIds: string[];      // LLM tried to emit fightIds not on the card (dropped)
  wroteCount: number;
  costUsd: number;
  elapsedMs: number;
  persistResult: PersistResult;
  /** Set when the run bailed before LLM (no card, etc.). */
  abortedReason?: string;
}

export async function enrichOneEvent(
  prisma: PrismaClient,
  eventId: string,
  opts: EnrichOneEventOptions = {},
): Promise<EnrichOneEventResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Event ${eventId} not found`);

  const card = await loadCard(prisma, eventId);
  const baseResult = {
    eventId: event.id,
    eventName: event.name,
    promotion: event.promotion,
    cardSize: card.length,
  };

  if (card.length === 0) {
    return {
      ...baseResult,
      sourcesFetched: [],
      fightsEnriched: 0,
      fightsWithNarrative: 0,
      uncoveredFightIds: [],
      ghostFightIds: [],
      wroteCount: 0,
      costUsd: 0,
      elapsedMs: 0,
      persistResult: { wroteCount: 0, writtenFightIds: [], uncoveredFightIds: [] },
      abortedReason: 'no_upcoming_fights',
    };
  }

  const sourceUrl = event.ufcUrl ?? '';
  const isUfcCom = /(^|\.)ufc\.com\b/i.test(sourceUrl);
  const isTapology = /(^|\.)tapology\.com\b/i.test(sourceUrl);
  const editorialTopN = opts.editorialTopN ?? 3;

  const sources: Array<{ url: string; text: string; label?: string }> = [];
  const sourcesFetched: EnrichOneEventResult['sourcesFetched'] = [];

  // Supplementary structured page text — treated as ADDITIONAL editorial input,
  // not as the card source. The DB owns the card.
  if (isUfcCom && opts.browserHandle) {
    const snap = await fetchUFCEventPreview(sourceUrl, opts.browserHandle);
    if (snap) {
      sources.push({ url: snap.finalUrl, text: snap.text, label: 'ufc.com' });
      sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'ufc.com' });
    }
  } else if (isTapology) {
    const snap = await fetchTapologyEventPreview(sourceUrl);
    if (snap) {
      sources.push({ url: snap.finalUrl, text: snap.text, label: 'tapology.com' });
      sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'tapology.com' });
    }
  }

  // Editorial — applies to every promotion.
  const editorial = await fetchEditorialPreviews(event.name, undefined, { topN: editorialTopN });
  for (const s of editorial) {
    sources.push({ url: s.url, text: s.text, label: s.domain });
    sourcesFetched.push({ url: s.url, chars: s.text.length, label: s.domain });
  }

  if (sources.length === 0) {
    return {
      ...baseResult,
      sourcesFetched: [],
      fightsEnriched: 0,
      fightsWithNarrative: 0,
      uncoveredFightIds: card.map((c) => c.fightId),
      ghostFightIds: [],
      wroteCount: 0,
      costUsd: 0,
      elapsedMs: 0,
      persistResult: { wroteCount: 0, writtenFightIds: [], uncoveredFightIds: card.map((c) => c.fightId) },
      abortedReason: 'no_sources',
    };
  }

  const t0 = Date.now();
  const result = await extractFightEnrichment({
    promotion: event.promotion,
    eventName: event.name,
    eventDate: event.date.toISOString().slice(0, 10),
    card,
    sources,
  });
  const elapsedMs = Date.now() - t0;

  const u = result.usage;
  const costUsd =
    (u.inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (u.cacheCreationInputTokens / 1_000_000) * PRICE_CACHE_WRITE_PER_MTOK +
    (u.cacheReadInputTokens / 1_000_000) * PRICE_CACHE_READ_PER_MTOK +
    (u.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK;

  const fightsWithNarrative = result.fights.filter(
    (f) => f.whyCare || f.storylines.length || f.stakes.length,
  ).length;

  const persistResult = await persistEnrichment(
    prisma,
    card,
    result.fights,
    sources.map((s) => s.url),
    { dryRun: !!opts.dryRun },
  );

  return {
    ...baseResult,
    sourcesFetched,
    fightsEnriched: result.fights.length,
    fightsWithNarrative,
    uncoveredFightIds: persistResult.uncoveredFightIds,
    ghostFightIds: result.ghostFightIds,
    wroteCount: persistResult.wroteCount,
    costUsd,
    elapsedMs,
    persistResult,
  };
}

async function loadCard(prisma: PrismaClient, eventId: string): Promise<CardItem[]> {
  const fights = await prisma.fight.findMany({
    where: { eventId, fightStatus: 'UPCOMING' },
    include: {
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
    orderBy: { orderOnCard: 'asc' },
  });

  // Main event = orderOnCard === 1 (per schema comment on Fight.orderOnCard).
  return fights.map((f) => ({
    fightId: f.id,
    fighter1: fullName(f.fighter1),
    fighter2: fullName(f.fighter2),
    weightClass: f.weightClass ?? null,
    cardSection: normalizeCardSection(f.cardType),
    orderOnCard: f.orderOnCard ?? null,
    isMainEvent: f.orderOnCard === 1,
    isTitle: !!f.isTitle,
  }));
}

function normalizeCardSection(cardType: string | null): string | null {
  if (!cardType) return null;
  const t = cardType.toLowerCase().trim();
  if (t.includes('early')) return 'EARLY_PRELIMS';
  if (t.includes('prelim')) return 'PRELIMS';
  if (t.includes('main')) return 'MAIN_CARD';
  return null;
}

function fullName(f: { firstName: string; lastName: string }): string {
  return `${f.firstName} ${f.lastName}`.trim();
}
