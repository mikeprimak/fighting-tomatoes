/**
 * Tapology Live Parser
 *
 * Takes scraped Tapology data and updates the database.
 * Matches fights by fighter last names and updates results.
 */

import { prisma } from '../lib/prisma';
import { PrismaClient, Gender, Sport } from '@prisma/client';
import { TapologyEventData, TapologyFight } from './tapologyLiveScraper';
import { stripDiacritics, similarityScore } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';
import { isScrapeHealthyForCancellation } from './cancellationGuards';
import { syncFighterFollowMatchesForFight } from './notificationRuleEngine';


// ============== TYPE DEFINITIONS ==============

interface ParseResult {
  fightsUpdated: number;
  fightsMatched: number;
  fightsNotFound: string[];
  fightsCreated: number;
  cancelledCount: number;
  unCancelledCount: number;
  /** Label of the fight inferred LIVE this run, if any (see inferLiveFight). */
  markedLive: string | null;
}

interface TapologyParseOptions {
  /** Skip the timing-based LIVE inference. Set by the backfill: it runs days
   *  after the card and must never stamp a historical bout as in-progress. */
  skipLiveInference?: boolean;
}

/**
 * How long after the previous bout's result appears we assume the next bout is
 * under way.
 *
 * Tapology publishes no live marker of any kind — the event header still reads
 * "upcoming" hours into a card (verified mid-card at Zuffa Boxing 9, 2026-07-26).
 * The only real-time signal we get is a result appearing on the page, so the
 * running bout has to be inferred from timing.
 *
 * 5 minutes, chosen deliberately on the early side. Measured gaps between
 * consecutive result detections on Tapology cards run far longer than this
 * (median 42 min, p25 19 min over the last 25 events), so this will usually
 * flip a bout LIVE before its opening bell. That is the intended trade:
 * Tapology itself lags, and our detection adds up to another poll interval on
 * top, so being late means missing the live window entirely while being early
 * only means the badge leads the broadcast. Operator decision, 2026-07-27.
 */
const LIVE_INFERENCE_DELAY_MS = Number(process.env.TAPOLOGY_LIVE_DELAY_MS || 5 * 60 * 1000);

/**
 * Refuse to infer LIVE from an anchor older than this. A card that has been
 * silent for three hours is over, stalled, or mis-scraped — any of which would
 * otherwise leave a bout claiming to be live indefinitely.
 */
const LIVE_INFERENCE_MAX_ANCHOR_AGE_MS = 3 * 60 * 60 * 1000;

// ============== HELPER FUNCTIONS ==============

/**
 * Normalize name for matching (remove accents including ł/đ/ø/æ/ß, lowercase)
 */
function normalizeName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .trim();
}

/**
 * Compact a name by removing spaces, hyphens, periods, apostrophes.
 * "Al-Silawi" → "alsilawi", "Lipski da Silva" → "lipskidasilva"
 */
