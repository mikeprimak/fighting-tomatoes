/**
 * Start-Time Discovery — apply extracted section times to an Event.
 *
 * Converts the ET time strings to UTC (same path the daily scraper uses for
 * mainStartTime), runs ordering + provenance guards, and writes only what is
 * safe. Core principles (see docs/areas/live-trackers.md "Start/end timing is
 * sacred"):
 *
 *   - NEVER fabricate. A null section stays null.
 *   - NEVER clobber a more-authoritative source. The daily card scraper owns
 *     mainStartTime; an admin may own any field. Discovery only:
 *       • fills a section that is currently NULL, or
 *       • refreshes a value it set itself on a previous run (startTimeSource='discovery').
 *   - Ordering must hold: earlyPrelims <= prelims <= mainCard. Violators dropped.
 *   - Confidence floor gates the whole write.
 */

import type { PrismaClient } from '@prisma/client';
import { eventTimeToUTC } from '../../utils/timezone';
import type { ExtractedStartTimes } from './extract';

export const APPLY_CONFIDENCE_FLOOR = 0.7;

export interface EventForApply {
  id: string;
  name: string;
  date: Date;
  earlyPrelimStartTime: Date | null;
  prelimStartTime: Date | null;
  mainStartTime: Date | null;
  startTimeSource: string | null;
}

export interface ApplyResult {
  applied: boolean;
  reason: string;
  changes: Record<string, { from: string | null; to: string }>;
}

/**
 * Decide and (unless dryRun) write the section start times for one event.
 * `eventDate` is the calendar anchor for the ET->UTC conversion — use the
 * event's own `date` (Tapology stores a 00:00Z marker on the right day).
 */
export async function applyStartTimes(
  prisma: PrismaClient,
  event: EventForApply,
  ex: ExtractedStartTimes,
  opts: { dryRun?: boolean } = {},
): Promise<ApplyResult> {
  const changes: ApplyResult['changes'] = {};
  if (!ex.found) return { applied: false, reason: 'extraction found no times', changes };
  if (ex.confidence < APPLY_CONFIDENCE_FLOOR) {
    return { applied: false, reason: `confidence ${ex.confidence} < floor ${APPLY_CONFIDENCE_FLOOR}`, changes };
  }

  const toUtc = (t: string | null): Date | null =>
    t ? eventTimeToUTC(event.date, t, 'America/New_York') : null;

  let early = toUtc(ex.earlyPrelims);
  let prelim = toUtc(ex.prelims);
  let main = toUtc(ex.mainCard);

  // Ordering sanity: earlyPrelims <= prelims <= mainCard. Drop any value that
  // breaks the chain rather than trust a garbled time.
  if (early && prelim && early > prelim) early = null;
  if (prelim && main && prelim > main) {
    // If prelim is after main, the less-trustworthy one is usually the prelim
    // (main is the headline time everyone agrees on). Drop prelim.
    prelim = null;
  }
  if (early && main && early > main) early = null;

  // Discovery may refresh only its own prior writes; otherwise it only fills nulls.
  const discoveryOwns = event.startTimeSource === 'discovery';
  const canSet = (current: Date | null) => current === null || discoveryOwns;

  const data: Record<string, Date> = {};

  // mainStartTime: the card scraper owns this. Only fill when null.
  if (main && event.mainStartTime === null) {
    data.mainStartTime = main;
    changes.mainStartTime = { from: null, to: main.toISOString() };
  }
  // prelimStartTime / earlyPrelimStartTime: the gap discovery exists to fill.
  if (prelim && canSet(event.prelimStartTime) && !sameInstant(prelim, event.prelimStartTime)) {
    data.prelimStartTime = prelim;
    changes.prelimStartTime = { from: event.prelimStartTime?.toISOString() ?? null, to: prelim.toISOString() };
  }
  if (early && canSet(event.earlyPrelimStartTime) && !sameInstant(early, event.earlyPrelimStartTime)) {
    data.earlyPrelimStartTime = early;
    changes.earlyPrelimStartTime = { from: event.earlyPrelimStartTime?.toISOString() ?? null, to: early.toISOString() };
  }

  if (Object.keys(data).length === 0) {
    return { applied: false, reason: 'nothing new to write (already set by an authoritative source)', changes };
  }

  if (!opts.dryRun) {
    await prisma.event.update({
      where: { id: event.id },
      data: {
        ...data,
        startTimeSource: 'discovery',
        startTimeConfidence: ex.confidence,
        startTimeSourceUrls: ex.sources,
        startTimeDiscoveredAt: new Date(),
      },
    });
  }

  return { applied: true, reason: 'applied', changes };
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}
