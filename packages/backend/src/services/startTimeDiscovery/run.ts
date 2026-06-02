/**
 * Start-Time Discovery — orchestrator.
 *
 * For each upcoming event that has NO early-bell time on file (we only know the
 * main-card time, or nothing), web-search the card's start/ring-walk coverage,
 * extract per-section times with Haiku, and write the prelim/early-prelim times
 * so the event flips LIVE at the real first bell instead of hours late.
 *
 * Targets exactly the gap: Tapology-backed orgs (MVP, Top Rank, Golden Boy,
 * Gold Star, RIZIN, etc.) whose source publishes only one time. UFC events
 * already carry all three section times from ufc.com, so they're skipped by the
 * "prelim + early both null" selection filter.
 *
 * Idempotent + self-correcting: runs every daily cycle, retries unresolved
 * events as outlets publish schedules closer to the date, and refreshes its own
 * prior writes. Never fabricates, never clobbers the scraper/admin (see persist.ts).
 *
 * Modeled on services/broadcastDiscovery/run.ts.
 */

import type { PrismaClient } from '@prisma/client';
import { braveSearch } from '../broadcastDiscovery/searchBrave';
import { extractStartTimes } from './extract';
import { applyStartTimes, type EventForApply, type ApplyResult } from './persist';

const RESOLVE_WINDOW_DAYS = Number(process.env.STARTTIME_WINDOW_DAYS || 21);
const RETRY_AFTER_HOURS = Number(process.env.STARTTIME_RETRY_HOURS || 36);
const MAX_EVENTS = Number(process.env.STARTTIME_MAX_EVENTS || 40);

export interface DiscoveryOutcome {
  eventId: string;
  name: string;
  result: ApplyResult | null;
  confidence: number | null;
  error?: string;
}

/** Block obviously-irrelevant sources (academic/gov pages, raw PDFs) that can
 *  coincidentally match a fighter name and mislead the extractor. */
function isPlausibleSource(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  if (/\.(edu|gov|mil)$/.test(host)) return false;
  if (/\.pdf($|\?)/i.test(url)) return false;
  return true;
}

function monthDayYear(d: Date): string {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

/** Resolve + apply start times for ONE event. Returns the outcome. */
export async function discoverStartTimesForEvent(
  prisma: PrismaClient,
  event: EventForApply & { promotion: string | null; location: string | null },
  opts: { dryRun?: boolean } = {},
): Promise<DiscoveryOutcome> {
  const promo = event.promotion || 'combat sports';
  const dateLabel = monthDayYear(event.date);
  const query = `"${event.name}" ${promo} ${dateLabel} prelims main card start time ring walk`;

  let snippets;
  try {
    const results = await braveSearch(query, 6);
    snippets = results
      .filter((r) => r.url && isPlausibleSource(r.url))
      .map((r) => ({ url: r.url, title: r.title, description: r.description }));
  } catch (e: any) {
    return { eventId: event.id, name: event.name, result: null, confidence: null, error: `search: ${e?.message ?? e}` };
  }

  if (snippets.length === 0) {
    return { eventId: event.id, name: event.name, result: null, confidence: null, error: 'no usable search results' };
  }

  let ex;
  try {
    ex = await extractStartTimes({
      eventName: event.name,
      promotion: promo,
      dateLabel,
      location: event.location || 'unknown',
      snippets,
    });
  } catch (e: any) {
    return { eventId: event.id, name: event.name, result: null, confidence: null, error: `extract: ${e?.message ?? e}` };
  }

  if (!ex) {
    return { eventId: event.id, name: event.name, result: null, confidence: null, error: 'extraction unavailable' };
  }

  // Stamp the attempt even when nothing is applied, so the retry window throttles
  // repeated failures. (Only on real runs.)
  if (!opts.dryRun) {
    await prisma.event.update({
      where: { id: event.id },
      data: { startTimeDiscoveredAt: new Date() },
    }).catch(() => {});
  }

  const result = await applyStartTimes(prisma, event, ex, opts);
  return { eventId: event.id, name: event.name, result, confidence: ex.confidence };
}

/** Select gap events and resolve their start times. */
export async function runStartTimeDiscovery(
  prisma: PrismaClient,
  opts: { dryRun?: boolean; maxEvents?: number } = {},
): Promise<DiscoveryOutcome[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + RESOLVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const retryCutoff = new Date(now.getTime() - RETRY_AFTER_HOURS * 60 * 60 * 1000);
  const sameDayFloor = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      eventStatus: 'UPCOMING',
      date: { gte: sameDayFloor, lte: windowEnd },
      // The gap: no early-bell time known. UFC etc. (which carry section times)
      // are excluded automatically.
      earlyPrelimStartTime: null,
      prelimStartTime: null,
      OR: [{ startTimeDiscoveredAt: null }, { startTimeDiscoveredAt: { lt: retryCutoff } }],
    },
    orderBy: { date: 'asc' },
    take: opts.maxEvents ?? MAX_EVENTS,
    select: {
      id: true, name: true, date: true, promotion: true, location: true,
      earlyPrelimStartTime: true, prelimStartTime: true, mainStartTime: true,
      startTimeSource: true,
    },
  });

  const outcomes: DiscoveryOutcome[] = [];
  for (const ev of events) {
    const outcome = await discoverStartTimesForEvent(prisma, ev as any, opts);
    outcomes.push(outcome);
    const c = outcome.result;
    const tag = c?.applied ? `APPLIED ${JSON.stringify(c.changes)}` : (outcome.error ? `ERR ${outcome.error}` : `skip: ${c?.reason}`);
    console.log(`[startTimeDiscovery] ${ev.name} (conf=${outcome.confidence ?? '-'}): ${tag}`);
  }
  return outcomes;
}
