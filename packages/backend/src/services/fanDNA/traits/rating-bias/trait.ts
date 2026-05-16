/**
 * Trait: rating-bias
 *
 * Does the user rate higher or lower than the room? Two firing modes:
 *   • single-* — the just-submitted rating has a big delta vs community avg
 *                excluding self (the moment-of-action drama).
 *   • pattern-* — the user has a persistent tilt across history (uses the
 *                 batch-computed value); fires when the single-event delta is
 *                 small but the cumulative bias is meaningful.
 *
 * Floors: COMMUNITY_FLOOR=5 community ratings excluding self on this fight;
 *         HISTORY_FLOOR=5 prior rated fights with community floor met.
 *
 * Scoring: single-* wins (more interesting than a pattern restatement) when
 * the delta is large. hype-accuracy outranks both on fights the user hyped.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const COMMUNITY_FLOOR = 5;
const HISTORY_FLOOR = 5;
const SINGLE_DELTA_NOTABLE = 1.5;
const SINGLE_DELTA_BIG = 2.5;
const PATTERN_DELTA_THRESHOLD = 0.6;

const trait: Trait = {
  id: 'rating-bias',
  family: 'behaviour',
  tier: 1,
  version: 1,
  respondsTo: ['rate'] as const,
  surfaces: ['rate-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const ratings = await prisma.fightRating.findMany({
      where: { userId },
      select: {
        rating: true,
        fight: { select: { averageRating: true, totalRatings: true } },
      },
    });

    let n = 0;
    let deltaSum = 0;
    for (const r of ratings) {
      const { communityAvg, communityCount } = communityExcludingSelf(
        r.fight.averageRating,
        r.fight.totalRatings,
        r.rating,
      );
      if (communityCount < COMMUNITY_FLOOR) continue;
      n++;
      deltaSum += r.rating - communityAvg;
    }

    if (n === 0) {
      return { value: { n: 0, avgDelta: 0 }, confidence: 0, hasFloor: false };
    }
    const avgDelta = deltaSum / n;
    return {
      value: {
        n,
        avgDelta: round1(avgDelta),
      },
      confidence: Math.min(1, n / 50),
      hasFloor: n >= HISTORY_FLOOR,
    } satisfies TraitComputeResult;
  },

  async eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null> {
    if (ctx.action !== 'rate') return null;
    if (!ctx.fightId || ctx.value == null) return null;
    const userRating = ctx.value;

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

    const delta = userRating - communityAvg;
    const absDelta = Math.abs(delta);
    const community = round1(communityAvg);

    // Big-single-delta drama scores highest.
    if (absDelta >= SINGLE_DELTA_BIG) {
      return {
        copyKey: delta > 0 ? 'single-high' : 'single-low',
        score: 78,
        vars: {
          rating: userRating,
          community,
          delta: round1(absDelta),
        },
      };
    }
    if (absDelta >= SINGLE_DELTA_NOTABLE) {
      return {
        copyKey: delta > 0 ? 'single-high' : 'single-low',
        score: 65,
        vars: {
          rating: userRating,
          community,
          delta: round1(absDelta),
        },
      };
    }

    // No big single-event drama → check if the cumulative pattern is interesting.
    const cv = ctx.currentValue;
    if (cv && cv.hasFloor) {
      const avgDelta = (cv.value as { avgDelta?: number }).avgDelta ?? 0;
      if (avgDelta >= PATTERN_DELTA_THRESHOLD) {
        return {
          copyKey: 'pattern-leans-high',
          score: 55,
          vars: {
            avgDelta: round1(avgDelta),
            n: (cv.value as { n?: number }).n ?? 0,
          },
        };
      }
      if (avgDelta <= -PATTERN_DELTA_THRESHOLD) {
        return {
          copyKey: 'pattern-leans-low',
          score: 55,
          vars: {
            avgDelta: round1(Math.abs(avgDelta)),
            n: (cv.value as { n?: number }).n ?? 0,
          },
        };
      }
    }
    return null;
  },
};

export default trait;

function communityExcludingSelf(
  avg: number,
  total: number,
  userRating: number,
): { communityAvg: number; communityCount: number } {
  if (total <= 0) return { communityAvg: avg, communityCount: total };
  const sum = avg * total;
  const communityCount = total - 1;
  const communityAvg = communityCount > 0 ? (sum - userRating) / communityCount : 0;
  return { communityAvg, communityCount };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
