/**
 * Trait: promotion-debut
 *
 * Fires when this is the user's FIRST rate or hype on a fight from this
 * promotion (UFC, BKFC, ONE FC, Karate Combat, etc.). Recognizes the moment
 * a user crosses into a new org's universe.
 *
 * Algorithm:
 *   1. Look up this fight's event's promotion.
 *   2. Check whether the user has any prior rate or hype on a DIFFERENT
 *      fight whose event has the same promotion.
 *   3. If none → fire promotion-debut with {promotion} interpolated.
 *
 * Score 82 — a special-moment line that should usually win when triggered,
 * but loses to dramatic moments (rating-bias single-big at 88, hype-accuracy
 * hot-take at 95, trailblazer first-ever at 95).
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const trait: Trait = {
  id: 'promotion-debut',
  family: 'identity',
  tier: 1,
  version: 1,
  respondsTo: ['rate', 'hype'] as const,
  surfaces: ['rate-reveal-modal', 'hype-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute(_args) {
    return null satisfies TraitComputeResult | null;
  },

  async eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null> {
    if (ctx.action !== 'rate' && ctx.action !== 'hype') return null;
    if (!ctx.fightId) return null;

    const fight = await ctx.prisma.fight.findUnique({
      where: { id: ctx.fightId },
      select: { event: { select: { promotion: true } } },
    });
    if (!fight?.event?.promotion) return null;
    const promotion = fight.event.promotion;

    // Count prior actions on OTHER fights from the same promotion.
    const [priorRatings, priorHypes] = await Promise.all([
      ctx.prisma.fightRating.count({
        where: {
          userId: ctx.userId,
          fightId: { not: ctx.fightId },
          fight: { event: { promotion } },
        },
      }),
      ctx.prisma.fightPrediction.count({
        where: {
          userId: ctx.userId,
          fightId: { not: ctx.fightId },
          predictedRating: { not: null },
          fight: { event: { promotion } },
        },
      }),
    ]);

    if (priorRatings + priorHypes > 0) return null;

    return {
      copyKey: 'debut',
      score: 82,
      vars: { promotion },
    };
  },
};

export default trait;
