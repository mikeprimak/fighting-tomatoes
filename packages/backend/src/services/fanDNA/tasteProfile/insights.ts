/**
 * Candidate generation: TasteSignature → scored InsightCandidates.
 *
 * Five generators. Per (dimension, token) only the single best candidate
 * survives dedupe — otherwise "wars" would headline three times in one list.
 * Community-compare naturally outranks self-contrast on the same token via
 * COMMUNITY_KIND_BOOST when both qualify (the agreed hierarchy: you-vs-fans
 * is the stronger story when the baseline is trustworthy; self-referential
 * is the deep bench that keeps the mirror full).
 */
import {
  rarity,
  scoreAbsolute,
  scoreCommunityCompare,
  scoreFighterToken,
  scoreSelfContrast,
} from './surprise';
import {
  ABSOLUTE_BOOST,
  FIGHTER_MIN_DISTINCT,
  FIGHTER_MIN_WEIGHT,
  GLOBAL_CMP_FLOOR,
  HIGH_RATING,
  MIN_N,
  SCORE_FLOOR,
  type InsightCandidate,
  type TasteSignature,
  type TokenStat,
} from './types';

/** Absolute generators need slightly more proof than trend generators. */
const NEVER_ABOVE_MIN_N = 10;
const NEVER_ABOVE_CAP = 7; // "never above a 7" — caps higher than this are weak tea
/**
 * A token present on most of the user's history isn't a ceiling story, it IS
 * their baseline — "you never rate above 7" belongs to rating-bias, not here.
 */
const NEVER_ABOVE_MAX_PRESENT_SHARE = 0.4;
/** The token must genuinely sit below the user's norm, not just lack peaks. */
const NEVER_ABOVE_MIN_AVG_GAP = 0.5;
const ALL_HIGH_MIN_N = 8;
const ALL_TENS_MIN = 4;
/** all-tens-share is trivial when the token appears on most fights anyway. */
const ALL_TENS_MAX_PRESENT_SHARE = 0.5;
/**
 * Evidence for all-tens-share saturates on a tens scale, not the 25-fight
 * trend scale: five perfect scores is a LOT of perfect scores.
 */
const TENS_EVIDENCE_SAT = 6;

/**
 * Correlated tokens that tell ONE story. The pilot review (Mike, 2026-06-11)
 * had six of the top spots saying "you defend fights the crowd gave up on"
 * six slightly different ways. Within a cluster, only the strongest candidate
 * per direction survives; the rest are the same insight wearing different
 * tokens. Extend this map as new correlations show up in real profiles.
 */
const TOKEN_CLUSTERS: Record<string, string> = {
  'letdowns|low_output': 'tension-watcher',
  'actionLevel|low_action': 'tension-watcher',
  'letdowns|point_fighting': 'tension-watcher',
  'letdowns|anticlimactic': 'tension-watcher',
  'drama|anticlimax': 'tension-watcher',
  'vibe|frustrating': 'tension-watcher',
};

/**
 * Motivation inference (Mike, pilot review 2026-06-11): the same behavior has
 * different WHYS — he defends slow fights for the tension ("anything can
 * happen"), others for the chess match. The engine never asserts a motive the
 * data can't support: a voice is chosen only when enough of the user's OTHER
 * loved tokens corroborate it (and clearly beat rival voices); otherwise the
 * cluster speaks in motive-neutral, behavior-only copy.
 */
const CLUSTER_VOICES: Record<string, Record<string, readonly string[]>> = {
  'tension-watcher': {
    // Loves finishes and violence elsewhere → sits through slow fights
    // waiting for the bomb to land.
    tension: [
      'actionLevel|war',
      'dominantSkill|knockout_power',
      'appeals|knockout',
      'appeals|finish_hunting',
      'finishTiming|first_exchange',
      'finishTiming|final_seconds',
    ],
    // Loves technique and ring IQ elsewhere → enjoys the calculations, the
    // mental work, the testing of each other.
    chess: [
      'texture|high_iq_chess',
      'texture|technical_masterclass',
      'dominantSkill|fight_iq',
      'appeals|technique',
      'appeals|grappling_artistry',
    ],
  },
};
/** A corroborating token must be genuinely loved, not merely present. */
const VOICE_MIN_DELTA = 0.5;
/** Distinct corroborating tokens required before a motive may be claimed. */
const VOICE_MIN_SUPPORTS = 2;