function compactName(name: string): string {
  return normalizeName(name).replace(/[\s\-.']/g, '');
}

/**
 * Extract last name from full name (everything after first space, or the whole name)
 */
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
}

/**
 * Find a matching DB fight for a scraped fight using multiple strategies.
 * Returns the matched DB fight or undefined.
 */
function findMatchingDbFight(
  dbFights: any[],
  scrapedNameA: string,
  scrapedNameB: string
): any | undefined {
  const sA = normalizeName(extractLastName(scrapedNameA));
  const sB = normalizeName(extractLastName(scrapedNameB));
  const sACompact = compactName(extractLastName(scrapedNameA));
  const sBCompact = compactName(extractLastName(scrapedNameB));
  // Also try full name compact (for names stored as single lastName like "Lipskidasilva")
  const sAFullCompact = compactName(scrapedNameA);
  const sBFullCompact = compactName(scrapedNameB);

  for (const fight of dbFights) {
    const d1 = normalizeName(fight.fighter1.lastName);
    const d2 = normalizeName(fight.fighter2.lastName);
    const d1Compact = compactName(fight.fighter1.lastName);
    const d2Compact = compactName(fight.fighter2.lastName);

    // Strategy 1: Exact last name match (bidirectional)
    if ((d1 === sA && d2 === sB) || (d1 === sB && d2 === sA)) return fight;

    // Strategy 2: Compact match (removes hyphens/spaces — "Al-Silawi" matches "Alsalawi")
    if ((d1Compact === sACompact && d2Compact === sBCompact) ||
        (d1Compact === sBCompact && d2Compact === sACompact)) return fight;

    // Strategy 3: Full name compact vs DB lastName compact
    // Handles "Ariane Lipski da Silva" → compact "arianelipskidasilva" contains DB "lipskidasilva"
    if ((d1Compact === sAFullCompact && d2Compact === sBFullCompact) ||
        (d1Compact === sBFullCompact && d2Compact === sAFullCompact)) return fight;
    if ((sAFullCompact.includes(d1Compact) && sBFullCompact.includes(d2Compact)) ||
        (sAFullCompact.includes(d2Compact) && sBFullCompact.includes(d1Compact))) return fight;

    // Strategy 4: Partial/contains match on last names
    if ((d1.includes(sA) || sA.includes(d1)) && (d2.includes(sB) || sB.includes(d2))) return fight;
    if ((d1.includes(sB) || sB.includes(d1)) && (d2.includes(sA) || sA.includes(d2))) return fight;

    // Strategy 5: Similarity score on compact names (handles spelling variations like "Silawi" vs "Salawi")
    const sim1A2B = similarityScore(d1Compact, sACompact) + similarityScore(d2Compact, sBCompact);
    const sim1B2A = similarityScore(d1Compact, sBCompact) + similarityScore(d2Compact, sACompact);
    // Both fighters must score >= 0.8 individually (sum >= 1.6)
    if (sim1A2B >= 1.6 && Math.min(similarityScore(d1Compact, sACompact), similarityScore(d2Compact, sBCompact)) >= 0.8) return fight;
    if (sim1B2A >= 1.6 && Math.min(similarityScore(d1Compact, sBCompact), similarityScore(d2Compact, sACompact)) >= 0.8) return fight;
  }

  return undefined;
}

/**
 * Split a Tapology-style full name into firstName/lastName.
 * "Abdelrahman Mohamed" → { Abdelrahman, Mohamed }
 * "Abdul Razac Sankara" → { "Abdul Razac", "Sankara" }
 * Single-word names go into lastName.
 */
function parseFighterName(fullName: string): { firstName: string; lastName: string } {
  const clean = fullName.trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: '', lastName: stripDiacritics(parts[0]) };
  }
  const lastName = stripDiacritics(parts[parts.length - 1]);
  const firstName = stripDiacritics(parts.slice(0, -1).join(' '));
  return { firstName, lastName };
}

/**
 * Find an existing fighter by first/last name or create a minimal record.
 * Mirrors the pattern from ufcLiveParser so new fighters added mid-event
 * get cleaned up later by the daily scraper.
 */
