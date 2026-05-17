/**
 * Fight enrichment orchestrator. Designed to run daily from cron.
 *
 * Pass cadence — three enrichments per event:
 *   T-10d → daysUntil ∈ [6, 10]
 *   T-5d  → daysUntil ∈ [3, 5]
 *   T-2d  → daysUntil ∈ [0, 2]
 *
 * Editorial coverage drops as the event approaches: T-10 is mostly Tapology
 * backbone + early articles, T-5 picks up the bulk of preview articles, T-2
 * catches fight-week stories and late replacements. Each pass overwrites the
 * prior `aiTags`/`aiPreviewShort`.
 *
 * Dedup: for each candidate event, skip if any fight on the event has
 * `aiEnrichedAt` within the last 36 hours. This means a single daily cron
 * triggers exactly one pass per window per event even if the windows happen
 * to overlap a missed run.
 */

import { PrismaClient } from '@prisma/client';
import {
  launchPreviewBrowser,
  closePreviewBrowser,
  type PreviewBrowserHandle,
} from './fetchUFCEventPreview';
import { enrichOneEvent, type EnrichOneEventResult } from './enrichOneEvent';

const FRESH_THRESHOLD_HOURS = 36;
const MS_PER_DAY = 86_400_000;

export type EnrichmentWindow = 'T-10' | 'T-5' | 'T-2' | null;

export interface RunOptions {
  dryRun?: boolean;
  /** Max events to process this run (safety cap). Default 50. */
  maxEvents?: number;
  /** Force-enrich events outside the cadence windows (manual ad-hoc). */
  ignoreWindow?: boolean;
  /** Restrict to a single event id (manual). */
  onlyEventId?: string;
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  candidates: number;
  ran: number;
  skipped: Array<{ eventId: string; eventName: string; reason: string }>;
  results: EnrichOneEventResult[];
  totalCostUsd: number;
  errors: Array<{ eventId: string; eventName: string; message: string }>;
}

export async function runFightEnrichment(
  prisma: PrismaClient,
  opts: RunOptions = {},
): Promise<RunSummary> {
  const startedAt = new Date();
  const maxEvents = opts.maxEvents ?? 50;
  const summary: RunSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    candidates: 0,
    ran: 0,
    skipped: [],
    results: [],
    totalCostUsd: 0,
    errors: [],
  };

  // Pull all UPCOMING events with at least a name. ufcUrl can be null — we'll
  // still try editorial sources for them.
  const where = opts.onlyEventId
    ? { id: opts.onlyEventId }
    : { eventStatus: 'UPCOMING' as const };
  const upcoming = await prisma.event.findMany({
    where,
    orderBy: { date: 'asc' },
  });
  summary.candidates = upcoming.length;

  // Pick the events we'll actually enrich this run.
  const now = Date.now();
  type Candidate = { event: (typeof upcoming)[number]; window: Exclude<EnrichmentWindow, null> };
  const eligible: Candidate[] = [];
  for (const ev of upcoming) {
    if (eligible.length >= maxEvents) break;
    const daysUntil = Math.floor((ev.date.getTime() - now) / MS_PER_DAY);
    const window = pickWindow(daysUntil);
    if (!window && !opts.ignoreWindow) {
      summary.skipped.push({ eventId: ev.id, eventName: ev.name, reason: `out-of-window (daysUntil=${daysUntil})` });
      continue;
    }
    const lastEnriched = await prisma.fight.aggregate({
      where: { eventId: ev.id, aiEnrichedAt: { not: null } },
      _max: { aiEnrichedAt: true },
    });
    const last = lastEnriched._max.aiEnrichedAt;
    if (last && !opts.ignoreWindow) {
      const hoursSince = (now - last.getTime()) / 3_600_000;
      if (hoursSince < FRESH_THRESHOLD_HOURS) {
        summary.skipped.push({
          eventId: ev.id,
          eventName: ev.name,
          reason: `recently-enriched (${hoursSince.toFixed(1)}h ago)`,
        });
        continue;
      }
    }
    eligible.push({ event: ev, window: window ?? 'T-10' });
  }

  if (eligible.length === 0) {
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  // Launch one browser if any UFC.com event is in scope.
  const needsBrowser = eligible.some((e) => /(^|\.)ufc\.com\b/i.test(e.event.ufcUrl ?? ''));
  let browserHandle: PreviewBrowserHandle | undefined;
  if (needsBrowser) {
    browserHandle = await launchPreviewBrowser();
  }

  try {
    for (const { event: ev, window } of eligible) {
      try {
        const result = await enrichOneEvent(prisma, ev.id, {
          dryRun: opts.dryRun,
          browserHandle: /(^|\.)ufc\.com\b/i.test(ev.ufcUrl ?? '') ? browserHandle : undefined,
        });
        summary.results.push(result);
        summary.ran++;
        summary.totalCostUsd += result.costUsd;
        const tag = result.abortedReason ? `ABORT(${result.abortedReason})` : `${result.wroteCount} wrote`;
        console.log(
          `[runFightEnrichment] ${window}  ${ev.promotion} | ${ev.name}  ` +
            `→ card ${result.cardSize}, ` +
            `${result.fightsWithNarrative}/${result.fightsEnriched} narrative, ` +
            `${result.uncoveredFightIds.length} uncovered, ${tag}, ` +
            `$${result.costUsd.toFixed(4)}`,
        );
      } catch (err: any) {
        summary.errors.push({ eventId: ev.id, eventName: ev.name, message: String(err?.message ?? err) });
        console.error(`[runFightEnrichment] ${ev.name} FAILED:`, err?.message ?? err);
      }
    }
  } finally {
    if (browserHandle) await closePreviewBrowser(browserHandle);
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

function pickWindow(daysUntil: number): Exclude<EnrichmentWindow, null> | null {
  if (daysUntil < 0) return null;
  if (daysUntil <= 2) return 'T-2';
  if (daysUntil <= 5) return 'T-5';
  if (daysUntil <= 10) return 'T-10';
  return null;
}
