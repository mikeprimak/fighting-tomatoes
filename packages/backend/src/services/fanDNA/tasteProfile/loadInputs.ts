/**
 * Prisma loader for the taste-profile engine — READ-ONLY.
 *
 * Flattens each rated fight into the engine's vocab-agnostic `dims` bag:
 *   - plain DB dimensions that need no enrichment ever: method (bucketed),
 *     weightClass, gender, org, plus title/main-event flags
 *   - the post-fight character taxonomy (aiPostFightTags.character), when the
 *     fight has been enriched with it — scalars and multi-selects both
 * Community baseline per fight = the precomputed averageRating with the user's
 * own rating removed (same approach as the hype-accuracy endpoint).
 *
 * Fighter axis per the locked sourcing: fighters from the user's highly-rated
 * fights + hyped fights + follows, with archetype tokens read from aiProfile.
 * (Prod aiProfile rows predate styleArchetype/fighterAppeals; until the
 * fighter re-enrichment pass runs, most carry only personaType. The engine
 * degrades gracefully — thin fighter data just means fewer fighter insights.)
 */
import type { PrismaClient } from '@prisma/client';
import {
  HIGH_RATING,
  type FighterInput,
  type RatedFightInput,
} from './types';

/** Same canonical method bucketing as the method-affinity trait. */
export function bucketMethod(method: string | null): string | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (/decision|u-dec|s-dec|m-dec|^ud$|^md$|^sd$/.test(m)) return 'Decision';
  if (/submission|^sub\b|^sub\(/.test(m)) return 'Submission';
  if (/\bt?ko\b|ko\/tko/.test(m)) return 'Knockout';
  return null;
}

const HIGH_HYPE = 8;

export interface LoadedTasteInputs {
  fights: RatedFightInput[];
  fighters: FighterInput[];
  /** How many rated fights carry the character taxonomy (pilot coverage). */
  characterCoverage: { withCharacter: number; total: number };
}

export async function loadTasteInputs(
  prisma: PrismaClient,
  userId: string,
): Promise<LoadedTasteInputs> {
  const [ratings, predictions, follows] = await Promise.all([
    prisma.fightRating.findMany({
      where: { userId, fight: { fightStatus: 'COMPLETED' } },
      select: {
        rating: true,
        fight: {
          select: {
            id: true,
            method: true,
            weightClass: true,
            isTitle: true,
            orderOnCard: true,
            averageRating: true,
            totalRatings: true,
            aiPostFightTags: true,
            event: { select: { promotion: true } },
            fighter1: { select: { id: true, lastName: true, gender: true, aiProfile: true } },
            fighter2: { select: { id: true, lastName: true, gender: true, aiProfile: true } },
          },
        },
      },
    }),
    prisma.fightPrediction.findMany({
      where: { userId, predictedRating: { gte: HIGH_HYPE } },
      select: {
        fight: {
          select: {
            fighter1: { select: { id: true, lastName: true, gender: true, aiProfile: true } },
            fighter2: { select: { id: true, lastName: true, gender: true, aiProfile: true } },
          },
        },
      },
    }),
    prisma.userFighterFollow.findMany({
      where: { userId },
      select: {
        fighter: { select: { id: true, lastName: true, gender: true, aiProfile: true } },
      },
    }),
  ]);

  // ── fights ────────────────────────────────────────────────────────────────
  let withCharacter = 0;
  const fights: RatedFightInput[] = ratings.map((r) => {
    const f = r.fight;
    const dims: RatedFightInput['dims'] = {};

    const method = bucketMethod(f.method);
    if (method) dims.method = method;
    if (f.weightClass) dims.weightClass = f.weightClass;
    if (f.event?.promotion) dims.org = f.event.promotion;
    // A fight is a women's fight when its fighters are women; mixed never occurs.
    if (f.fighter1?.gender) dims.gender = f.fighter1.gender;
    if (f.isTitle) dims.titleFight = 'title';
    if (f.orderOnCard === 1) dims.cardSlot = 'main_event';

    const character = (f.aiPostFightTags as any)?.character;
    if (character && typeof character === 'object') {
      withCharacter++;
      for (const [key, val] of Object.entries(character)) {
        if (val == null || typeof val === 'boolean') continue;
        if (typeof val === 'string' || Array.isArray(val)) dims[key] = val as any;
      }
      if (character.highlightWorthy === true) dims.highlightWorthy = 'yes';
    }

    // Community average excluding the user (precomputed aggregate minus self).
    const n = f.totalRatings;
    const communityAvg =
      n > 1 ? (f.averageRating * n - r.rating) / (n - 1) : null;

    return {
      fightId: f.id,
      rating: r.rating,
      dims,
      communityAvg,
      communityN: Math.max(0, n - 1),
    };
  });

  // ── fighters ─────────────────────────────────────────────────────────────
  interface FighterRow {
    id: string;
    lastName: string;
    aiProfile: unknown;
  }
  const acc = new Map<
    string,
    { row: FighterRow; followed: boolean; highRatedCount: number; hypedCount: number; ratedCount: number }
  >();
  const touch = (row: FighterRow | null | undefined) => {
    if (!row) return null;
    let a = acc.get(row.id);
    if (!a) {
      a = { row, followed: false, highRatedCount: 0, hypedCount: 0, ratedCount: 0 };
      acc.set(row.id, a);
    }
    return a;
  };

  for (const r of ratings) {
    for (const side of [r.fight.fighter1, r.fight.fighter2]) {
      const a = touch(side as FighterRow);
      if (!a) continue;
      a.ratedCount++;
      if (r.rating >= HIGH_RATING) a.highRatedCount++;
    }
  }
  for (const p of predictions) {
    for (const side of [p.fight.fighter1, p.fight.fighter2]) {
      const a = touch(side as FighterRow);
      if (a) a.hypedCount++;
    }
  }
  for (const fol of follows) {
    const a = touch(fol.fighter as FighterRow);
    if (a) a.followed = true;
  }

  const fighters: FighterInput[] = [...acc.values()].map((a) => {
    const profile = (a.row.aiProfile ?? {}) as Record<string, unknown>;
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
    return {
      fighterId: a.row.id,
      name: a.row.lastName,
      styleArchetype: strArr(profile.styleArchetype),
      fighterAppeals: strArr(profile.fighterAppeals),
      personaType:
        typeof profile.personaType === 'string' && profile.personaType !== 'null'
          ? profile.personaType
          : null,
      followed: a.followed,
      highRatedCount: a.highRatedCount,
      hypedCount: a.hypedCount,
      ratedCount: a.ratedCount,
    };
  });

  return {
    fights,
    fighters,
    characterCoverage: { withCharacter, total: fights.length },
  };
}