async function findOrCreateFighter(fullName: string): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const { firstName, lastName } = parseFighterName(fullName);
  if (!lastName) return null;

  try {
    const fighter = await prisma.fighter.upsert({
      where: { firstName_lastName: { firstName, lastName } },
      update: {},
      create: {
        firstName,
        lastName,
        gender: Gender.MALE,
        sport: Sport.MMA,
        isActive: true,
        wins: 0,
        losses: 0,
        draws: 0,
        noContests: 0,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    return fighter;
  } catch (err: any) {
    console.error(`[Tapology Parser] Failed to upsert fighter "${fullName}":`, err.message);
    return null;
  }
}

/**
 * Determine winner fighter ID from winner name
 */
function getWinnerFighterId(winnerName: string, fighter1: any, fighter2: any): string | null {
  if (!winnerName) return null;

  const winnerLast = normalizeName(extractLastName(winnerName));
  const winnerCompact = compactName(extractLastName(winnerName));
  const winnerFullCompact = compactName(winnerName);

  const f1 = normalizeName(fighter1.lastName);
  const f2 = normalizeName(fighter2.lastName);
  const f1Compact = compactName(fighter1.lastName);
  const f2Compact = compactName(fighter2.lastName);

  // Exact
  if (f1 === winnerLast) return fighter1.id;
  if (f2 === winnerLast) return fighter2.id;

  // Compact
  if (f1Compact === winnerCompact) return fighter1.id;
  if (f2Compact === winnerCompact) return fighter2.id;

  // Full compact contains
  if (winnerFullCompact.includes(f1Compact) || f1Compact.includes(winnerCompact)) return fighter1.id;
  if (winnerFullCompact.includes(f2Compact) || f2Compact.includes(winnerCompact)) return fighter2.id;

  // Partial
  if (f1.includes(winnerLast) || winnerLast.includes(f1)) return fighter1.id;
  if (f2.includes(winnerLast) || winnerLast.includes(f2)) return fighter2.id;

  // Similarity fallback
  const sim1 = similarityScore(f1Compact, winnerCompact);
  const sim2 = similarityScore(f2Compact, winnerCompact);
  if (sim1 >= 0.8 && sim1 > sim2) return fighter1.id;
  if (sim2 >= 0.8 && sim2 > sim1) return fighter2.id;

  return null;
}

/**
 * Create a compact fight signature for cancellation tracking
 */
function createFightSignature(fighter1LastName: string, fighter2LastName: string): string {
  return [compactName(fighter1LastName), compactName(fighter2LastName)].sort().join('|');
}

// ============== MAIN PARSER ==============

/**
 * Notify users about the next upcoming fight
 */
async function notifyNextFight(eventId: string, completedFightOrder: number): Promise<void> {
  try {
    // Cards run MAIN-EVENT-LAST: orderOnCard 1 is the headliner (the event's named
    // matchup, e.g. "Bivol vs Eifert" = ord 1), so bouts compete in DESCENDING
    // orderOnCard. The next fight up is the UPCOMING fight with the highest
    // orderOnCard BELOW the completed one — lt + desc, not gt + asc. (gt/asc
    // returned NULL every time, silently dropping every up-next ping.)
    const nextFight = await prisma.fight.findFirst({
      where: {
        eventId,
        orderOnCard: { lt: completedFightOrder },
        fightStatus: 'UPCOMING',
      },
      orderBy: { orderOnCard: 'desc' },
      include: {
        fighter1: { select: { firstName: true, lastName: true } },
        fighter2: { select: { firstName: true, lastName: true } },
      },
    });

    if (nextFight) {
      const formatName = (f: { firstName: string; lastName: string }) =>
        f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
      const f1 = formatName(nextFight.fighter1);
      const f2 = formatName(nextFight.fighter2);

      console.log(`    Next fight notification: ${f1} vs ${f2}`);
      const { notifyFightStartViaRules } = await import('./notificationService');
      await notifyFightStartViaRules(nextFight.id, f1, f2);
    }
  } catch (error) {
    console.error(`    Failed to notify next fight:`, error);
  }
}

/**
 * Infer which bout is currently in the ring and publish it as LIVE.
 *
 * Cards run MAIN-EVENT-LAST, so bouts happen in DESCENDING orderOnCard (the
 * same convention notifyNextFight relies on). The running bout is therefore the
 * first non-COMPLETED fight when the card is walked in descending order.
 *
 * We flip it to LIVE once LIVE_INFERENCE_DELAY_MS has elapsed since the anchor:
 *   - the most recent result we detected on this card, or
 *   - for the opening bout, the card's earliest known section start time.
 *
 * Returns a label for the fight it marked, or null if it changed nothing.
 * Callers must have already established that the scrape is healthy — an empty
 * or partial scrape must not reach this function, or a stale page would park a
 * "Live Now" badge on a bout that already finished.
 */
export interface LiveInferenceFight {
  id: string;
  orderOnCard: number;
  fightStatus: string;
  completedAt: Date | null;
  label: string;
}

export interface LiveInferenceEvent {
  eventStatus: string;
  earlyPrelimStartTime?: Date | null;
  prelimStartTime?: Date | null;
  mainStartTime?: Date | null;
}

export interface LiveInferenceDecision {
  /** Fight to flip to LIVE, or null if nothing should change this poll. */
  goLive: LiveInferenceFight | null;
  /** Stray LIVE bouts that are no longer the current one; demote to UPCOMING. */
  demote: LiveInferenceFight[];
  /** Why, for the log line. */
  reason: 'live' | 'waiting' | 'card-over' | 'already-live' | 'no-anchor' | 'stale-anchor';
  anchorKind: 'previous result' | 'card start time' | null;
  /** ms since the anchor, when there is one. */
  anchorAgeMs: number | null;
}

/**
 * The pure decision half of the LIVE inference — no DB, no clock of its own.
 * Split out so the timing rules can be tested directly; see
 * `tapologyLiveParser.liveInference.test.ts`.
 */
export function decideLiveFight(
  fights: LiveInferenceFight[],
  event: LiveInferenceEvent,
  now: number,
): LiveInferenceDecision {
  const none = (reason: LiveInferenceDecision['reason']): LiveInferenceDecision => ({
    goLive: null, demote: [], reason, anchorKind: null, anchorAgeMs: null,
  });

  const active = fights.filter(f => f.fightStatus !== 'CANCELLED');
  if (active.length === 0) return none('card-over');

  // Chronological order = descending orderOnCard (ord 1 is the headliner, last).
  const running = [...active].sort((a, b) => b.orderOnCard - a.orderOnCard);
  const current = running.find(f => f.fightStatus !== 'COMPLETED') ?? null;

  // Stray LIVE bouts that are no longer current — self-healing for a card whose
  // order shifted mid-event. Never touches COMPLETED rows.
  const demote = active.filter(f => f.fightStatus === 'LIVE' && f.id !== current?.id);

  if (!current) return { ...none('card-over'), demote };
  if (current.fightStatus === 'LIVE') return { ...none('already-live'), demote };

  // Anchor: last detected result, else the card's earliest section start time.
  const completedAts = active
    .filter(f => f.fightStatus === 'COMPLETED' && f.completedAt)
    .map(f => f.completedAt!.getTime());

  let anchor: number;
  let anchorKind: 'previous result' | 'card start time';
  if (completedAts.length > 0) {
    anchor = Math.max(...completedAts);
    anchorKind = 'previous result';
  } else {
    // Opening bout: no result to key off yet. Only trust a start time once the
    // lifecycle has already flipped the event LIVE, so a mis-scraped start time
    // on a future card can't light up a bout days early.
    if (event.eventStatus !== 'LIVE') return { ...none('no-anchor'), demote };
    const starts = [event.earlyPrelimStartTime, event.prelimStartTime, event.mainStartTime]
      .filter((d): d is Date => !!d)
      .map(d => d.getTime());
    if (starts.length === 0) return { ...none('no-anchor'), demote };
    anchor = Math.min(...starts);
    anchorKind = 'card start time';
  }

  const anchorAgeMs = now - anchor;
  if (anchorAgeMs < LIVE_INFERENCE_DELAY_MS) {
    return { goLive: null, demote, reason: 'waiting', anchorKind, anchorAgeMs };
  }
  if (anchorAgeMs > LIVE_INFERENCE_MAX_ANCHOR_AGE_MS) {
    return { goLive: null, demote, reason: 'stale-anchor', anchorKind, anchorAgeMs };
  }
  return { goLive: current, demote, reason: 'live', anchorKind, anchorAgeMs };
}

async function inferLiveFight(
  eventId: string,
  event: any,
  scraperType: any,
): Promise<string | null> {
  // Re-read: the completion loop above wrote to the DB but not to the in-memory
  // event.fights objects, so a bout that finished this very poll still looks
  // UPCOMING here and would be mistaken for the running one.
  const rows = await prisma.fight.findMany({
    where: { eventId, fightStatus: { not: 'CANCELLED' } },
    select: {
      id: true, orderOnCard: true, fightStatus: true, completedAt: true,
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } },
    },
  });

  const fights: LiveInferenceFight[] = rows.map(f => ({
    id: f.id,
    orderOnCard: f.orderOnCard,
    fightStatus: f.fightStatus,
    completedAt: f.completedAt,
    label: `${f.fighter1.lastName} vs ${f.fighter2.lastName}`,
  }));

  const decision = decideLiveFight(fights, event, Date.now());

  for (const f of decision.demote) {
    await prisma.fight.update({
      where: { id: f.id },
      data: { fightStatus: 'UPCOMING', trackerFightStatus: 'UPCOMING' },
    });
    console.log(`  UNLIVE ${f.label} (no longer the current bout)`);
  }

  if (decision.reason === 'waiting') {
    const wait = Math.ceil((LIVE_INFERENCE_DELAY_MS - decision.anchorAgeMs!) / 1000);
    console.log(`  UP NEXT (LIVE in ~${wait}s, ${decision.anchorKind})`);
  } else if (decision.reason === 'stale-anchor') {
    const hrs = (decision.anchorAgeMs! / 3600000).toFixed(1);
    console.log(`  Skipping LIVE inference: ${decision.anchorKind} is ${hrs}h old (card stalled or over)`);
  }

  if (!decision.goLive) return null;

  await prisma.fight.update({
    where: { id: decision.goLive.id },
    data: buildTrackerUpdateData({ fightStatus: 'LIVE' }, scraperType),
  });
  const mins = Math.round(decision.anchorAgeMs! / 60000);
  console.log(`  LIVE ${decision.goLive.label} (inferred, ${mins}m after ${decision.anchorKind})`);
  return decision.goLive.label;
}

