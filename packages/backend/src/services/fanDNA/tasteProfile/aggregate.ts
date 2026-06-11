/**
 * Aggregation: rated fights + fighter signals → TasteSignature.
 *
 * Vocab-agnostic on purpose: iterates whatever keys appear in each fight's
 * `dims` bag. A dimension added to the taxonomy next month flows through here
 * with zero changes. Pure functions, no I/O.
 */
import {
  CMP_PER_FIGHT_FLOOR,
  HIGH_RATING,
  HYPED_CONTRIB_CAP,
  TOP_RATING,
  W_FOLLOWED,
  W_HIGH_RATED,
  W_HYPED,
  type FighterInput,
  type FighterTokenStat,
  type RatedFightInput,
  type TasteSignature,
  type TokenStat,
} from './types';

/** Map key for one (dimension, token). "|" never appears in vocab tokens. */
function dimTokenKey(dimension: string, token: string): string {
  return `${dimension}|${token}`;
}

export function buildSignature(
  fights: RatedFightInput[],
  fighters: FighterInput[] = [],
): TasteSignature {
  return {
    baseline: computeBaseline(fights),
    tokens: aggregateFightTokens(fights),
    fighterTokens: aggregateFighterTokens(fighters),
  };
}

function computeBaseline(fights: RatedFightInput[]): TasteSignature['baseline'] {
  const n = fights.length;
  if (n === 0) return { count: 0, avg: 0, sd: 0, tensCount: 0 };
  const sum = fights.reduce((a, f) => a + f.rating, 0);
  const avg = sum / n;
  const variance =
    n > 1 ? fights.reduce((a, f) => a + (f.rating - avg) ** 2, 0) / (n - 1) : 0;
  return {
    count: n,
    avg,
    sd: Math.sqrt(variance),
    tensCount: fights.filter((f) => f.rating >= TOP_RATING).length,
  };
}

interface Accumulator {
  dimension: string;
  token: string;
  count: number;
  sum: number;
  max: number;
  min: number;
  highCount: number;
  tensCount: number;
  cmpN: number;
  cmpDeltaSum: number;
}

function aggregateFightTokens(fights: RatedFightInput[]): TokenStat[] {
  const acc = new Map<string, Accumulator>();
  const total = fights.length;

  for (const fight of fights) {
    const trustworthyCmp =
      fight.communityAvg != null &&
      (fight.communityN ?? 0) >= CMP_PER_FIGHT_FLOOR;

    for (const [dimension, raw] of Object.entries(fight.dims)) {
      if (raw == null) continue;
      const tokens = Array.isArray(raw) ? raw : [raw];
      // Dedupe within one fight so a malformed double-tag can't double-count.
      for (const token of new Set(tokens)) {
        if (typeof token !== 'string' || token.trim() === '') continue;
        const key = dimTokenKey(dimension, token);
        let a = acc.get(key);
        if (!a) {
          a = {
            dimension,
            token,
            count: 0,
            sum: 0,
            max: -Infinity,
            min: Infinity,
            highCount: 0,
            tensCount: 0,
            cmpN: 0,
            cmpDeltaSum: 0,
          };
          acc.set(key, a);
        }
        a.count++;
        a.sum += fight.rating;
        a.max = Math.max(a.max, fight.rating);
        a.min = Math.min(a.min, fight.rating);
        if (fight.rating >= HIGH_RATING) a.highCount++;
        if (fight.rating >= TOP_RATING) a.tensCount++;
        if (trustworthyCmp) {
          a.cmpN++;
          a.cmpDeltaSum += fight.rating - (fight.communityAvg as number);
        }
      }
    }
  }

  return [...acc.values()].map((a) => ({
    dimension: a.dimension,
    token: a.token,
    count: a.count,
    avgRating: a.sum / a.count,
    maxRating: a.max,
    minRating: a.min,
    highCount: a.highCount,
    tensCount: a.tensCount,
    presentShare: total > 0 ? a.count / total : 0,
    cmpN: a.cmpN,
    avgDeltaVsCommunity: a.cmpN > 0 ? a.cmpDeltaSum / a.cmpN : null,
  }));
}

/**
 * Fighter axis. Locked sourcing decision (identity-platform.md 2026-06-09):
 * aggregate over fighters in the user's highly-rated fights + hyped + followed,
 * with follows + high ratings weighted most. A fan who never follows anyone but
 * rates every Gaethje war a 9 still reads as drawn to pressure fighters.
 */
function aggregateFighterTokens(fighters: FighterInput[]): FighterTokenStat[] {
  interface FAcc {
    dimension: FighterTokenStat['dimension'];
    token: string;
    weight: number;
    contributors: Array<{ name: string; weight: number }>;
  }
  const acc = new Map<string, FAcc>();

  for (const fighter of fighters) {
    const weight =
      (fighter.followed ? W_FOLLOWED : 0) +
      (fighter.highRatedCount ?? 0) * W_HIGH_RATED +
      Math.min(fighter.hypedCount ?? 0, HYPED_CONTRIB_CAP) * W_HYPED;
    if (weight <= 0) continue;

    const entries: Array<[FighterTokenStat['dimension'], string]> = [
      ...fighter.styleArchetype.map(
        (t): [FighterTokenStat['dimension'], string] => ['fighterStyle', t],
      ),
      ...fighter.fighterAppeals.map(
        (t): [FighterTokenStat['dimension'], string] => ['fighterAppeal', t],
      ),
    ];
    if (fighter.personaType) entries.push(['fighterPersona', fighter.personaType]);

    // Dedupe within one fighter so a token listed twice can't double-count.
    const seen = new Set<string>();
    for (const [dimension, token] of entries) {
      if (typeof token !== 'string' || token.trim() === '') continue;
      const key = dimTokenKey(dimension, token);
      if (seen.has(key)) continue;
      seen.add(key);
      let a = acc.get(key);
      if (!a) {
        a = { dimension, token, weight: 0, contributors: [] };
        acc.set(key, a);
      }
      a.weight += weight;
      a.contributors.push({ name: fighter.name, weight });
    }
  }

  return [...acc.values()].map((a) => ({
    dimension: a.dimension,
    token: a.token,
    weight: a.weight,
    fighterCount: a.contributors.length,
    topFighters: a.contributors
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 2)
      .map((c) => c.name),
  }));
}
