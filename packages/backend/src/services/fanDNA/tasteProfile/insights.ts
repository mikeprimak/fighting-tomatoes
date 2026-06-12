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
  EVIDENCE_SAT,
  FIGHTER_MIN_DISTINCT,
  FIGHTER_MIN_WEIGHT,
  GLOBAL_CMP_FLOOR,
  HIGH_RATING,
  MIN_N,
  SCORE_FLOOR,
  type FighterInput,
  type InsightCandidate,
  type RecCandidate,
  type TasteSignature,
  type TokenStat,
} from './types';

/** Global grading-bias thresholds (see ratingBias below). */
const BIAS_MIN_DELTA = 0.5;
const BIAS_GAP_NORM = 1.5;
const BIAS_BOOST = 1.2;
/**
 * The global gap averages across every compared fight, so its evidence
 * saturates far faster than any single token's (EVIDENCE_SAT = 25).
 */
const BIAS_EVIDENCE_SAT = 12;

/**
 * Self-relative pair thresholds (see prefersPairs below). The per-token floor
 * sits below MIN_N because the claim is COMPARATIVE: "X over Y" rests on two
 * samples (≥10 fights combined), not one token's solo average.
 */
const PAIR_MIN_N = 5;
const PAIR_MIN_GAP = 1.2;
const PAIR_GAP_NORM = 2.5;
const PAIR_EVIDENCE_SAT = 12;
/** These ARE the primary insight family (Mike, 2026-06-12) — rank them so. */
const PREFERS_BOOST = 1.25;
/**
 * Dimensions whose tokens are quality-ordered, where "X over Y" restates the
 * rating scale instead of revealing taste ("instant classics over forgettable
 * fights" is true of every human).
 */
const PAIR_EXCLUDED_DIMS = new Set(['vibe', 'letdowns']);

/** 'rates-high' simple observation thresholds. */
const RATES_HIGH_MIN_AVG = 8;
const RATES_HIGH_MAX_PRESENT_SHARE = 0.6;
/** 'fighter-love' thresholds: most of a real sample landed high. */
const FIGHTER_LOVE_MIN_RATED = 5;
const FIGHTER_LOVE_MIN_HIGH = 4;
const FIGHTER_LOVE_MIN_SHARE = 0.7;
const FIGHTER_LOVE_EVIDENCE_SAT = 10;
/** 'fighter-rec' thresholds: token overlap with the user's loved tokens. */
const REC_MIN_MATCHES = 2;
const REC_MAX = 2;
const REC_WEIGHT_NORM = 40;

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
/**
 * Like all-tens-share: "all N you rated landed 8+" is trivial when the token
 * rides most of the user's history — on a curated all-classics onboarding
 * stack, a near-universal token going "all high" is the stack, not the user.
 */
const ALL_HIGH_MAX_PRESENT_SHARE = 0.5;
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

