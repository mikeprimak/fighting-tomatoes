/**
 * Trait: hype-accuracy
 *
 * The closure-loop trait. When the user rates a fight they previously hyped,
 * compute the delta vs the community average (excluding self) and surface a
 * Worms-tone observation. Mirrors the math in
 * `GET /api/auth/profile/hype-accuracy` (auth.fastify.ts).
 *
 * Score weighting: closure moments score higher than generic observations.
 * Hot takes score highest — the user just nailed an extreme call.
 *
 * Floor: at least 5 community ratings (excluding the user) on the fight.
 *   Trait-level floor (batchCompute hasFloor): at least 3 fights with usable
 *   closure data over the user's history.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const COMMUNITY_FLOOR = 5;
const HISTORY_FLOOR = 3;

const trait: Trait = {
  id: 'hype-accuracy',
  family: 'prediction',
  tier: 1,
  version: 1,
  respondsTo: ['rate'] as const,
  surfaces: ['rate-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const predictions = await prisma.fightPrediction.findMany({
      where: {
        userId,
        predictedRating: { not: null },
        fight: { winner: { not: null } },
      },
      select: {
        predictedRating: true,
        fight: {
          select: {
            averageRating: true,
            totalRatings: true,
            ratings: {
              where: { userId },
              select: { rating: true },
              take: 1,
            },
          },
        },
      },
    });

    let totalHypedFights = 0;
    let accurateCount = 0;
    let hotTakeCount = 0;
    let deltaSum = 0;

    for (const p of predictions) {
      const userHype = p.predictedRating;
      if (userHype == null) continue;

      const fight = p.fight;
      const userRating = fight.ratings[0]?.rating ?? null;
      const { communityAvg, communityCount } = communityExcludingSelf(
        fight.averageRating,
        fight.totalRatings,
        userRating,
      );
      if (communityCount < COMMUNITY_FLOOR) continue;

      const delta = Math.abs(userHype - communityAvg);
      totalHypedFights++;
      deltaSum += delta;

      if (delta < 2) accurateCount++;
      const isExtreme = userHype >= 8 || userHype <= 3;
      if (isExtreme && delta < 1.5) hotTakeCount++;
    }

    const accuracyPct =
      totalHypedFights > 0
        ? Math.round((accurateCount / totalHypedFights) * 100)
        : 0;
    const avgDelta =
      totalHypedFights > 0
        ? Math.round((deltaSum / totalHypedFights) * 10) / 10
        : 0;

    const hasFloor = totalHypedFights >= HISTORY_FLOOR;
    const confidence = Math.min(1, totalHypedFights / 20);

    return {
      value: {
        totalHypedFights,
        accurateCount,
        hotTakeCount,
        accuracyPct,
        avgDelta,
      },
      confidence,
      hasFloor,
    } satisfies TraitComputeResult;
  },

  async eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null> {
    if (ctx.action !== 'rate') return null;
    if (!ctx.fightId || ctx.value == null) return null;
    const userRating = ctx.value;

    const prediction = await ctx.prisma.fightPrediction.findFirst({
      where: {
        userId: ctx.userId,
        fightId: ctx.fightId,
        predictedRating: { not: null },
      },
      select: { predictedRating: true },
    });
    if (!prediction || prediction.predictedRating == null) return null;
    const userHype = prediction.predictedRating;

    const fight = await ctx.prisma.fight.findUnique({
      where: { id: ctx.fightId },
      select: { averageRating: true, totalRatings: true },
    });
    if (!fight) return null;

    const { communityAvg, communityCount } = communityExcludingSelf(
      fight.averageRating,
      fight.totalRatings,
      userRating,
    );
    if (communityCount < COMMUNITY_FLOOR) return null;

    const delta = Math.abs(userHype - communityAvg);
    const isExtreme = userHype >= 8 || userHype <= 3;
    const isHotTake = isExtreme && delta < 1.5;

    const vars = {
      hype: userHype,
      rating: userRating,
      community: round1(communityAvg),
      delta: round1(delta),
    };

    if (isHotTake) {
      return { copyKey: 'closure-hot-take', score: 95, vars };
    }
    if (delta < 1) {
      return { copyKey: 'closure-spot-on', score: 80, vars };
    }
    if (delta < 2) {
      return { copyKey: 'closure-close', score: 70, vars };
    }
    if (delta >= 3) {
      return { copyKey: 'closure-way-off', score: 75, vars };
    }
    return { copyKey: 'closure-off', score: 60, vars };
  },
};

export default trait;

function communityExcludingSelf(
  avg: number,
  total: number,
  userRating: number | null,
): { communityAvg: number; communityCount: number } {
  if (userRating == null || total <= 0) {
    return { communityAvg: avg, communityCount: total };
  }
  const sum = avg * total;
  const communityCount = total - 1;
  const communityAvg = communityCount > 0 ? (sum - userRating) / communityCount : 0;
  return { communityAvg, communityCount };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
