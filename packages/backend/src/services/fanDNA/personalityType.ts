/**
 * Fan DNA — personality "type" aggregator.
 *
 * Synthesizes one identity label per user from the batch-computed TraitValue
 * rows. Lives OUTSIDE the trait registry: traits are independent signals,
 * personality type is the cross-trait summary. Keeping it separate preserves
 * the engine invariants (trait independence, pluggability).
 *
 * Returns at most one type. If the user's data doesn't satisfy any rule's
 * floor, returns null — the profile hero card stays hidden.
 */
import type { PrismaClient } from '@prisma/client';

export interface UserPersonalityType {
  /** Stable identifier — used for analytics + future "type history" features. */
  id: string;
  /** Short label shown as the hero headline. e.g. "Hot Take Artist". */
  label: string;
  /** One-sentence description shown under the label. Interpolated with stats. */
  body: string;
  /** Optional callout stat — large number/percent on the hero card. */
  primaryStat?: string;
  /** Optional small label under the primary stat. */
  secondaryStat?: string;
}

/** Trait value shapes we read. Mirrors the persisted `TraitValue.value` JSON. */
interface OrgAffinityValue {
  ratingDominant?: string | null;
  ratingDominantPct?: number;
  ratingTotal?: number;
  ratingTotals?: Record<string, number>;
  hypeDominant?: string | null;
  hypeDominantPct?: number;
  hypeTotal?: number;
  hypeTotals?: Record<string, number>;
}
interface RatingBiasValue {
  n?: number;
  avgDelta?: number;
}
interface HypeBiasValue {
  n?: number;
  avgDelta?: number;
}
interface HypeAccuracyValue {
  totalHypedFights?: number;
  accurateCount?: number;
  hotTakeCount?: number;
  accuracyPct?: number;
  avgDelta?: number;
}
interface TrailblazerValue {
  firstRateCount?: number;
  firstHypeCount?: number;
  total?: number;
}

interface TraitInputs {
  orgAffinity: OrgAffinityValue | null;
  ratingBias: RatingBiasValue | null;
  hypeBias: HypeBiasValue | null;
  hypeAccuracy: HypeAccuracyValue | null;
  trailblazer: TrailblazerValue | null;
}

/**
 * Rule contract. Each rule looks at the trait inputs and returns either a
 * complete personality type, or null if its conditions aren't met. The first
 * non-null rule (in priority order) wins.
 */
type PersonalityRule = (t: TraitInputs) => UserPersonalityType | null;

const HOT_TAKE_THRESHOLD = 3;
const HOT_TAKE_MIN_HYPED = 10;
// Trailblazer is gated on first-HYPE counts only. Hypes happen pre-fight and
// can't be bulk-migrated the way legacy ratings were, so firstHypeCount is a
// truthful "you saw it coming before anyone else" signal. firstRateCount is
// inflated for legacy users (per memory: dataset aggregates dishonest).
const TRAILBLAZER_HYPE_THRESHOLD = 5;
const ORACLE_ACCURACY_PCT = 60;
const ORACLE_MIN_FIGHTS = 15;
const BIAS_HISTORY_MIN = 15;
const BIAS_NOTABLE_DELTA = 0.7;
const ORG_DOMINANT_PCT = 60;
const ORG_GLOBETROTTER_MIN_ORGS = 4;
const CALIBRATOR_MAX_BIAS = 0.3;

/**
 * Priority-ordered rules. First match wins. Order encodes "specificity":
 * rare/dramatic identities (Hot Take Artist, Trailblazer) win over broad
 * descriptors (Calibrator, Mainstay).
 */