export function generateCandidates(
  sig: TasteSignature,
  extras?: { fighters?: FighterInput[]; recCandidates?: RecCandidate[] },
): InsightCandidate[] {
  const out: InsightCandidate[] = [];
  const { baseline } = sig;

  // A globally generous/harsh rater is "above the room" on everything; only
  // token gaps BEYOND their global gap carry information.
  const globalCmpDelta =
    baseline.cmpCount >= GLOBAL_CMP_FLOOR ? baseline.avgDeltaVsCommunity : 0;

  ratingBias(baseline, out);
  prefersPairs(sig.tokens, out);
  fighterLove(extras?.fighters ?? [], out);
  fighterRecs(sig.fighterTokens, extras?.recCandidates ?? [], out);

  for (const t of sig.tokens) {
    selfContrast(t, baseline.avg, out);
    communityCompare(t, globalCmpDelta, out);
    ratesHigh(t, baseline.avg, out);
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

  return capCommunityKinds(
    dedupeByCluster(dedupeByToken(out), inferClusterVoices(sig)).sort(
      (a, b) => b.score - a.score,
    ),
  );
}

/**
 * "There should only be one that says I rate lower than the group on any one
 * thing" (Mike, 2026-06-12). You-vs-the-crowd is ONE idea per direction no
 * matter how many tokens express it: keep only the strongest card among the
 * group-comparison kinds in each direction (global bias and per-token compare
 * candidates compete for the same single slot).
 */
const BELOW_GROUP_KINDS = new Set(['community-low', 'rating-bias-low']);
const ABOVE_GROUP_KINDS = new Set(['community-high', 'rating-bias-high']);

function capCommunityKinds(sorted: InsightCandidate[]): InsightCandidate[] {
  let belowSeen = false;
  let aboveSeen = false;
  return sorted.filter((c) => {
    if (BELOW_GROUP_KINDS.has(c.kind)) {
      if (belowSeen) return false;
      belowSeen = true;
    } else if (ABOVE_GROUP_KINDS.has(c.kind)) {
      if (aboveSeen) return false;
      aboveSeen = true;
    }
    return true;
  });
}

/**
 * Global grading bias — ONE card for the one idea. When the user's overall
 * average sits clearly above/below the community on the same fights, that is
 * a single fact about THEM, not about any token. Without this card it leaks
 * through every token as "harder on X than the crowd" ten slightly different
 * ways (Mike's onboarding walk, 2026-06-12). The per-token community
 * generator subtracts the global gap (same GLOBAL_CMP_FLOOR), so this card
 * and any surviving per-token cards never tell the same story.
 */
function ratingBias(
  baseline: TasteSignature['baseline'],
  out: InsightCandidate[],
): void {
  if (baseline.cmpCount < GLOBAL_CMP_FLOOR) return;
  const delta = baseline.avgDeltaVsCommunity;
  if (Math.abs(delta) < BIAS_MIN_DELTA) return;
  const score =
    Math.min(1, Math.abs(delta) / BIAS_GAP_NORM) *
    Math.min(1, baseline.cmpCount / BIAS_EVIDENCE_SAT) *
    BIAS_BOOST;
  if (score < SCORE_FLOOR) return;
  out.push({
    kind: delta >= 0 ? 'rating-bias-high' : 'rating-bias-low',
    dimension: 'global',
    token: 'rating-bias',
    direction: delta >= 0 ? 'high' : 'low',
    score,
    stats: { n: baseline.cmpCount, deltaVsCommunity: delta },
  });
}

/**
 * Self-relative pairwise preference — the PRIMARY insight family (Mike,
 * 2026-06-12): "you like striking battles more than grappling battles",
 * "knockouts over decisions". Within each dimension, the widest top-vs-bottom
 * average gap among tokens with enough sample becomes one candidate. No
 * community data anywhere — this is the user against their own taste, which
 * also makes it the family that works best on small onboarding histories
 * (clustered-high baselines mute self-contrast deltas, but a pair gap is
 * measured between tokens, not against the muted baseline).
 */
function prefersPairs(
  tokens: TokenStat[],
  out: InsightCandidate[],
): void {
  const byDim = new Map<string, TokenStat[]>();
  for (const t of tokens) {
    if (t.count < PAIR_MIN_N) continue;
    if (PAIR_EXCLUDED_DIMS.has(t.dimension)) continue;
    const arr = byDim.get(t.dimension) ?? [];
    arr.push(t);
    byDim.set(t.dimension, arr);
  }
  for (const [dimension, stats] of byDim) {
    if (stats.length < 2) continue;
    let top = stats[0];
    let bottom = stats[0];
    for (const s of stats) {
      if (s.avgRating > top.avgRating) top = s;
      if (s.avgRating < bottom.avgRating) bottom = s;
    }
    const gap = top.avgRating - bottom.avgRating;
    if (gap < PAIR_MIN_GAP) continue;
    const score =
      Math.min(1, gap / PAIR_GAP_NORM) *
      Math.min(1, Math.min(top.count, bottom.count) / PAIR_EVIDENCE_SAT) *
      rarity(dimension, top.token, 'high') *
      PREFERS_BOOST;
    if (score < SCORE_FLOOR) continue;
    out.push({
      kind: 'prefers',
      dimension,
      token: top.token,
      direction: 'high',
      score,
      stats: {
        n: top.count + bottom.count,
        avg: top.avgRating,
        delta: gap,
        vsToken: bottom.token,
        avgB: bottom.avgRating,
        nB: bottom.count,
      },
    });
  }
}

/**
 * Simple non-comparative observation — "You rate back-and-forth fights 8.9
 * on average." Part of the 2026-06-12 diversity pass: a list that is ALL
 * comparisons (vs self, vs crowd, X over Y) reads computer-generated; plain
 * statements of fact break the pattern. Requires the token to be genuinely
 * high in absolute terms AND at/above the user's own norm, so the card is
 * never technically-true-but-misleading for a generous grader.
 */
function ratesHigh(
  t: TokenStat,
  baselineAvg: number,
  out: InsightCandidate[],
): void {
  if (t.count < MIN_N) return;
  if (t.avgRating < RATES_HIGH_MIN_AVG || t.avgRating < baselineAvg) return;
  if (t.presentShare > RATES_HIGH_MAX_PRESENT_SHARE) return;
  // Base sits between loves (gap-driven) and all-high (0.55 × 1.3): a plain
  // "you rate these high" is a modest but solid claim.
  const score =
    0.6 *
    Math.min(1, t.count / EVIDENCE_SAT) *
    rarity(t.dimension, t.token, 'high');
  if (score < SCORE_FLOOR) return;
  out.push({
    kind: 'rates-high',
    dimension: t.dimension,
    token: t.token,
    direction: 'high',
    score,
    stats: { n: t.count, avg: t.avgRating },
  });
}

/**
 * "You seem to love Conor McGregor fights" — a single fighter whose fights
 * keep landing high scores. Reads as a human noticing, not a stat engine.
 */
function fighterLove(fighters: FighterInput[], out: InsightCandidate[]): void {
  for (const f of fighters) {
    const rated = f.ratedCount ?? 0;
    const high = f.highRatedCount ?? 0;
    if (rated < FIGHTER_LOVE_MIN_RATED) continue;
    if (high < FIGHTER_LOVE_MIN_HIGH) continue;
    const share = high / rated;
    if (share < FIGHTER_LOVE_MIN_SHARE) continue;
    const score =
      0.6 * Math.min(1, rated / FIGHTER_LOVE_EVIDENCE_SAT) * share;
    if (score < SCORE_FLOOR) continue;
    out.push({
      kind: 'fighter-love',
      dimension: 'fighter',
      token: f.fighterId,
      direction: 'high',
      score,
      stats: { n: rated, highN: high, topFighters: [f.fullName ?? f.name] },
    });
  }
}

/**
 * Fighter recommendation — an untouched notable fighter whose archetype
 * tokens overlap the user's loved fighter tokens: "You might like Alex
 * Pereira. Fits your taste for knockout artists and heavy hitters." The
 * forward-looking card that makes the list feel like the app is FOR the
 * user, not just about them.
 */
function fighterRecs(
  fighterTokens: TasteSignature['fighterTokens'],
  candidates: RecCandidate[],
  out: InsightCandidate[],
): void {
  if (candidates.length === 0) return;
  const loved = new Map<string, number>();
  for (const ft of fighterTokens) {
    if (ft.weight >= FIGHTER_MIN_WEIGHT && ft.fighterCount >= FIGHTER_MIN_DISTINCT) {
      loved.set(`${ft.dimension}|${ft.token}`, ft.weight);
    }
  }
  if (loved.size === 0) return;

  const scored = candidates
    .map((c) => {
      const matched: Array<{ dimension: string; token: string; weight: number }> = [];
      for (const t of c.styleArchetype) {
        const w = loved.get(`fighterStyle|${t}`);
        if (w != null) matched.push({ dimension: 'fighterStyle', token: t, weight: w });
      }
      for (const t of c.fighterAppeals) {
        const w = loved.get(`fighterAppeal|${t}`);
        if (w != null) matched.push({ dimension: 'fighterAppeal', token: t, weight: w });
      }
      if (c.personaType) {
        const w = loved.get(`fighterPersona|${c.personaType}`);
        if (w != null)
          matched.push({ dimension: 'fighterPersona', token: c.personaType, weight: w });
      }
      return { c, matched, total: matched.reduce((a, m) => a + m.weight, 0) };
    })
    .filter((r) => r.matched.length >= REC_MIN_MATCHES)
    // fighterId tiebreak keeps identical inputs byte-deterministic.
    .sort((a, b) => b.total - a.total || a.c.fighterId.localeCompare(b.c.fighterId))
    .slice(0, REC_MAX);

  for (const r of scored) {
    const top = [...r.matched].sort((a, b) => b.weight - a.weight);
    // Prefer two DIFFERENT dimensions in the copy ("knockout artists and
    // heavy hitters" beats two near-synonymous style tokens).
    const first = top[0];
    const second = top.find((m) => m.dimension !== first.dimension) ?? top[1];
    const recTokens = [first, second]
      .filter(Boolean)
      .map((m) => ({ dimension: m.dimension, token: m.token }));
    out.push({
      kind: 'fighter-rec',
      dimension: 'fighterRec',
      token: r.c.fighterId,
      direction: 'high',
      score: 0.35 + 0.15 * Math.min(1, r.total / REC_WEIGHT_NORM),
      stats: { n: r.matched.length, topFighters: [r.c.fullName], recTokens },
    });
  }
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
  if (t.presentShare > ALL_HIGH_MAX_PRESENT_SHARE) return;
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
