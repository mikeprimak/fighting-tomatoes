/**
 * Trait: hype-bias
 *
 * Hype-side mirror of rating-bias. Does the user hype higher or lower than
 * the room? Two firing modes:
 *   • single-* — the just-submitted hype has a meaningful delta vs community
 *                avg excluding self (the moment-of-action drama).
 *   • pattern-* — the user has a persistent tilt in their hype across history
 *                (uses the batch-computed value); fires when the single-event
 *                delta is small but the cumulative bias is meaningful.
 *   • agreement — single-event delta is essentially zero AND there are enough
 *                 community hypes to make agreement notable. Light copy.
 *
 * Floors: COMMUNITY_FLOOR=5 other community hypes on this fight;
 *         HISTORY_FLOOR=5 prior hyped fights with community floor met.
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
const AGREEMENT_DELTA = 0.5;
const PATTERN_DELTA_THRESHOLD = 0.6;

const trait: Trait = {
  id: 'hype-bias',
  family: 'behaviour',
  tier: 1,
  version: 1,
  respondsTo: ['hype'] as const,
  surfaces: ['hype-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    const hypes = await prisma.fightPrediction.findMany({
      where: { userId, predictedRating: { not: null } },
      select: {
        predictedRating: true,
        fightId: true,
      },
    });

    if (hypes.length === 0) {
      return { value: { n: 0, avgDelta: 0 }, confidence: 0, hasFloor: false };
    }

    // For each hyped fight, compute community avg hype excluding self.
    const fightIds = hypes.map((h) => h.fightId);
    const communityAggs = await prisma.fightPrediction.groupBy({
      by: ['fightId'],
      where: {
        fightId: { in: fightIds },
        userId: { not: userId },
        predictedRating: { not: null },
      },
      _avg: { predictedRating: true },
      _count: { _all: true },
    });

    const byFight = new Map<string, { avg: number; count: number }>();
    for (const row of communityAggs) {
      byFight.set(row.fightId, {
        avg: row._avg.predictedRating ?? 0,
        count: row._count._all,
      });
    }

    let n = 0;
    let deltaSum = 0;
    for (const h of hypes) {
      if (h.predictedRating == null) continue;
      const community = byFight.get(h.fightId);
      if (!community || community.count < COMMUNITY_FLOOR) continue;
      n++;
      deltaSum += h.predictedRating - community.avg;
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
    if (ctx.action !== 'hype') return null;
    if (!ctx.fightId || ctx.value == null) return null;
    const userHype = ctx.value;

    // Community avg hype excluding this user, computed live from prediction rows.
    const agg = await ctx.prisma.fightPrediction.aggregate({
      where: {
        fightId: ctx.fightId,
        userId: { not: ctx.userId },
        predictedRating: { not: null },
      },
      _avg: { predictedRating: true },
      _count: { _all: true },
    });

    const communityCount = agg._count._all;
    const communityAvgRaw = agg._avg.predictedRating ?? 0;
    if (communityCount < COMMUNITY_FLOOR) return null;

    const delta = userHype - communityAvgRaw;
    const absDelta = Math.abs(delta);
    const community = round1(communityAvgRaw);

    // Big-single-delta drama scores highest.
    if (absDelta >= SINGLE_DELTA_BIG) {
      return {
        copyKey: delta > 0 ? 'single-high' : 'single-low',
        score: 78,
        vars: {
          hype: userHype,
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
          hype: userHype,
          community,
          delta: round1(absDelta),
        },
      };
    }

    // Tight agreement → mild but warm acknowledgement.
    if (absDelta <= AGREEMENT_DELTA) {
      return {
        copyKey: 'agreement',
        score: 40,
        vars: {
          hype: userHype,
          community,
        },
      };
    }

    // Small-but-not-tiny delta → fall back to the cumulative pattern if interesting.
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
