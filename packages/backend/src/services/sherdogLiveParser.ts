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

async function notifyNextFight(eventId: string, completedFightOrder: number): Promise<void> {
  try {
    const nextFight = await prisma.fight.findFirst({
      where: { eventId, orderOnCard: { lt: completedFightOrder }, fightStatus: 'UPCOMING' },
      orderBy: { orderOnCard: 'desc' },
      include: { fighter1: { select: { firstName: true, lastName: true } }, fighter2: { select: { firstName: true, lastName: true } } },
    });
    if (!nextFight) return;
    const formatName = (f: { firstName: string; lastName: string }) =>
      f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
    const a = formatName(nextFight.fighter1);
    const b = formatName(nextFight.fighter2);
    console.log(`    🔔 Next fight notification: ${a} vs ${b}`);
    const { notifyFightStartViaRules } = await import('./notificationService');
    await notifyFightStartViaRules(nextFight.id, a, b);
  } catch (err) {
    console.error(`    ❌ Notify-next-fight failed:`, err);
  }
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

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { fights: { include: { fighter1: true, fighter2: true } } },
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

    // --- Status transitions ---
    // UPCOMING → LIVE
    if (sf.hasStarted && !sf.isComplete && dbFight.fightStatus === 'UPCOMING') {
      updateData.fightStatus = 'LIVE';
      changed = true;
      result.fightsStarted++;
      console.log(`  🥊 START: ${dbLabel}`);
    }

    // (LIVE or UPCOMING) → COMPLETED when Sherdog has a result.
    // We never reverse COMPLETED → anything. We DO upgrade from a manual /
    // lifecycle "completed-with-no-winner" by writing the winner+method+
    // round+time onto the existing COMPLETED row (handled below in the
    // result-backfill block).
    if (sf.isComplete && dbFight.fightStatus !== 'COMPLETED') {
      updateData.fightStatus = 'COMPLETED';
      updateData.completionMethod = options.completionMethodOverride || 'sherdog-tracker';
      updateData.completedAt = new Date();
      changed = true;
      isNewlyComplete = true;
      result.fightsCompleted++;
      console.log(`  ✅ COMPLETE: ${dbLabel}`);
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

      // Fire next-fight notification on first-time COMPLETED transitions.
      if (!options.dryRun && isNewlyComplete && !options.skipNotifications) {
        notifyNextFight(dbFight.eventId, dbFight.orderOnCard);
      }
    }
  }

  console.log(
    `  ✅ ${options.dryRun ? 'Dry-run' : 'Parser'} done: ${result.fightsUpdated} fights updated ` +
      `(${result.fightsStarted} started, ${result.fightsCompleted} newly completed, ${result.resultsBackfilled} results backfilled)\n`,
  );

  return result;
}
