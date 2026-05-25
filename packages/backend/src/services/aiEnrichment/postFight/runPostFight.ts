/**
 * Post-fight enrichment orchestrator. Designed to run daily from cron.
 *
 * Cadence: one recap pass per fight, gated to T+MIN_DAYS_AFTER days after the
 * event so post-event editorial has settled (recaps, bonus announcements, and
 * aftermath all land in the first few days). Default T+5d.
 *
 * Selection each run:
 *   - eventStatus = COMPLETED
 *   - event.date between (now - MAX_AGE_DAYS) and (now - MIN_DAYS_AFTER)
 *   - at least one COMPLETED fight on the event with a recorded winner and no
 *     aiPostFightEnrichedAt yet
 *
 * The MAX_AGE_DAYS ceiling keeps this job focused on RECENT fights — anything
 * older than the window is the historic-backfill campaign's job, not this cron.
 * Dedup is per-fight (aiPostFightEnrichedAt), so re-runs only touch fights that
 * still lack a recap. Most-recent events are processed first.
 */

import { PrismaClient } from '@prisma/client';
import {
  launchPreviewBrowser,
  closePreviewBrowser,
  type PreviewBrowserHandle,
} from '../fetchUFCEventPreview';
import {
  enrichOnePostFightEvent,
  type EnrichOnePostFightResult,
} from './enrichOnePostFightEvent';

const MS_PER_DAY = 86_400_000;
const DEFAULT_MIN_DAYS_AFTER = 5;
const DEFAULT_MAX_AGE_DAYS = 45;

export interface RunPostFightOptions {
  dryRun?: boolean;
  /** Max events to process this run (safety cap). Default 25. */
  maxEvents?: number;
  /** Days after the event before we enrich (default 5). */
  minDaysAfter?: number;
  /** Ceiling on event age — older events are left to the historic campaign (default 45). */
  maxAgeDays?: number;
  /** Restrict to a single event id (manual). Bypasses the date window. */
  onlyEventId?: string;
  /** Ignore the T+5d / max-age window (manual ad-hoc). */
  ignoreWindow?: boolean;
}

export interface RunPostFightSummary {
  startedAt: string;
  finishedAt: string;
  candidates: number;
  ran: number;
  skipped: Array<{ eventId: string; eventName: string; reason: string }>;
  results: EnrichOnePostFightResult[];
  totalCostUsd: number;
  totalWrote: number;
  errors: Array<{ eventId: string; eventName: string; message: string }>;
}

export async function runPostFightEnrichment(
  prisma: PrismaClient,
  opts: RunPostFightOptions = {},
): Promise<RunPostFightSummary> {
  const startedAt = new Date();
  const maxEvents = opts.maxEvents ?? 25;
  const minDaysAfter = opts.minDaysAfter ?? DEFAULT_MIN_DAYS_AFTER;
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

  const summary: RunPostFightSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    candidates: 0,
    ran: 0,
    skipped: [],
    results: [],
    totalCostUsd: 0,
    totalWrote: 0,
    errors: [],
  };

  const now = Date.now();

  // Build the candidate event query.
  let where: any;
  if (opts.onlyEventId) {
    where = { id: opts.onlyEventId };
  } else if (opts.ignoreWindow) {
    where = { eventStatus: 'COMPLETED' as const };
  } else {
    where = {
      eventStatus: 'COMPLETED' as const,
      date: {
        lte: new Date(now - minDaysAfter * MS_PER_DAY),
        gte: new Date(now - maxAgeDays * MS_PER_DAY),
      },
    };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: 'desc' }, // most recent first
  });
  summary.candidates = events.length;

  // Pre-filter to events that actually have fights needing a recap, so we don't
  // spend a browser launch / Brave call on a fully-enriched event.
  const eligible: typeof events = [];
  for (const ev of events) {
    if (eligible.length >= maxEvents) break;
    const needing = await prisma.fight.count({
      where: {
        eventId: ev.id,
        fightStatus: 'COMPLETED',
        aiPostFightEnrichedAt: null,
        winner: { not: null },
      },
    });
    if (needing === 0) {
      summary.skipped.push({ eventId: ev.id, eventName: ev.name, reason: 'all-recaps-present-or-no-results' });
      continue;
    }
    eligible.push(ev);
  }

  if (eligible.length === 0) {
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  // Launch one browser if any UFC.com event is in scope.
  const needsBrowser = eligible.some((e) => /(^|\.)ufc\.com\b/i.test(e.ufcUrl ?? ''));
  let browserHandle: PreviewBrowserHandle | undefined;
  if (needsBrowser) {
    browserHandle = await launchPreviewBrowser();
  }

  try {
    for (const ev of eligible) {
      try {
        const result = await enrichOnePostFightEvent(prisma, ev.id, {
          dryRun: opts.dryRun,
          browserHandle: /(^|\.)ufc\.com\b/i.test(ev.ufcUrl ?? '') ? browserHandle : undefined,
        });
        summary.results.push(result);
        summary.ran++;
        summary.totalCostUsd += result.costUsd;
        summary.totalWrote += result.wroteCount;
        const tag = result.abortedReason ? `ABORT(${result.abortedReason})` : `${result.wroteCount} wrote`;
        console.log(
          `[runPostFight] ${ev.promotion} | ${ev.name}  → card ${result.cardSize}, ` +
            `${result.fightsEnriched} recapped, ${result.uncoveredFightIds.length} uncovered, ` +
            `${tag}, $${result.costUsd.toFixed(4)}`,
        );
      } catch (err: any) {
        summary.errors.push({ eventId: ev.id, eventName: ev.name, message: String(err?.message ?? err) });
        console.error(`[runPostFight] ${ev.name} FAILED:`, err?.message ?? err);
      }
    }
  } finally {
    if (browserHandle) await closePreviewBrowser(browserHandle);
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
