/**
 * Taste-profile engine — type contract.
 *
 * The engine is PURE: it takes pre-loaded user data (rated fights with their
 * tag dimensions, fighters with their archetype tokens) and returns a taste
 * signature + ranked, rendered insights. No prisma, no clock, no I/O — so it
 * is fully testable with synthetic data before the dev DB exists (Phase 1
 * working model, identity-platform.md).
 *
 * Vocab-agnostic by design (locked 2026-06-11): the engine iterates whatever
 * dimensions appear in `dims`, so adding a new taxonomy dimension later needs
 * ZERO engine rework. The loader (built at pilot time) flattens
 * `aiPostFightTags.character` + plain DB columns (method, weightClass, gender,
 * org) into the same bag — tags and DB facts are deliberately the same shape.
 */

/** One rated fight, flattened to (dimension → token(s)) plus community context. */
export interface RatedFightInput {
  fightId: string;
  /** The user's 1-10 rating. */
  rating: number;
  /** The user's pre-fight hype on this fight, if any. */
  hype?: number | null;
  /**
   * Every taste dimension this fight carries: taxonomy scalars ("actionLevel"
   * → "war"), taxonomy multi-selects ("appeals" → ["comeback", "violence"]),
   * and plain DB dimensions ("method" → "Knockout", "gender" → "FEMALE").
   * null/undefined/empty values are skipped.
   */
  dims: Record<string, string | string[] | null | undefined>;
  /** Community average rating on this fight EXCLUDING the user. */
  communityAvg?: number | null;
  /** Sample size behind communityAvg. Below the floor it is ignored. */
  communityN?: number;
}

/** One fighter the user has signal on (rated their fights / hyped / followed). */
export interface FighterInput {
  fighterId: string;
  /** Display name for copy, e.g. "Gaethje". */
  name: string;
  /** Controlled tokens from aiProfile.styleArchetype. */
  styleArchetype: string[];
  /** Controlled tokens from aiProfile.fighterAppeals. */
  fighterAppeals: string[];
  /** Controlled token from aiProfile.personaType (fan-favorite, heel, ...). */
  personaType?: string | null;
  /** True when the user follows this fighter. */
  followed?: boolean;
  /** Count of this fighter's fights the user rated >= the high-rating bar. */
  highRatedCount?: number;
  /** Count of this fighter's fights the user hyped >= the high-hype bar. */
  hypedCount?: number;
  /** Total user ratings on this fighter's fights. */
  ratedCount?: number;
}

/** Aggregated stats for one (dimension, token) across the user's ratings. */
export interface TokenStat {
  dimension: string;
  token: string;
  /** Fights the user rated that carry this token. */
  count: number;
  avgRating: number;
  maxRating: number;
  minRating: number;
  /** Ratings >= HIGH_RATING (8). */
  highCount: number;
  /** Count of the user's top-score (10) ratings carrying this token. */
  tensCount: number;
  /** count / total rated fights — triviality guard for absolutes. */
  presentShare: number;
  /** Fights with a trustworthy community average (communityN >= floor). */
  cmpN: number;
  /** mean(user rating − community avg) over those fights. null if cmpN = 0. */
  avgDeltaVsCommunity: number | null;
}

/** Aggregated stats for one fighter-axis token (archetype/appeal/persona). */
export interface FighterTokenStat {
  dimension: 'fighterStyle' | 'fighterAppeal' | 'fighterPersona';
  token: string;
  /** Summed source-weighted signal (follows + high ratings weighted most). */
  weight: number;
  /** Distinct fighters contributing. */
  fighterCount: number;
  /** Top contributing fighter names, for copy specificity. */
  topFighters: string[];
}

export interface TasteSignature {
  baseline: {
    /** Total rated fights fed in. */
    count: number;
    /** The user's overall average rating. */
    avg: number;
    /** Std-dev of their ratings (0 when count < 2). */
    sd: number;
    /** Count of top-score (10) ratings. */
    tensCount: number;
  };
  tokens: TokenStat[];
  fighterTokens: FighterTokenStat[];
}