function inferClusterVoices(sig: TasteSignature): Map<string, string> {
  const loved = new Set<string>();
  for (const t of sig.tokens) {
    if (
      t.count >= MIN_N &&
      t.avgRating - sig.baseline.avg >= VOICE_MIN_DELTA
    ) {
      loved.add(`${t.dimension}|${t.token}`);
    }
  }
  const out = new Map<string, string>();
  for (const [cluster, voices] of Object.entries(CLUSTER_VOICES)) {
    let bestVoice: string | null = null;
    let bestN = 0;
    let tied = false;
    for (const [voice, supports] of Object.entries(voices)) {
      const n = supports.filter((s) => loved.has(s)).length;
      if (n > bestN) {
        bestVoice = voice;
        bestN = n;
        tied = false;
      } else if (n === bestN && n > 0) {
        tied = true;
      }
    }
    if (bestVoice && bestN >= VOICE_MIN_SUPPORTS && !tied) {
      out.set(cluster, bestVoice);
    }
  }
  return out;
}

export function generateCandidates(sig: TasteSignature): InsightCandidate[] {
  const out: InsightCandidate[] = [];
  const { baseline } = sig;

  // A globally generous/harsh rater is "above the room" on everything; only
  // token gaps BEYOND their global gap carry information.
  const globalCmpDelta =
    baseline.cmpCount >= GLOBAL_CMP_FLOOR ? baseline.avgDeltaVsCommunity : 0;

  for (const t of sig.tokens) {
    selfContrast(t, baseline.avg, out);
    communityCompare(t, globalCmpDelta, out);
    neverAbove(t, baseline, out);
    allHigh(t, out);
    allTensShare(t, baseline.tensCount, out);
  }

  // Per-dimension totals for the lift baseline (volume-artifact guard).
  const dimTotals = new Map<string, { weight: number; touch: number }>();
  for (const f of sig.fighterTokens) {
    const t = dimTotals.get(f.dimension) ?? { weight: 0, touch: 0 };
    t.weight += f.weight;
    t.touch += f.touchCount;
    dimTotals.set(f.dimension, t);
  }

  for (const f of sig.fighterTokens) {
    if (f.fighterCount < FIGHTER_MIN_DISTINCT || f.weight < FIGHTER_MIN_WEIGHT)
      continue;
    const totals = dimTotals.get(f.dimension);
    if (!totals || totals.weight <= 0 || totals.touch <= 0) continue;
    const weightShare = f.weight / totals.weight;
    const touchShare = f.touchCount / totals.touch;
    const lift = touchShare > 0 ? weightShare / touchShare : 0;
    const score = scoreFighterToken({
      dimension: f.dimension,
      token: f.token,
      lift,
      fighterCount: f.fighterCount,
    });
    if (score < SCORE_FLOOR) continue;
    out.push({
      kind:
        f.dimension === 'fighterStyle'
          ? 'fighter-style'
          : f.dimension === 'fighterAppeal'
            ? 'fighter-appeal'
            : 'fighter-persona',
      dimension: f.dimension,
      token: f.token,
      direction: 'high',
      score,
      stats: {
        n: f.fighterCount,
        weight: f.weight,
        lift,
        fighterCount: f.fighterCount,
        topFighters: f.topFighters,
      },
    });
  }

  return dedupeByCluster(dedupeByToken(out), inferClusterVoices(sig)).sort(
    (a, b) => b.score - a.score,
  );
}

function selfContrast(
  t: TokenStat,
  baselineAvg: number,
  out: InsightCandidate[],
): void {
  const delta = t.avgRating - baselineAvg;
  const scored = scoreSelfContrast({
    dimension: t.dimension,
    token: t.token,
    n: t.count,
    delta,
  });
  if (!scored || scored.score < SCORE_FLOOR) return;
  out.push({
    kind: scored.direction === 'high' ? 'loves' : 'cold',
    dimension: t.dimension,
    token: t.token,
    direction: scored.direction,
    score: scored.score,
    stats: {
      n: t.count,
      avg: t.avgRating,
      baseline: baselineAvg,
      delta,
    },
  });
}

