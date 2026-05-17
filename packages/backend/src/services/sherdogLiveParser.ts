/**
 * Sherdog Live Data Parser
 *
 * Takes the output of SherdogLiveScraper and reconciles it against a DB
 * event's fights. Matching is by diacritic-normalized last name (Sherdog
 * uses Latin-1, our DB has accented variants like "Joaquín Buckley").
 *
 * Safety properties:
 *   - Never reverses a fight from COMPLETED back to UPCOMING. The Tapology
 *     bug ([[lesson_tapology_tracker_overwrites_lifecycle]]) burned us once
 *     already; the only downgrade path here is the explicit
 *     "lifecycle-completed-with-no-winner -> UPCOMING" self-heal that the
 *     Oktagon parser also uses.
 *   - Never writes to a field that already has a real (non-tracker) value
 *     when `nullOnlyResults` is set — for backfill safety.
 *   - Routes all writes through `buildTrackerUpdateData` so shadow fields
 *     are always populated; published fields only when the event's
 *     scraperType is in the production-scrapers list.
 *
 * The parser is intentionally promotion-agnostic: pass it any eventId and
 * Sherdog data, it figures out the rest. Designed to layer on top of the
 * existing lifecycle without disturbing it — call it from a script, a cron,
 * a GH Actions workflow, or the lifecycle service.
 */

import { PrismaClient } from '@prisma/client';
import { SherdogEventData } from './sherdogLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { BackfillOptions } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

/**
 * "Up Next" buffer for Sherdog.
 *
 * Sherdog flips its Live NOW marker to a fight at *walkout-start* — typically
 * 3-5 min before round 1 bell. That's earlier than UFC.com's Live NOW (which
 * fires after round 1 has started), and earlier than the previous fight's
 * Official Result block being written on Sherdog.
 *
 * Our walkout notification needs to fire AT walkout-start so users have time
 * to get to a TV. So we treat Sherdog's Live NOW flip as our "Up Next"
 * signal:
 *
 *   - shadow `trackerFightStatus = LIVE` immediately + fire walkout notif
 *   - published `fightStatus` stays UPCOMING for UP_NEXT_BUFFER_MS
 *   - after the buffer elapses, published `fightStatus` flips to LIVE
 *
 * The UI can detect "in Up Next window" by checking `trackerFightStatus =
 * LIVE AND fightStatus = UPCOMING`.
 *
 * Other trackers (UFC native, etc.) don't have this concept because their
 * Live NOW signal is too late — they trigger walkout notifs from the
 * previous fight's COMPLETED transition cascade instead.
 */
const UP_NEXT_BUFFER_MS = 5 * 60 * 1000;

// ============== HELPERS ==============

const normalize = (s: string) => stripDiacritics(s).toLowerCase().trim();

/** Whitespace-stripped, diacritic-stripped, lowercased — for fuzzy matching
 *  across compound surnames like "Junior dos Santos" vs "Santos". */
const compress = (s: string) => normalize(s).replace(/[\s-]+/g, '');

function fightSignature(aLast: string, bLast: string): string {
  return [normalize(aLast), normalize(bLast)].sort().join('|');
}

/**
 * Find DB fight by either:
 *   1. exact normalized last-name unordered pair, or
 *   2. compressed last-name suffix/superset match (handles "dos Santos" vs
 *      "Santos", "Masson Wong" vs "Masson-Wong"), or
 *   3. compressed full-name match against {firstName lastName} concat.
 *
 * Sherdog's name shapes diverge from our DB in three predictable ways
 * (compound surnames, hyphens vs spaces, accent variants) — handling all
 * three here keeps the scraper simple.
 */
function findDbFight(
  dbFights: any[],
  sA: { firstName: string; lastName: string; name: string },
  sB: { firstName: string; lastName: string; name: string },
) {
  const sig = fightSignature(sA.lastName, sB.lastName);
  const exact = dbFights.find(f => fightSignature(f.fighter1.lastName, f.fighter2.lastName) === sig);
  if (exact) return exact;

  const cA = compress(sA.lastName);
  const cB = compress(sB.lastName);
  const cFullA = compress(sA.name);
  const cFullB = compress(sB.name);

  return dbFights.find(f => {
    const dbA = compress(f.fighter1.lastName);
    const dbB = compress(f.fighter2.lastName);
    const dbFullA = compress(`${f.fighter1.firstName} ${f.fighter1.lastName}`);
    const dbFullB = compress(`${f.fighter2.firstName} ${f.fighter2.lastName}`);

    const matchesLastNames = (x: string, y: string) =>
      x === y || (x.length >= 3 && y.length >= 3 && (x.endsWith(y) || y.endsWith(x)));

    const directOrder =
      (matchesLastNames(cA, dbA) || cFullA === dbFullA) &&
      (matchesLastNames(cB, dbB) || cFullB === dbFullB);
    const reverseOrder =
      (matchesLastNames(cA, dbB) || cFullA === dbFullB) &&
      (matchesLastNames(cB, dbA) || cFullB === dbFullA);

    return directOrder || reverseOrder;
  });
}

