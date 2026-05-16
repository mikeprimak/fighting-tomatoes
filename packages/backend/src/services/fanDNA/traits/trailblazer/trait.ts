/**
 * Trait: trailblazer
 *
 * Fires when the user is genuinely among the first to react to a fight. Two
 * tiers:
 *   • first-ever       — literally zero other signals on this fight before
 *                        this one. Highest score.
 *   • among-first-few  — fewer than 3 other signals exist for the same action.
 *                        Lower score; lets community-comparison or other
 *                        traits speak first when applicable.
 *
 * No history floor — being first is a one-shot moment that doesn't need a
 * user baseline to make sense.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const FIRST_FEW_THRESHOLD = 3; // user is among the first 3 signals

const trait: Trait = {
  id: 'trailblazer',
  family: 'identity',
  tier: 1,
  version: 1,
  respondsTo: ['rate', 'hype'] as const,
  surfaces: ['rate-reveal-modal', 'hype-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute({ prisma, userId }) {
    // Count fights where the user was the very first rater. Cheap heuristic:
    // the user's own rating row pre-dates all other ratings on that fight.
    const firstRatings = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM fight_ratings r
      WHERE r."userId" = ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM fight_ratings r2
          WHERE r2."fightId" = r."fightId"
            AND r2."userId" <> ${userId}
            AND r2."createdAt" < r."createdAt"
        )
    `;
    const firstHypes = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM fight_predictions p
      WHERE p."userId" = ${userId}
        AND p."predictedRating" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fight_predictions p2
          WHERE p2."fightId" = p."fightId"
            AND p2."userId" <> ${userId}
            AND p2."predictedRating" IS NOT NULL
            AND p2."createdAt" < p."createdAt"
        )
    `;
    const firstRateCount = Number(firstRatings[0]?.count ?? 0);
    const firstHypeCount = Number(firstHypes[0]?.count ?? 0);
    const total = firstRateCount + firstHypeCount;

    return {
      value: { firstRateCount, firstHypeCount, total },
      confidence: Math.min(1, total / 10),
      hasFloor: total >= 1,
    } satisfies TraitComputeResult;
  },

  async eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null> {
    if (!ctx.fightId) return null;
    if (ctx.action !== 'rate' && ctx.action !== 'hype') return null;

    // Count OTHER users' signals of the same action on this fight. The user's
    // own row may already be committed by the time the engine runs, so we
    // exclude it explicitly.
    let othersCount: number;
    if (ctx.action === 'rate') {
      othersCount = await ctx.prisma.fightRating.count({
        where: { fightId: ctx.fightId, userId: { not: ctx.userId } },
      });
    } else {
      othersCount = await ctx.prisma.fightPrediction.count({
        where: {
          fightId: ctx.fightId,
          userId: { not: ctx.userId },
          predictedRating: { not: null },
        },
      });
    }

    const verb = ctx.action === 'hype' ? 'hype' : 'rate';
    const verbed = ctx.action === 'hype' ? 'hyped' : 'rated';
    const noun = ctx.action === 'hype' ? 'hype' : 'rating';

    if (othersCount === 0) {
      return {
        copyKey: 'first-ever',
        score: 95,
        vars: { verb, verbed, noun },
      };
    }
    if (othersCount < FIRST_FEW_THRESHOLD) {
      return {
        copyKey: 'among-first-few',
        score: 75,
        vars: { verb, verbed, noun, others: othersCount },
      };
    }
    return null;
  },
};

export default trait;