const RULES: PersonalityRule[] = [
  // 1. Hot Take Artist — contrarian-right hypes, the rarest identity.
  (t) => {
    const n = t.hypeAccuracy?.hotTakeCount ?? 0;
    const hyped = t.hypeAccuracy?.totalHypedFights ?? 0;
    if (n < HOT_TAKE_THRESHOLD || hyped < HOT_TAKE_MIN_HYPED) return null;
    return {
      id: 'hot-take-artist',
      label: 'Hot Take Artist',
      body: `You've made ${n} contrarian calls and been right. The room came around.`,
      primaryStat: String(n),
      secondaryStat: 'hot takes',
    };
  },

  // 2. Trailblazer — first-to-hype identity. Hype-first only (see threshold note).
  (t) => {
    const hypes = t.trailblazer?.firstHypeCount ?? 0;
    if (hypes < TRAILBLAZER_HYPE_THRESHOLD) return null;
    return {
      id: 'trailblazer',
      label: 'Trailblazer',
      body: `You've been the first to hype ${hypes} fights. Most fans wait — you set the line.`,
      primaryStat: String(hypes),
      secondaryStat: 'first hypes',
    };
  },

  // 3. The Oracle — hype accuracy with real volume.
  (t) => {
    const pct = t.hypeAccuracy?.accuracyPct ?? 0;
    const n = t.hypeAccuracy?.totalHypedFights ?? 0;
    if (pct < ORACLE_ACCURACY_PCT || n < ORACLE_MIN_FIGHTS) return null;
    return {
      id: 'oracle',
      label: 'The Oracle',
      body: `${pct}% of your hyped fights end up about as exciting as you called. The room catches up.`,
      primaryStat: `${pct}%`,
      secondaryStat: 'accuracy',
    };
  },

  // 4. The Skeptic — rates consistently lower than community.
  (t) => {
    const n = t.ratingBias?.n ?? 0;
    const delta = t.ratingBias?.avgDelta ?? 0;
    if (n < BIAS_HISTORY_MIN || delta > -BIAS_NOTABLE_DELTA) return null;
    const abs = Math.abs(delta).toFixed(1);
    return {
      id: 'skeptic',
      label: 'The Skeptic',
      body: `Across ${n} fights, you rate ${abs} points lower than the average user. High bar.`,
      primaryStat: `−${abs}`,
      secondaryStat: 'vs average',
    };
  },

  // 5. The Generous Critic — rates consistently higher than community.
  (t) => {
    const n = t.ratingBias?.n ?? 0;
    const delta = t.ratingBias?.avgDelta ?? 0;
    if (n < BIAS_HISTORY_MIN || delta < BIAS_NOTABLE_DELTA) return null;
    const abs = delta.toFixed(1);
    return {
      id: 'generous-critic',
      label: 'The Generous Critic',
      body: `Across ${n} fights, you rate ${abs} points higher than the average user. You find what works.`,
      primaryStat: `+${abs}`,
      secondaryStat: 'vs average',
    };
  },

  // 6. The Hype Believer — hypes higher than community.
  (t) => {
    const n = t.hypeBias?.n ?? 0;
    const delta = t.hypeBias?.avgDelta ?? 0;
    if (n < BIAS_HISTORY_MIN || delta < BIAS_NOTABLE_DELTA) return null;
    const abs = delta.toFixed(1);
    return {
      id: 'hype-believer',
      label: 'The Hype Believer',
      body: `Across ${n} hyped fights, you hype ${abs} points higher than the room. You see the upside.`,
      primaryStat: `+${abs}`,
      secondaryStat: 'vs average',
    };
  },

  // 7. The Doubter — hypes lower than community (mirror of Hype Believer).
  (t) => {
    const n = t.hypeBias?.n ?? 0;
    const delta = t.hypeBias?.avgDelta ?? 0;
    if (n < BIAS_HISTORY_MIN || delta > -BIAS_NOTABLE_DELTA) return null;
    const abs = Math.abs(delta).toFixed(1);
    return {
      id: 'doubter',
      label: 'The Doubter',
      body: `Across ${n} hyped fights, you hype ${abs} points lower than the room. You wait to be convinced.`,
      primaryStat: `−${abs}`,
      secondaryStat: 'vs average',
    };
  },

  // 8. Loyalist — non-UFC promotion dominates the user's ratings.
  (t) => {
    const dom = t.orgAffinity?.ratingDominant;
    const pct = t.orgAffinity?.ratingDominantPct ?? 0;
    const total = t.orgAffinity?.ratingTotal ?? 0;
    if (!dom || dom.toUpperCase() === 'UFC') return null;
    if (pct < ORG_DOMINANT_PCT || total < BIAS_HISTORY_MIN) return null;
    const pretty = prettyOrg(dom);
    return {
      id: 'loyalist',
      label: `${pretty} Loyalist`,
      body: `${pct}% of your ratings are on ${pretty} fights. You stay where you stay.`,
      primaryStat: `${pct}%`,
      secondaryStat: pretty,
    };
  },

  // 9. UFC Mainstay — UFC dominates the user's ratings.
  (t) => {
    const dom = t.orgAffinity?.ratingDominant;
    const pct = t.orgAffinity?.ratingDominantPct ?? 0;
    const total = t.orgAffinity?.ratingTotal ?? 0;
    if (!dom || dom.toUpperCase() !== 'UFC') return null;
    if (pct < ORG_DOMINANT_PCT || total < BIAS_HISTORY_MIN) return null;
    return {
      id: 'ufc-mainstay',
      label: 'UFC Mainstay',
      body: `${pct}% of your ratings are UFC. Familiar ground — you know the game.`,
      primaryStat: `${pct}%`,
      secondaryStat: 'UFC',
    };
  },

  // 10. Globetrotter — diverse org coverage, no SINGLE dominant share (<60%).
  // org-affinity sets `ratingDominant` once any org passes 40%, but a 40-59%
  // share isn't really dominant for type-naming purposes — those users are
  // diversified. Gate on dominantPct instead of the raw `ratingDominant` flag.
  (t) => {
    const orgs = Object.keys(t.orgAffinity?.ratingTotals ?? {}).length;
    const total = t.orgAffinity?.ratingTotal ?? 0;
    const dominantPct = t.orgAffinity?.ratingDominantPct ?? 0;
    if (orgs < ORG_GLOBETROTTER_MIN_ORGS || total < BIAS_HISTORY_MIN) return null;
    if (dominantPct >= ORG_DOMINANT_PCT) return null;
    return {
      id: 'globetrotter',
      label: 'The Globetrotter',
      body: `You've rated fights across ${orgs} promotions. Org-agnostic — you go where the fight is.`,
      primaryStat: String(orgs),
      secondaryStat: 'promotions',
    };
  },

  // 11. The Calibrator — both biases near zero, real sample sizes.
  (t) => {
    const rN = t.ratingBias?.n ?? 0;
    const rDelta = Math.abs(t.ratingBias?.avgDelta ?? 0);
    const hN = t.hypeBias?.n ?? 0;
    const hDelta = Math.abs(t.hypeBias?.avgDelta ?? 0);
    if (rN < BIAS_HISTORY_MIN || hN < BIAS_HISTORY_MIN) return null;
    if (rDelta > CALIBRATOR_MAX_BIAS || hDelta > CALIBRATOR_MAX_BIAS) return null;
    return {
      id: 'calibrator',
      label: 'The Calibrator',
      body: `Your ratings and your hypes both land right where the community lands. A reliable read.`,
      primaryStat: `±${Math.max(rDelta, hDelta).toFixed(1)}`,
      secondaryStat: 'tightest gap',
    };
  },
];

