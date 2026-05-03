/**
 * Historic UFC Backfill (ufcstats.com)
 *
 * Walks every UFC event on ufcstats.com (the official UFC stats site, ~770
 * events back to UFC 2 in 1994) and fills in missing winner / method / round /
 * time on existing Fight rows in our DB.
 *
 * Why this exists: ~6,500 of our 6,816 UFC fights have null winners. The
 * existing daily UFC scraper only writes results for the recent live window;
 * pre-2026 events were imported as skeletons (event + fight + fighter rows)
 * with no result data. ufcstats has results for every event since UFC 2.
 *
 * Safety contract:
 *   - Null-only writes. Never overwrites a non-null winner/method/round/time.
 *   - Event matching by DATE primarily (DB names diverge from ufcstats names
 *     by colons/periods). One UFC event per day ~always holds, so date is the
 *     reliable join key. Name-token overlap is used as a tiebreaker.
 *   - Fight matching by FIGHTER PAIR within an event (in either f1/f2 order).
 *   - Skips events not in our DB (logged) — does NOT create new events. This
 *     is a result-only backfill; event/fight skeleton creation is out of
 *     scope for v1.
 *   - completionMethod stamped 'backfill-ufcstats' for audit trail.
 *
 * Environment:
 *   DATABASE_URL                Required.
 *   BACKFILL_UFC_YEARS          CSV of years to process, e.g. "2023,2024,2025".
 *                               Empty = all years.
 *   BACKFILL_UFC_LIMIT          Cap on number of events to process (testing).
 *   BACKFILL_UFC_RATE_LIMIT_MS  Sleep between event fetches (default 1000).
 *   BACKFILL_UFC_DRY_RUN        "true" = log writes but don't execute.
 *
 * Run:
 *   pnpm tsx src/scripts/backfillUFCHistoric.ts
 *   BACKFILL_UFC_YEARS=2025 pnpm tsx src/scripts/backfillUFCHistoric.ts
 */

import { PrismaClient, Fight } from '@prisma/client';
import {
  fetchUFCStatsEventList,
  fetchUFCStatsEvent,
  UFCStatsEventRef,
  UFCStatsEvent,
  UFCStatsFight,
} from '../services/scrapeUFCStatsHistoric';

const prisma = new PrismaClient();

const RATE_LIMIT_MS = parseInt(process.env.BACKFILL_UFC_RATE_LIMIT_MS || '1000', 10);
const DRY_RUN = process.env.BACKFILL_UFC_DRY_RUN === 'true';
const EVENT_LIMIT = process.env.BACKFILL_UFC_LIMIT
  ? parseInt(process.env.BACKFILL_UFC_LIMIT, 10)
  : null;
const YEAR_FILTER = process.env.BACKFILL_UFC_YEARS
  ? new Set(process.env.BACKFILL_UFC_YEARS.split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite))
  : null;

interface EventStats {
  scrapedFights: number;
  matchedFights: number;
  filledWinner: number;
  filledMethod: number;
  filledRound: number;
  filledTime: number;
  unmatchedFights: Array<{ f1: string; f2: string }>;
}

function emptyEventStats(): EventStats {
  return {
    scrapedFights: 0,
    matchedFights: 0,
    filledWinner: 0,
    filledMethod: 0,
    filledRound: 0,
    filledTime: 0,
    unmatchedFights: [],
  };
}

interface RunStats {
  eventsConsidered: number;
  eventsMatched: number;
  eventsMissing: Array<{ name: string; date: string; url: string }>;
  eventsFailed: Array<{ name: string; date: string; error: string }>;
  totals: EventStats;
  byYear: Record<number, EventStats>;
}

function emptyRunStats(): RunStats {
  return {
    eventsConsidered: 0,
    eventsMatched: 0,
    eventsMissing: [],
    eventsFailed: [],
    totals: emptyEventStats(),
    byYear: {},
  };
}