function communityCompare(
  t: TokenStat,
  globalCmpDelta: number,
  out: InsightCandidate[],
): void {
  if (t.avgDeltaVsCommunity == null) return;
  // Score on the gap BEYOND the user's global community gap; the copy still
  // shows the raw (true) per-token delta.
  const adjusted = t.avgDeltaVsCommunity - globalCmpDelta;
  const scored = scoreCommunityCompare({
    dimension: t.dimension,
    token: t.token,
    cmpN: t.cmpN,
    deltaVsCommunity: adjusted,
  });
  if (!scored || scored.score < SCORE_FLOOR) return;
  out.push({
    kind: scored.direction === 'high' ? 'community-high' : 'community-low',
    dimension: t.dimension,
    token: t.token,
    direction: scored.direction,
    score: scored.score,
    stats: {
      n: t.cmpN,
      avg: t.avgRating,
      deltaVsCommunity: t.avgDeltaVsCommunity,
      adjustedDelta: adjusted,
    },
  });
}

/**
 * "You've rated 20 decisions and never given one more than a 7."
 * Guards: the token must be a slice of the history (not the bulk of it), and
 * must genuinely sit below the user's norm — a user whose global ceiling is 7
 * has a generosity pattern, not a token pattern.
 */
function neverAbove(
  t: TokenStat,
  baseline: TasteSignature['baseline'],
  out: InsightCandidate[],
): void {
  if (t.count < NEVER_ABOVE_MIN_N) return;
  if (t.maxRating > NEVER_ABOVE_CAP) return;
  if (t.presentShare > NEVER_ABOVE_MAX_PRESENT_SHARE) return;
  if (t.avgRating > baseline.avg - NEVER_ABOVE_MIN_AVG_GAP) return;
  const score = scoreAbsolute({
    dimension: t.dimension,
    token: t.token,
    n: t.count,
    direction: 'low',
  });
  if (score < SCORE_FLOOR) return;
  out.push({
    kind: 'never-above',
    dimension: t.dimension,
    token: t.token,
    direction: 'low',
    score,
    stats: { n: t.count, cap: t.maxRating },
  });
}

/** "All 12 of your clinch wars got an 8 or higher." */
function allHigh(t: TokenStat, out: InsightCandidate[]): void {
  if (t.count < ALL_HIGH_MIN_N) return;
  if (t.minRating < HIGH_RATING) return;
  const score = scoreAbsolute({
    dimension: t.dimension,
    token: t.token,
    n: t.count,
    direction: 'high',
  });
  if (score < SCORE_FLOOR) return;
  out.push({
    kind: 'all-high',
    dimension: t.dimension,
    token: t.token,
    direction: 'high',
    score,
    stats: { n: t.count, avg: t.avgRating },
  });
}

/** "Every 10 you've ever given had a comeback in it." */
function allTensShare(
  t: TokenStat,
  totalTens: number,
  out: InsightCandidate[],
): void {
  if (totalTens < ALL_TENS_MIN) return;
  if (t.tensCount !== totalTens) return;
  if (t.presentShare > ALL_TENS_MAX_PRESENT_SHARE) return;
  const score =
    0.55 *
    Math.min(1, totalTens / TENS_EVIDENCE_SAT) *
    rarity(t.dimension, t.token, 'high') *
    ABSOLUTE_BOOST;
  if (score < SCORE_FLOOR) return;
  out.push({
    kind: 'all-tens-share',
    dimension: t.dimension,
    token: t.token,
    direction: 'high',
    score,
    stats: { n: t.count, tens: totalTens },
  });
}

/** Keep only the strongest candidate per (dimension, token). */
function dedupeByToken(candidates: InsightCandidate[]): InsightCandidate[] {
  const best = new Map<string, InsightCandidate>();
  for (const c of candidates) {
    const key = `${c.dimension}|${c.token}`;
    const cur = best.get(key);
    if (!cur || c.score > cur.score) best.set(key, c);
  }
  return [...best.values()];
}

/**
 * Keep only the strongest member of each correlated-token cluster (per
 * direction). Survivors get `cluster` stamped so copy can speak in the
 * cluster's voice instead of the individual token's.
 */
function dedupeByCluster(
  candidates: InsightCandidate[],
  voices: Map<string, string>,
): InsightCandidate[] {
  const out: InsightCandidate[] = [];
  const best = new Map<string, InsightCandidate>();
  for (const c of candidates) {
    const cluster = TOKEN_CLUSTERS[`${c.dimension}|${c.token}`];
    if (!cluster) {
      out.push(c);
      continue;
    }
    const key = `${cluster}|${c.direction}`;
    const cur = best.get(key);
    if (!cur || c.score > cur.score) {
      best.set(key, { ...c, cluster, voice: voices.get(cluster) });
    }
  }
  return [...out, ...best.values()];
}

// Re-exported for the orchestrator + tests.
export { MIN_N };