/**
 * Read all five batch-trait TraitValue rows for the user, walk the rules,
 * return the first match. Caller is responsible for ensuring TraitValue rows
 * are fresh — typically by calling this after the same staleness pass that
 * `/profile` does.
 */
export async function computeUserType(
  prisma: PrismaClient,
  userId: string,
): Promise<UserPersonalityType | null> {
  const rows = await prisma.traitValue.findMany({
    where: {
      userId,
      traitId: {
        in: [
          'org-affinity',
          'rating-bias',
          'hype-bias',
          'hype-accuracy',
          'trailblazer',
        ],
      },
    },
    select: { traitId: true, value: true, hasFloor: true },
  });

  const byId = new Map(rows.map((r) => [r.traitId, r]));
  const get = <T>(id: string): T | null => {
    const row = byId.get(id);
    if (!row || !row.hasFloor) return null;
    return row.value as T;
  };

  const inputs: TraitInputs = {
    orgAffinity: get<OrgAffinityValue>('org-affinity'),
    ratingBias: get<RatingBiasValue>('rating-bias'),
    hypeBias: get<HypeBiasValue>('hype-bias'),
    hypeAccuracy: get<HypeAccuracyValue>('hype-accuracy'),
    trailblazer: get<TrailblazerValue>('trailblazer'),
  };

  for (const rule of RULES) {
    const match = rule(inputs);
    if (match) return match;
  }
  return null;
}

function prettyOrg(raw: string): string {
  const upper = raw.toUpperCase();
  if (upper === 'UFC') return 'UFC';
  if (upper === 'PFL') return 'PFL';
  if (upper === 'ONE') return 'ONE';
  if (upper.includes('BKFC')) return 'BKFC';
  if (upper.includes('RIZIN')) return 'RIZIN';
  if (upper.includes('KARATE')) return 'Karate Combat';
  if (upper.includes('DIRTY BOXING')) return 'Dirty Boxing';
  if (upper.includes('OKTAGON')) return 'Oktagon';
  if (upper.includes('MATCHROOM')) return 'Matchroom';
  if (upper.includes('TOP RANK')) return 'Top Rank';
  if (upper.includes('GOLDEN BOY')) return 'Golden Boy';
  if (upper.includes('MOST VALUABLE') || upper === 'MVP') return 'MVP';
  if (upper.includes('ZUFFA')) return 'Zuffa Boxing';
  return raw;
}