function mergeStats(into: EventStats, from: EventStats): void {
  into.scrapedFights += from.scrapedFights;
  into.matchedFights += from.matchedFights;
  into.filledWinner += from.filledWinner;
  into.filledMethod += from.filledMethod;
  into.filledRound += from.filledRound;
  into.filledTime += from.filledTime;
  into.unmatchedFights.push(...from.unmatchedFights);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Find a DB event matching the ufcstats event by date (within ±1 day).
 * If multiple match, pick the one whose name has the most token overlap.
 */
async function findDbEvent(ref: UFCStatsEventRef) {
  const dayMs = 24 * 60 * 60 * 1000;
  const lo = new Date(ref.date.getTime() - dayMs);
  const hi = new Date(ref.date.getTime() + dayMs);

  const candidates = await prisma.event.findMany({
    where: {
      date: { gte: lo, lte: hi },
      // UFC events only — match by name prefix
      name: { startsWith: 'UFC' },
    },
    select: { id: true, name: true, date: true },
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple candidates on the same date — pick by name-token overlap
  const refTokens = nameTokens(ref.name);
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const score = jaccard(refTokens, nameTokens(c.name));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2 && !STOPWORDS.has(t)),
  );
}
const STOPWORDS = new Set(['ufc', 'vs', 'fight', 'night', 'the']);

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Find the DB fight on this event whose fighter pair matches the scraped fight.
 *
 * Pass 1: exact normalized name match.
 * Pass 2: token-overlap fallback (catches middle-name drops, e.g.
 *         "Ian Machado Garry" vs DB "Ian Garry"). Requires BOTH fighters
 *         to score >= MIN_TOKEN_OVERLAP and the pair to be the unique best
 *         within the event.
 */
async function findDbFight(eventId: string, sf: UFCStatsFight) {
  const fights = await prisma.fight.findMany({
    where: { eventId },
    include: {
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const f1Norm = normalizeName(sf.f1Name);
  const f2Norm = normalizeName(sf.f2Name);

  // Pass 1: exact match
  for (const fight of fights) {
    const a = fight.fighter1 ? normalizeName(`${fight.fighter1.firstName} ${fight.fighter1.lastName}`) : '';
    const b = fight.fighter2 ? normalizeName(`${fight.fighter2.firstName} ${fight.fighter2.lastName}`) : '';
    if ((a === f1Norm && b === f2Norm) || (a === f2Norm && b === f1Norm)) {
      return buildMatch(fight, a === f1Norm, sf.winner);
    }
  }

  // Pass 2: fuzzy token-overlap fallback
  const sf1Tokens = nameTokens(sf.f1Name);
  const sf2Tokens = nameTokens(sf.f2Name);

  type Candidate = { fight: typeof fights[number]; aIsF1: boolean; score: number };
  const candidates: Candidate[] = [];

  for (const fight of fights) {
    if (!fight.fighter1 || !fight.fighter2) continue;
    const aTokens = nameTokens(`${fight.fighter1.firstName} ${fight.fighter1.lastName}`);
    const bTokens = nameTokens(`${fight.fighter2.firstName} ${fight.fighter2.lastName}`);

    // Try a=f1, b=f2
    const score1 = Math.min(jaccard(aTokens, sf1Tokens), jaccard(bTokens, sf2Tokens));
    // Try a=f2, b=f1
    const score2 = Math.min(jaccard(aTokens, sf2Tokens), jaccard(bTokens, sf1Tokens));

    if (score1 >= MIN_TOKEN_OVERLAP) candidates.push({ fight, aIsF1: true, score: score1 });
    if (score2 >= MIN_TOKEN_OVERLAP) candidates.push({ fight, aIsF1: false, score: score2 });
  }

  if (candidates.length === 0) return null;
  candidates.sort((x, y) => y.score - x.score);
  // Reject ambiguity — top two scores too close means we can't pick safely
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 0.1) return null;

  const { fight, aIsF1 } = candidates[0];
  return buildMatch(fight, aIsF1, sf.winner);
}

const MIN_TOKEN_OVERLAP = 0.5;

function buildMatch(
  fight: { id: string; fighter1Id: string | null; fighter2Id: string | null; winner: string | null; method: string | null; round: number | null; time: string | null; fightStatus: string },
  aIsF1: boolean,
  scrapedWinner: UFCStatsFight['winner'],
) {
  let dbWinnerId: string | 'draw' | 'nc' | null = null;
  if (scrapedWinner === 'draw') dbWinnerId = 'draw';
  else if (scrapedWinner === 'nc') dbWinnerId = 'nc';
  else if (scrapedWinner === 'f1') dbWinnerId = aIsF1 ? fight.fighter1Id : fight.fighter2Id;
  else if (scrapedWinner === 'f2') dbWinnerId = aIsF1 ? fight.fighter2Id : fight.fighter1Id;
  return { fight, dbWinnerId };
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function processEvent(ref: UFCStatsEventRef): Promise<{ stats: EventStats; matched: boolean; error?: string }> {
  const stats = emptyEventStats();

  const dbEvent = await findDbEvent(ref);
  if (!dbEvent) {
    return { stats, matched: false };
  }

  let detail: UFCStatsEvent;
  try {
    detail = await fetchUFCStatsEvent(ref.ufcStatsUrl);
  } catch (err: any) {
    return { stats, matched: true, error: `fetch event detail failed: ${err.message}` };
  }

  stats.scrapedFights = detail.fights.length;

  for (const sf of detail.fights) {
    const match = await findDbFight(dbEvent.id, sf);
    if (!match) {
      stats.unmatchedFights.push({ f1: sf.f1Name, f2: sf.f2Name });
      continue;
    }
    stats.matchedFights++;

    const updates: Partial<Pick<Fight, 'winner' | 'method' | 'round' | 'time' | 'completionMethod' | 'fightStatus'>> = {};
    if (match.fight.winner === null && match.dbWinnerId !== null) {
      updates.winner = match.dbWinnerId === 'draw' ? 'draw' : match.dbWinnerId === 'nc' ? 'nc' : match.dbWinnerId;
      stats.filledWinner++;
    }
    if (match.fight.method === null && sf.method) {
      updates.method = sf.methodDetail ? `${sf.method} (${sf.methodDetail})` : sf.method;
      stats.filledMethod++;
    }
    if (match.fight.round === null && sf.round !== null) {
      updates.round = sf.round;
      stats.filledRound++;
    }
    if (match.fight.time === null && sf.time) {
      updates.time = sf.time;
      stats.filledTime++;
    }

    if (Object.keys(updates).length === 0) continue;

    // Stamp audit trail + ensure fightStatus reflects completion
    updates.completionMethod = 'backfill-ufcstats';
    if (match.fight.fightStatus !== 'COMPLETED') {
      updates.fightStatus = 'COMPLETED';
    }

    if (DRY_RUN) {
      console.log(`    [dry-run] would update fight ${match.fight.id}:`, updates);
    } else {
      await prisma.fight.update({
        where: { id: match.fight.id },
        data: updates,
      });
    }
  }

  return { stats, matched: true };
}

async function main() {
  console.log('========================================');
  console.log('[ufc-historic] Historic UFC results backfill (ufcstats.com)');
  console.log(`[ufc-historic] Year filter: ${YEAR_FILTER ? Array.from(YEAR_FILTER).sort().join(',') : 'all'}`);
  console.log(`[ufc-historic] Event limit: ${EVENT_LIMIT ?? 'none'}`);
  console.log(`[ufc-historic] Rate limit: ${RATE_LIMIT_MS}ms`);
  console.log(`[ufc-historic] Dry run: ${DRY_RUN}`);
  console.log(`[ufc-historic] Started: ${new Date().toISOString()}`);
  console.log('========================================');

  console.log('\n[ufc-historic] Fetching ufcstats event list...');
  let events = await fetchUFCStatsEventList();
  console.log(`[ufc-historic] Got ${events.length} historic events`);

  if (YEAR_FILTER) {
    events = events.filter(e => YEAR_FILTER.has(e.date.getUTCFullYear()));
    console.log(`[ufc-historic] After year filter: ${events.length} events`);
  }
  if (EVENT_LIMIT) {
    events = events.slice(0, EVENT_LIMIT);
    console.log(`[ufc-historic] After event limit: ${events.length} events`);
  }

  const run = emptyRunStats();

  for (let i = 0; i < events.length; i++) {
    const ref = events[i];
    const yr = ref.date.getUTCFullYear();
    run.eventsConsidered++;

    process.stdout.write(`\n[${i + 1}/${events.length}] ${ref.name} (${ref.date.toISOString().split('T')[0]}) … `);

    const result = await processEvent(ref);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
      run.eventsFailed.push({ name: ref.name, date: ref.date.toISOString().split('T')[0], error: result.error });
    } else if (!result.matched) {
      console.log('NO DB MATCH');
      run.eventsMissing.push({ name: ref.name, date: ref.date.toISOString().split('T')[0], url: ref.ufcStatsUrl });
    } else {
      run.eventsMatched++;
      const s = result.stats;
      console.log(
        `matched=${s.matchedFights}/${s.scrapedFights}  ` +
        `+winner=${s.filledWinner} +method=${s.filledMethod} +round=${s.filledRound} +time=${s.filledTime}` +
        (s.unmatchedFights.length ? ` (unmatched: ${s.unmatchedFights.length})` : ''),
      );
      for (const u of s.unmatchedFights) {
        console.log(`    [unmatched] ${u.f1} vs ${u.f2}`);
      }
      mergeStats(run.totals, s);
      run.byYear[yr] ||= emptyEventStats();
      mergeStats(run.byYear[yr], s);
    }

    if (i < events.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log('\n========================================');
  console.log('[ufc-historic] Summary');
  console.log(`  events considered: ${run.eventsConsidered}`);
  console.log(`  events matched in DB: ${run.eventsMatched}`);
  console.log(`  events missing from DB: ${run.eventsMissing.length}`);
  console.log(`  events failed: ${run.eventsFailed.length}`);
  console.log(`  total fights scraped: ${run.totals.scrapedFights}`);
  console.log(`  total fights matched: ${run.totals.matchedFights}`);
  console.log(`  +winner: ${run.totals.filledWinner}`);
  console.log(`  +method: ${run.totals.filledMethod}`);
  console.log(`  +round: ${run.totals.filledRound}`);
  console.log(`  +time: ${run.totals.filledTime}`);

  console.log('\n[ufc-historic] By year:');
  for (const yr of Object.keys(run.byYear).map(Number).sort((a, b) => a - b)) {
    const s = run.byYear[yr];
    console.log(`  ${yr}: matched=${s.matchedFights}/${s.scrapedFights}  +winner=${s.filledWinner} +method=${s.filledMethod} +round=${s.filledRound} +time=${s.filledTime}  unmatched=${s.unmatchedFights.length}`);
  }

  if (run.eventsMissing.length > 0) {
    console.log(`\n[ufc-historic] First 20 missing events:`);
    for (const m of run.eventsMissing.slice(0, 20)) {
      console.log(`  ${m.date}  ${m.name}`);
    }
  }
  if (run.eventsFailed.length > 0) {
    console.log(`\n[ufc-historic] Failed events:`);
    for (const f of run.eventsFailed) {
      console.log(`  ${f.date}  ${f.name}: ${f.error}`);
    }
  }

  console.log(`\n[ufc-historic] Done at ${new Date().toISOString()}`);
  console.log('========================================');

  if (run.eventsFailed.length > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(process.exitCode || 0)))
  .catch(async (err) => {
    console.error('[ufc-historic] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