/** Every way the engine knows how to be interesting. */
export type InsightKind =
  | 'loves'            // self-contrast, positive: rates token above own baseline
  | 'cold'             // self-contrast, negative
  | 'community-high'   // rates token above the community on the same fights
  | 'community-low'
  | 'never-above'      // absolute: n ratings on token, never above a cap
  | 'all-high'         // absolute: every rating on token was >= 8
  | 'all-tens-share'   // absolute: every 10 the user gave carries this token
  | 'fighter-style'    // drawn to a styleArchetype token
  | 'fighter-appeal'   // drawn to a fighterAppeals token
  | 'fighter-persona'; // drawn to a personaType

export type InsightDirection = 'high' | 'low';

/** An unrendered scoring candidate. */
export interface InsightCandidate {
  kind: InsightKind;
  dimension: string;
  token: string;
  direction: InsightDirection;
  /** Final composite score (gap × evidence × rarity × bonuses). */
  score: number;
  /** Raw numbers for the subline + debugging/pilot review. */
  stats: {
    n: number;
    avg?: number;
    baseline?: number;
    delta?: number;
    deltaVsCommunity?: number;
    cap?: number;
    tens?: number;
    weight?: number;
    fighterCount?: number;
    topFighters?: string[];
  };
}

/** A rendered, ranked insight ready for any surface. */
export interface RankedInsight extends InsightCandidate {
  /** Stable identity for cooldown ledgers: kind|dimension|token|direction. */
  key: string;
  /** Human, non-statistical headline ("You love wars"). */
  headline: string;
  /** The number lives here, small ("9.1 average across 23, vs your usual 7.2"). */
  subline: string;
}

export interface TasteProfileInput {
  userId: string;
  fights: RatedFightInput[];
  fighters?: FighterInput[];
  /**
   * Optional extra seed (e.g. ISO week) so copy phrasing rotates over time
   * while staying deterministic within a period. Engine never reads a clock.
   */
  rotationSalt?: string;
  /** Max insights returned after ranking (default 12). */
  maxInsights?: number;
}

export interface TasteProfileResult {
  signature: TasteSignature;
  insights: RankedInsight[];
}

// ── Tunables (deliberately reversible — refine freely from pilot outputs) ──

/** Minimum fights on a token before self/community insights are considered. */
export const MIN_N = 8;
/** Evidence saturates here: n/EVIDENCE_SAT capped at 1. */
export const EVIDENCE_SAT = 25;
/** Self-contrast gap normalizer: |delta| / GAP_NORM capped at 1. */
export const GAP_NORM = 2.0;
/** Community gap normalizer (community deltas run tighter than self deltas). */
export const CMP_GAP_NORM = 1.5;
/** Per-fight community sample floor before its avg counts as trustworthy. */
export const CMP_PER_FIGHT_FLOOR = 5;
/** A rating at/above this is "high" (drives all-high + fighter sourcing). */
export const HIGH_RATING = 8;
/** Top score for the all-tens-share absolute. */
export const TOP_RATING = 10;
/** Candidates below this composite score are never emitted. Silence > filler. */
export const SCORE_FLOOR = 0.25;
/** Community-compare beats self-contrast on the same token when both qualify. */
export const COMMUNITY_KIND_BOOST = 1.15;
/** Absolutes ("never", "every", "all of your 10s") are inherently striking. */
export const ABSOLUTE_BOOST = 1.3;
/** Fighter-axis floors. */
export const FIGHTER_MIN_DISTINCT = 3;
export const FIGHTER_MIN_WEIGHT = 6;
export const FIGHTER_WEIGHT_SAT = 15;
/** Fighter source weights — follows + high ratings weighted most (locked). */
export const W_FOLLOWED = 3;
export const W_HIGH_RATED = 1.5;
export const W_HYPED = 1.0;
/** Cap on how much hype volume alone can contribute per fighter. */
export const HYPED_CONTRIB_CAP = 5;