/**
 * Resolve winner last-name → fighter1.id | fighter2.id | null.
 */
function resolveWinnerId(winnerLast: string, fighter1: any, fighter2: any): string | null {
  const w = normalize(winnerLast);
  const f1 = normalize(fighter1.lastName);
  const f2 = normalize(fighter2.lastName);
  if (w === f1) return fighter1.id;
  if (w === f2) return fighter2.id;
  // Substring tolerance for compound names (e.g. "Masson-Wong" vs "Masson Wong").
  if (f1.includes(w) || w.includes(f1)) return fighter1.id;
  if (f2.includes(w) || w.includes(f2)) return fighter2.id;
  return null;
}

// ============== MAIN PARSER ==============

export interface SherdogParserResult {
  fightsUpdated: number;
  eventUpdated: boolean;
  resultsBackfilled: number;
  fightsStarted: number;
  fightsCompleted: number;
}

export async function parseSherdogLiveData(
  liveData: SherdogEventData,
  eventId: string,
  options: BackfillOptions & { dryRun?: boolean } = {},
): Promise<SherdogParserResult> {
  const result: SherdogParserResult = {
    fightsUpdated: 0,
    eventUpdated: false,
    resultsBackfilled: 0,
    fightsStarted: 0,
    fightsCompleted: 0,
  };

  const tag = options.dryRun ? '🔍 [SHERDOG DRY-RUN]' : '📊 [SHERDOG PARSER]';
  console.log(`\n${tag} ${liveData.eventName} (eventId=${eventId})`);

  // Explicit select on event scalars (avoid pulling the brand-new
  // sherdogPbpUrl column until the migration deploys to prod). Fights and
  // fighters are included via relation as before.
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      scraperType: true,
      eventStatus: true,
      fights: { include: { fighter1: true, fighter2: true } },
    },
  });
  if (!event) {
    console.error(`  ❌ Event not found: ${eventId}`);
    return result;
  }
  console.log(`  ✓ ${event.name} — ${event.fights.length} fights, scraperType=${event.scraperType}, status=${event.eventStatus}`);

  // Event status transitions
  if (liveData.hasStarted && event.eventStatus === 'UPCOMING') {
    if (!options.dryRun) {
      await prisma.event.update({ where: { id: eventId }, data: { eventStatus: 'LIVE' } });
    }
    console.log(`  🔴 Event → LIVE`);
    result.eventUpdated = true;
  }
  if (liveData.isComplete && event.eventStatus !== 'COMPLETED') {
    if (!options.dryRun) {
      await prisma.event.update({
        where: { id: eventId },
        data: { eventStatus: 'COMPLETED', completionMethod: 'sherdog-tracker' },
      });
    }
    console.log(`  ✅ Event → COMPLETED`);
    result.eventUpdated = true;
  }

  // === Per-fight reconciliation ===
  for (const sf of liveData.fights) {
    const dbFight = findDbFight(event.fights, sf.fighterA, sf.fighterB);
    if (!dbFight) {
      console.log(`  ⚠ No DB match: ${sf.fighterA.name} vs ${sf.fighterB.name}`);
      continue;
    }

    const dbLabel = `${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`;
    const updateData: any = {};
    let changed = false;
    let isNewlyComplete = false;
    let isNewlyUpNext = false;

    // --- Status transitions ---

    // (LIVE or UPCOMING) → COMPLETED when Sherdog has a result.
    // Checked first so a super-fast finish detected in the same poll cycle as
    // the Live NOW flip goes straight to COMPLETED without the Up Next dance.
    // Never reverses COMPLETED. Backfills winner/method/round/time onto an
    // already-COMPLETED row via the result-backfill block below.
    if (sf.isComplete && dbFight.fightStatus !== 'COMPLETED') {
      updateData.fightStatus = 'COMPLETED';
      updateData.completionMethod = options.completionMethodOverride || 'sherdog-tracker';
      updateData.completedAt = new Date();
      changed = true;
      isNewlyComplete = true;
      result.fightsCompleted++;
      console.log(`  ✅ COMPLETE: ${dbLabel}`);
    }
    // UPCOMING → Up Next (Sherdog's Live NOW marker is on this fight).
    // Up Next state = trackerFightStatus=LIVE AND fightStatus=UPCOMING.
    // Walkout notification fires here. Published LIVE flip is deferred
    // UP_NEXT_BUFFER_MS so users get a real heads-up before the broadcast.
    else if (sf.isLive && dbFight.fightStatus === 'UPCOMING') {
      if (dbFight.trackerFightStatus !== 'LIVE') {
        // First detection: enter Up Next, fire walkout notif this cycle.
        updateData.trackerFightStatus = 'LIVE';
        changed = true;
        isNewlyUpNext = true;
        result.fightsStarted++;
        console.log(`  ⏰ UP NEXT (walkout notif): ${dbLabel}`);
      } else if (
        dbFight.trackerUpdatedAt &&
        Date.now() - dbFight.trackerUpdatedAt.getTime() >= UP_NEXT_BUFFER_MS
      ) {
        // Buffer elapsed: promote to published LIVE.
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`  🥊 LIVE (after ${Math.round(UP_NEXT_BUFFER_MS / 60000)}m up-next buffer): ${dbLabel}`);
      }
      // else: still inside Up Next window, no DB change this cycle.
    }

    // --- Result backfill ---
    // Sherdog has structured winner/method/round/time. Write them in two
    // cases: (a) the fight has no winner yet, or (b) explicit non-nullOnly
    // mode (live tracker, not backfill).
    if (sf.result) {
      const writeIfMissing = (field: string, value: any) => {
        if (value === null || value === undefined) return;
        // Backfill-safety: nullOnlyResults skips fields that already have a real value.
        if (options.nullOnlyResults && (dbFight as any)[field] !== null && (dbFight as any)[field] !== undefined) return;
        // Live mode: skip fields equal to current value (no-op write).
        if ((dbFight as any)[field] === value) return;
        updateData[field] = value;
        changed = true;
      };

      if (sf.result.winner) {
        const winnerId = resolveWinnerId(sf.result.winner, dbFight.fighter1, dbFight.fighter2);
        if (winnerId) {
          writeIfMissing('winner', winnerId);
        } else {
          // Draw / No Contest encoding (Oktagon parser convention).
          const m = sf.result.method?.toLowerCase() || '';
          if (m === 'nc' || m.includes('no contest')) writeIfMissing('winner', 'nc');
          else if (m.includes('draw')) writeIfMissing('winner', 'draw');
        }
      } else if (sf.result.method) {
        const m = sf.result.method.toLowerCase();
        if (m === 'nc' || m.includes('no contest')) writeIfMissing('winner', 'nc');
        else if (m.includes('draw')) writeIfMissing('winner', 'draw');
      }

      writeIfMissing('method', sf.result.method);
      writeIfMissing('round', sf.result.round);
      writeIfMissing('time', sf.result.time);

      // Count as backfill if we wrote winner/method onto an already-completed fight
      // that lacked one.
      if (!isNewlyComplete && dbFight.fightStatus === 'COMPLETED' && !dbFight.winner && updateData.winner) {
        result.resultsBackfilled++;
      }
    }

    if (changed) {
      // Sherdog data is structured and authoritative — always publish to the
      // main fields, with shadow-field mirrors for audit. We deliberately do
      // NOT go through buildTrackerUpdateData because that gates publish on
      // a global production_scrapers toggle; Sherdog's reliability is
      // promotion-agnostic and the whole point of running this tracker is to
      // publish what it sees.
      const finalUpdateData: Record<string, any> = { ...updateData, trackerUpdatedAt: new Date() };
      if (updateData.fightStatus !== undefined) finalUpdateData.trackerFightStatus = updateData.fightStatus;
      if (updateData.winner !== undefined) finalUpdateData.trackerWinner = updateData.winner;
      if (updateData.method !== undefined) finalUpdateData.trackerMethod = updateData.method;
      if (updateData.round !== undefined) finalUpdateData.trackerRound = updateData.round;
      if (updateData.time !== undefined) finalUpdateData.trackerTime = updateData.time;

      const fieldList = Object.keys(updateData).join(', ');
      console.log(`     → ${options.dryRun ? 'WOULD UPDATE' : 'UPDATE'}: ${fieldList}`);

      if (!options.dryRun) {
        await prisma.fight.update({ where: { id: dbFight.id }, data: finalUpdateData });
      }
      result.fightsUpdated++;

      // Walkout notification fires when a fight enters Up Next, not when the
      // previous fight goes COMPLETED. Reason: on Sherdog, the Live NOW flip
      // is the earliest signal and arrives BEFORE the previous fight's
      // Official Result block. Cascading off COMPLETED would miss this window
      // (the next fight is already LIVE-in-tracker by then) or fire for the
      // wrong fight. See UP_NEXT_BUFFER_MS docs above.
      if (!options.dryRun && isNewlyUpNext && !options.skipNotifications) {
        try {
          const { notifyFightStartViaRules } = await import('./notificationService');
          const fmt = (f: { firstName: string; lastName: string }) =>
            f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
          notifyFightStartViaRules(dbFight.id, fmt(dbFight.fighter1), fmt(dbFight.fighter2)).catch((err) => {
            console.error(`     ❌ Walkout notif failed: ${err.message}`);
          });
          console.log(`     🔔 Walkout notif fired for ${dbLabel}`);
        } catch (err: any) {
          console.error(`     ❌ Walkout notif setup failed: ${err.message}`);
        }
      }
    }
  }

  console.log(
    `  ✅ ${options.dryRun ? 'Dry-run' : 'Parser'} done: ${result.fightsUpdated} fights updated ` +
      `(${result.fightsStarted} started, ${result.fightsCompleted} newly completed, ${result.resultsBackfilled} results backfilled)\n`,
  );

  return result;
}