/**
 * Parse Tapology data and update database for a specific event.
 * Handles: fight completion, cancellations, un-cancellations, lifecycle resets.
 */
export async function parseTapologyData(
  eventId: string,
  scrapedData: TapologyEventData,
  options: TapologyParseOptions = {}
): Promise<ParseResult> {
  console.log(`\n[Tapology Parser] Processing ${scrapedData.fights.length} scraped fights`);
  console.log(`[Tapology Parser] Event ID: ${eventId}`);

  const result: ParseResult = {
    fightsUpdated: 0,
    fightsMatched: 0,
    fightsNotFound: [],
    fightsCreated: 0,
    cancelledCount: 0,
    unCancelledCount: 0,
    markedLive: null,
  };

  try {
    // Get event with fights
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        fights: {
          include: {
            fighter1: { select: { id: true, firstName: true, lastName: true } },
            fighter2: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!event) {
      console.error(`[Tapology Parser] Event not found: ${eventId}`);
      return result;
    }

    const scraperType = getEventTrackerType({ scraperType: event.scraperType });
    console.log(`[Tapology Parser] Scraper type: ${scraperType || 'none'}`);
    console.log(`[Tapology Parser] DB fights: ${event.fights.length}, Scraped: ${scrapedData.fights.length}`);

    // Track which DB fights were found in the scraped data (for cancellation detection)
    const matchedDbFightIds = new Set<string>();

    // Process each scraped fight
    for (const scrapedFight of scrapedData.fights) {
      const nameA = scrapedFight.fighterA.name;
      const nameB = scrapedFight.fighterB.name;

      let dbFight = findMatchingDbFight(event.fights, nameA, nameB);

      // If not in DB, create the fight on-the-fly — the daily scraper may have
      // missed it, or it may have been added to the card after the daily run.
      if (!dbFight) {
        const label = `${extractLastName(nameA)} vs ${extractLastName(nameB)}`;
        console.log(`  NEW ${label} - not in DB, creating...`);

        const fighter1 = await findOrCreateFighter(nameA);
        const fighter2 = await findOrCreateFighter(nameB);

        if (!fighter1 || !fighter2) {
          console.warn(`  SKIP ${label} - fighter create failed`);
          result.fightsNotFound.push(label);
          continue;
        }

        // Pick an orderOnCard. Prefer Tapology's bout number if it doesn't
        // collide with an existing fight; otherwise fall back to max + 1.
        const usedOrders = new Set(event.fights.map(f => f.orderOnCard));
        const maxOrder = event.fights.reduce((m, f) => Math.max(m, f.orderOnCard), 0);
        const desired = scrapedFight.boutOrder;
        const orderOnCard = (desired && !usedOrders.has(desired)) ? desired : (maxOrder + 1);

        try {
          const created = await prisma.fight.create({
            data: {
              eventId: event.id,
              fighter1Id: fighter1.id,
              fighter2Id: fighter2.id,
              orderOnCard,
              cardType: null,
              scheduledRounds: 3,
              fightStatus: 'UPCOMING',
            },
          });

          await syncFighterFollowMatchesForFight(created.id).catch(err =>
            console.warn('[FollowSync]', err)
          );

          // Synthesize a dbFight-shaped object so the rest of the loop can
          // update it immediately with the scraped result (e.g. for a fight
          // that Tapology already has as completed).
          dbFight = {
            ...created,
            fighter1,
            fighter2,
          };
          event.fights.push(dbFight);
          result.fightsCreated++;
          console.log(`  CREATED ${fighter1.lastName} vs ${fighter2.lastName} (orderOnCard=${orderOnCard})`);
        } catch (err: any) {
          console.error(`  FAIL to create fight ${label}:`, err.message);
          result.fightsNotFound.push(label);
          continue;
        }
      }

      result.fightsMatched++;
      matchedDbFightIds.add(dbFight.id);

      const updateData: any = {};
      let changed = false;

      // Reset lifecycle-completed fights (COMPLETED with no winner = premature lifecycle completion)
      if (!scrapedFight.isComplete && !scrapedFight.isCancelled &&
          dbFight.fightStatus === 'COMPLETED' && !dbFight.winner) {
        updateData.fightStatus = 'UPCOMING';
        changed = true;
        console.log(`    Reset ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} to UPCOMING (lifecycle premature)`);
      }

      // Handle completed fights — this is idempotent: if the DB fight is
      // already COMPLETED but missing method/winner (e.g. prematurely marked
      // by the lifecycle job), we still write the scraped result.
      if (scrapedFight.isComplete) {
        const isNoContest = scrapedFight.result?.method === 'NC';
        const isDraw = scrapedFight.result?.method === 'DRAW';

        // Determine winner: real fighter ID, "nc", "draw", or null
        let scrapedWinnerValue: string | null = null;
        if (isNoContest) {
          scrapedWinnerValue = 'nc';
        } else if (isDraw) {
          scrapedWinnerValue = 'draw';
        } else if (scrapedFight.result?.winner) {
          scrapedWinnerValue = getWinnerFighterId(
            scrapedFight.result.winner,
            dbFight.fighter1,
            dbFight.fighter2
          );
        }

        const wasAlreadyCompleted = dbFight.fightStatus === 'COMPLETED';

        if (!wasAlreadyCompleted) {
          updateData.fightStatus = 'COMPLETED';
          updateData.completionMethod = 'tapology-scraper';
          updateData.completedAt = new Date();
          changed = true;
        }

        // Write result fields whenever the scraper has them AND the DB
        // doesn't already have a matching value. This lets us fill in a
        // previously-premature completion, and specifically lets us land
        // an NC result on a fight that was auto-completed without data.
        if (scrapedWinnerValue && dbFight.winner !== scrapedWinnerValue) {
          updateData.winner = scrapedWinnerValue;
          changed = true;
        }
        if (scrapedFight.result?.method && dbFight.method !== scrapedFight.result.method) {
          updateData.method = scrapedFight.result.method;
          changed = true;
        }
        // For decisions/draws/NC the fight went the distance, so there is no
        // ended-in round or end-time. Clear any stale values left behind by
        // an earlier buggy scrape that pulled bogus numbers from the <li>.
        const scrapedMethod = scrapedFight.result?.method;
        const wentTheDistance = scrapedMethod &&
          ['DEC', 'UD', 'SD', 'MD', 'DRAW', 'NC'].includes(scrapedMethod);
        if (wentTheDistance) {
          if (dbFight.round !== null) { updateData.round = null; changed = true; }
          if (dbFight.time !== null) { updateData.time = null; changed = true; }
        } else {
          if (scrapedFight.result?.round && dbFight.round !== scrapedFight.result.round) {
            updateData.round = scrapedFight.result.round;
            changed = true;
          }
          if (scrapedFight.result?.time && dbFight.time !== scrapedFight.result.time) {
            updateData.time = scrapedFight.result.time;
            changed = true;
          }
        }

        if (changed) {
          let winnerDesc = '?';
          if (scrapedWinnerValue === 'nc') winnerDesc = 'NO CONTEST';
          else if (scrapedWinnerValue === 'draw') winnerDesc = 'DRAW';
          else if (scrapedWinnerValue === dbFight.fighter1.id) winnerDesc = dbFight.fighter1.lastName;
          else if (scrapedWinnerValue === dbFight.fighter2.id) winnerDesc = dbFight.fighter2.lastName;
          console.log(`  DONE ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} -> ${winnerDesc} by ${scrapedFight.result?.method || '?'}`);
        }

        // Fire next-fight notification only on the transition to COMPLETED
        if (!wasAlreadyCompleted) {
          notifyNextFight(eventId, dbFight.orderOnCard);
        }
      }

      // Handle scraped cancellations
      if (scrapedFight.isCancelled && dbFight.fightStatus !== 'CANCELLED') {
        updateData.fightStatus = 'CANCELLED';
        changed = true;
        result.cancelledCount++;
        console.log(`  CANCEL ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} (scraped as cancelled)`);
      }

      if (changed) {
        const finalData = buildTrackerUpdateData(updateData, scraperType);
        await prisma.fight.update({ where: { id: dbFight.id }, data: finalData });
        result.fightsUpdated++;
      }
    }

    // Cancellation detection: DB fights not in scraped data
    // Only do this if the event appears to have started (some fights completed or event is LIVE)
    const hasStarted = event.eventStatus === 'LIVE' ||
      scrapedData.status === 'live' || scrapedData.status === 'complete' ||
      scrapedData.fights.some(f => f.isComplete);

    // Safety guard: never run the missing-from-page cancellation sweep or the
    // UPCOMING→LIVE flip if the scrape came back empty or matched zero DB fights.
    // A broken/empty scrape would otherwise cancel every fight on the card and
    // trigger auto-completion of an event that hasn't happened yet (DBX 6 incident).
    const scrapeLooksValid = scrapedData.fights.length > 0 && result.fightsMatched > 0;
    if (hasStarted && !scrapeLooksValid) {
      console.log(
        `[Tapology Parser] Skipping cancellation sweep and LIVE flip: scrape looks empty ` +
        `(scraped=${scrapedData.fights.length}, matched=${result.fightsMatched})`
      );
    }

    // Once an event is COMPLETED, the card is frozen. The missing-from-page
    // sweep should not run — any "missing" is almost certainly a Tapology UI
    // quirk (pagination, exhibition hidden, stale cache), not a real cancel.
    // Result backfills for completed events still update winner/method/round
    // via the per-fight block above; only the sweep is skipped here.
    const eventIsComplete = event.eventStatus === 'COMPLETED';
    if (hasStarted && scrapeLooksValid && eventIsComplete) {
      console.log('[Tapology Parser] Skipping cancellation sweep: event already COMPLETED (backfill mode)');
    }

    // `scrapeLooksValid` only rules out a *fully* empty scrape. A partial one —
    // a Tapology markup change that drops most bouts, or a paginated card where
    // only the main card rendered — still sails through and cancels everything
    // it didn't see. Require the scrape to be proportionally healthy before any
    // CANCEL fires; un-cancelling stays on the weaker gate so a card that was
    // wrongly cancelled recovers on the next pass. (RAF11, 2026-07-18.)
    const dbNonCancelledCount = event.fights.filter(f => f.fightStatus !== 'CANCELLED').length;
    const scrapeHealthy = isScrapeHealthyForCancellation(result.fightsMatched, dbNonCancelledCount);
    if (hasStarted && scrapeLooksValid && !eventIsComplete && !scrapeHealthy) {
      console.log(
        `[Tapology Parser] Cancellation sweep disabled: matched ${result.fightsMatched} of ` +
        `${dbNonCancelledCount} non-cancelled DB fights — treating as partial scrape.`
      );
    }

    if (hasStarted && scrapeLooksValid && !eventIsComplete) {
      for (const dbFight of event.fights) {
        // Skip fights already completed with results or already cancelled
        if (dbFight.fightStatus === 'COMPLETED' && dbFight.winner) continue;

        const inScraped = matchedDbFightIds.has(dbFight.id);

        // Un-cancel: fight was CANCELLED in DB but reappeared in scraped data
        if (dbFight.fightStatus === 'CANCELLED' && inScraped) {
          await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'UPCOMING' } });
          result.unCancelledCount++;
          console.log(`  UN-CANCEL ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        }
        // Cancel: fight in DB but missing from scraped data
        else if (scrapeHealthy && dbFight.fightStatus !== 'CANCELLED' && !inScraped) {
          await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'CANCELLED' } });
          result.cancelledCount++;
          console.log(`  CANCEL ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} (missing from page)`);
        }
      }
    }

    // Update event status (guarded by scrapeLooksValid so an empty scrape can't flip LIVE)
    if (hasStarted && scrapeLooksValid && event.eventStatus === 'UPCOMING') {
      await prisma.event.update({ where: { id: eventId }, data: { eventStatus: 'LIVE' } });
      event.eventStatus = 'LIVE';
      console.log(`  Event -> LIVE`);
    }

    // Infer the running bout. Tapology never tells us one is live, so this is
    // purely timing-based — see inferLiveFight. Gated on the same health checks
    // as the cancellation sweep: a partial scrape must not move a bout to LIVE.
    if (!options.skipLiveInference && scrapeLooksValid && !eventIsComplete) {
      result.markedLive = await inferLiveFight(eventId, event, scraperType);
    }

    console.log(`\n[Tapology Parser] Done: ${result.fightsUpdated} updated, ${result.fightsMatched} matched, ${result.fightsCreated} created, ${result.cancelledCount} cancelled, ${result.unCancelledCount} un-cancelled`);
    if (result.fightsNotFound.length > 0) {
      console.log(`[Tapology Parser] Not found: ${result.fightsNotFound.join(', ')}`);
    }
    return result;

  } catch (error: any) {
    console.error(`[Tapology Parser] Error: ${error.message}`);
    throw error;
  }
}

/**
 * Scrape and parse in one step
 */
export async function scrapeAndParse(
  eventId: string,
  tapologyUrl: string
): Promise<ParseResult> {
  // Import scraper dynamically to avoid circular deps
  const { TapologyLiveScraper } = await import('./tapologyLiveScraper');

  console.log(`\n[Tapology] Scraping and parsing: ${tapologyUrl}`);

  const scraper = new TapologyLiveScraper(tapologyUrl);
  const scrapedData = await scraper.scrape();

  return parseTapologyData(eventId, scrapedData);
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventId = process.argv[2];
  const tapologyUrl = process.argv[3] || 'https://www.tapology.com/fightcenter/events/137070-zuffa-boxing';

  if (!eventId) {
    console.error('Usage: npx ts-node tapologyLiveParser.ts <eventId> [tapologyUrl]');
    console.error('Example: npx ts-node tapologyLiveParser.ts 3ce5be31-4d9c-4042-b7cb-97b6b440ad78');
    process.exit(1);
  }

  scrapeAndParse(eventId, tapologyUrl)
    .then(result => {
      console.log('\n📊 Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default { parseTapologyData, scrapeAndParse };
