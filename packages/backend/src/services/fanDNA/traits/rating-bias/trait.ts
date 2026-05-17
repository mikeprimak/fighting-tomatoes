/**
 * Trait: rating-bias
 *
 * The PRIMARY trait on the rate path: every rating gets a line comparing the
 * user's just-submitted rating to the community average (excluding self).
 *
 * Single-event firing tiers, in order of drama:
 *   • single-* (big)    — |delta| >= 2.5  → score 88
 *   • single-* (notable)— |delta| >= 1.5  → score 80
 *   • single-mild-*     — 0.5 <  |delta| < 1.5 → score 72
 *   • single-agreement  — |delta| <= 0.5 → score 72
 *
 * Floor: COMMUNITY_FLOOR=5 community ratings excluding self on this fight.
 * Below that, the trait stays silent and the engine returns null (no message).
 *
 * Scoring sits above hype-accuracy's close/spot-on/off cases so the natural
 * rating-vs-room comparison wins by default. hype-accuracy still wins on
 * hot-takes and way-off — those are the actually-dramatic closure moments.
 *
 * Pattern-leans-* copy is retained in copy.ts for future surface use (profile,
 * weekly recap) but is no longer surfaced on the rate-reveal modal — the
 * single-event path always fires now, so the pattern path was unreachable.
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
const AGREEMENT_DELTA = 0.5;
const SINGLE_DELTA_NOTABLE = 1.5;
const SINGLE_DELTA_BIG = 2.5;

const trait: Trait = {
  id: 'rating-bias',
  family: 'behaviour',
  tier: 1,
  version: 2,
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
        score: 88,
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
        score: 80,
        vars: {
          rating: userRating,
          community,
          delta: round1(absDelta),
        },
      };
    }

    // Tight agreement with the room — warm consensus line.
    if (absDelta <= AGREEMENT_DELTA) {
      return {
        copyKey: 'single-agreement',
        score: 72,
        vars: {
          rating: userRating,
          community,
        },
      };
    }

    // Mid-range delta (0.5 < |delta| < 1.5) — mild lean copy.
    return {
      copyKey: delta > 0 ? 'single-mild-high' : 'single-mild-low',
      score: 72,
      vars: {
        rating: userRating,
        community,
        delta: round1(absDelta),
      },
    };
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
