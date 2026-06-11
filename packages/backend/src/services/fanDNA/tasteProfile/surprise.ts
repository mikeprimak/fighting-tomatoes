/**
 * Surprise scoring — how the engine knows what's interesting.
 *
 * Four factors, multiplied (agreed with Mike 2026-06-11):
 *   1. Gap size  — how far the pattern sits from the user's own baseline
 *                  (or from the community, for compare insights).
 *   2. Evidence  — how many fights back it up. Hard floor, then saturating.
 *   3. Rarity    — the "everyone likes knockouts" filter, from priors.ts.
 *   4. Absolutes — "never" / "every" / "all of your 10s" get a flat boost.
 *
 * Anything under SCORE_FLOOR is never emitted: silence beats filler.
 * All thresholds live in types.ts and are deliberately reversible.
 */
import { commonness, rarityMultiplier } from './priors';
import {
  ABSOLUTE_BOOST,
  CMP_GAP_NORM,
  COMMUNITY_KIND_BOOST,
  EVIDENCE_SAT,
  FIGHTER_WEIGHT_SAT,
  GAP_NORM,
  MIN_N,
  type InsightDirection,
} from './types';

/** Saturating evidence factor: 0 below nothing, 1 at EVIDENCE_SAT fights. */
export function evidenceScore(n: number): number {
  return Math.min(1, n / EVIDENCE_SAT);
}

/** |delta| normalized against the self-contrast scale, capped at 1. */
export function gapScore(delta: number): number {
  return Math.min(1, Math.abs(delta) / GAP_NORM);
}

/** |delta| normalized against the (tighter) community scale, capped at 1. */
export function communityGapScore(delta: number): number {
  return Math.min(1, Math.abs(delta) / CMP_GAP_NORM);
}

/** The rarity factor for a (dimension, token, direction) preference. */
export function rarity(
  dimension: string,
  token: string,
  direction: InsightDirection,
): number {
  return rarityMultiplier(commonness(dimension, token, direction));
}

/** Self-contrast composite. Null when below the evidence floor. */
export function scoreSelfContrast(args: {
  dimension: string;
  token: string;
  n: number;
  delta: number;
}): { score: number; direction: InsightDirection } | null {
  if (args.n < MIN_N) return null;
  const direction: InsightDirection = args.delta >= 0 ? 'high' : 'low';
  const score =
    gapScore(args.delta) *
    evidenceScore(args.n) *
    rarity(args.dimension, args.token, direction);
  return { score, direction };
}

/** Community-compare composite. Null when below the evidence floor. */
export function scoreCommunityCompare(args: {
  dimension: string;
  token: string;
  cmpN: number;
  deltaVsCommunity: number;
}): { score: number; direction: InsightDirection } | null {
  if (args.cmpN < MIN_N) return null;
  const direction: InsightDirection =
    args.deltaVsCommunity >= 0 ? 'high' : 'low';
  const score =
    communityGapScore(args.deltaVsCommunity) *
    evidenceScore(args.cmpN) *
    rarity(args.dimension, args.token, direction) *
    COMMUNITY_KIND_BOOST;
  return { score, direction };
}

/**
 * Absolute-pattern composite. The pattern's strength is binary (it either
 * holds or it doesn't), so the score is evidence × rarity × boost on a fixed
 * base — extremity is already priced in by the boost.
 */
export function scoreAbsolute(args: {
  dimension: string;
  token: string;
  n: number;
  direction: InsightDirection;
}): number {
  const BASE = 0.55;
  return (
    BASE *
    evidenceScore(args.n) *
    rarity(args.dimension, args.token, args.direction) *
    ABSOLUTE_BOOST
  );
}

/** Fighter-axis composite: weight saturation × rarity on a fixed base. */
export function scoreFighterToken(args: {
  dimension: string;
  token: string;
  weight: number;
}): number {
  const BASE = 0.6;
  return (
    BASE *
    Math.min(1, args.weight / FIGHTER_WEIGHT_SAT) *
    rarity(args.dimension, args.token, 'high')
  );
}
