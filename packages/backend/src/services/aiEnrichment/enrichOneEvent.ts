/**
 * Single-event enrichment primitive. Fetches sources, runs the LLM extract,
 * matches to UPCOMING DB fights, and (unless dryRun) persists the result.
 * Used by both the CLI script and the cron orchestrator.
 */

import { PrismaClient } from '@prisma/client';
import {
  fetchUFCEventPreview,
  type PreviewBrowserHandle,
} from './fetchUFCEventPreview';
import { fetchTapologyEventPreview } from './fetchTapologyEventPreview';
import { fetchEditorialPreviews } from './fetchEditorialPreviews';
import { extractFightEnrichment } from './extractFightEnrichment';
import { persistEnrichment, type PersistResult } from './persist';

// Haiku 4.5 prices per 1M tokens (2026-01).
const PRICE_INPUT_PER_MTOK = 1.0;
const PRICE_CACHE_WRITE_PER_MTOK = 1.25;
const PRICE_CACHE_READ_PER_MTOK = 0.1;
const PRICE_OUTPUT_PER_MTOK = 5.0;

export interface EnrichOneEventOptions {
  /** Compute matches without writing. */
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
  sourcesFetched: Array<{ url: string; chars: number; label: string }>;
  fightsExtracted: number;
  fightsWithNarrative: number;
  matched: number;
  unmatched: number;
  uncoveredDbFightIds: string[];
  wroteCount: number;
  costUsd: number;
  elapsedMs: number;
  persistResult: PersistResult;
  /** Set when the run had to bail before extracting (no sources, etc.). */
  abortedReason?: string;
}

export async function enrichOneEvent(
  prisma: PrismaClient,
  eventId: string,
  opts: EnrichOneEventOptions = {},
): Promise<EnrichOneEventResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Event ${eventId} not found`);

  const sourceUrl = event.ufcUrl ?? '';
  const isUfcCom = /(^|\.)ufc\.com\b/i.test(sourceUrl);
  const isTapology = /(^|\.)tapology\.com\b/i.test(sourceUrl);
  const editorialTopN = opts.editorialTopN ?? 3;

  const sources: Array<{ url: string; text: string }> = [];
  const sourcesFetched: EnrichOneEventResult['sourcesFetched'] = [];

  // Structured backbone — UFC.com (Puppeteer) for UFC, Tapology (fetch) for others.
  if (isUfcCom) {
    if (!opts.browserHandle) {
      console.warn(`[enrichOneEvent] ${event.name}: UFC.com source needs a browserHandle; skipping backbone`);
    } else {
      const snap = await fetchUFCEventPreview(sourceUrl, opts.browserHandle);
      if (snap) {
        sources.push({ url: snap.finalUrl, text: snap.text });
        sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'ufc.com' });
      }
    }
  } else if (isTapology) {
    const snap = await fetchTapologyEventPreview(sourceUrl);
    if (snap) {
      sources.push({ url: snap.finalUrl, text: snap.text });
      sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'tapology.com' });
    }
  }

  // Editorial layer — applies to all promotions.
  const editorial = await fetchEditorialPreviews(event.name, undefined, { topN: editorialTopN });
  for (const s of editorial) {
    sources.push({ url: s.url, text: s.text });
    sourcesFetched.push({ url: s.url, chars: s.text.length, label: s.domain });
  }

  if (sources.length === 0) {
    return {
      eventId: event.id,
      eventName: event.name,
      promotion: event.promotion,
      sourcesFetched: [],
      fightsExtracted: 0,
      fightsWithNarrative: 0,
      matched: 0,
      unmatched: 0,
      uncoveredDbFightIds: [],
      wroteCount: 0,
      costUsd: 0,
      elapsedMs: 0,
      persistResult: { matched: [], unmatchedRecords: [], uncoveredDbFightIds: [], wroteCount: 0 },
      abortedReason: 'no_sources',
    };
  }

  const t0 = Date.now();
  const result = await extractFightEnrichment({
    promotion: event.promotion,
    eventName: event.name,
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
    event.id,
    result.fights,
    sources.map((s) => s.url),
    { dryRun: !!opts.dryRun },
  );

  return {
    eventId: event.id,
    eventName: event.name,
    promotion: event.promotion,
    sourcesFetched,
    fightsExtracted: result.fights.length,
    fightsWithNarrative,
    matched: persistResult.matched.length,
    unmatched: persistResult.unmatchedRecords.length,
    uncoveredDbFightIds: persistResult.uncoveredDbFightIds,
    wroteCount: persistResult.wroteCount,
    costUsd,
    elapsedMs,
    persistResult,
  };
}
