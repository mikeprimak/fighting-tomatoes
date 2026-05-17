/**
 * Trait: session-streak
 *
 * Fires when the user has been on a tear — multiple rate/hype actions in a
 * short window. Three escalating tiers:
 *   • streak-3  (>=3 actions in window) — score 70
 *   • streak-5  (>=5 actions in window) — score 78
 *   • streak-10 (>=10 actions in window) — score 85
 *
 * Counts dNALineImpression rows for this user with action in ['rate','hype']
 * inside SESSION_WINDOW_MS. Includes "__none__" / "__cooldown_all__" rows
 * because those still represent user activity — we want to recognize the
 * burst of action, not just lines that surfaced.
 *
 * No batchCompute — the trait is purely event-driven and has no persistent
 * value to summarize. Returns a stub for the contract.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const SESSION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const STREAK_THREE = 3;
const STREAK_FIVE = 5;
const STREAK_TEN = 10;

const trait: Trait = {
  id: 'session-streak',
  family: 'behaviour',
  tier: 1,
  version: 1,
  respondsTo: ['rate', 'hype'] as const,
  surfaces: ['rate-reveal-modal', 'hype-reveal-modal', 'profile-fullscreen'] as const,
  copy,

  async batchCompute(_args) {
    // Trait has no persistent value — sessions are by definition transient.
    return null satisfies TraitComputeResult | null;
  },

  async eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null> {
    if (ctx.action !== 'rate' && ctx.action !== 'hype') return null;

    const windowStart = new Date(Date.now() - SESSION_WINDOW_MS);
    const recentActions = await ctx.prisma.dNALineImpression.count({
      where: {
        userId: ctx.userId,
        action: { in: ['rate', 'hype'] },
        firedAt: { gt: windowStart },
      },
    });

    // recentActions counts prior impressions only (peek mode skips writing,
    // and the live commit hasn't recorded yet at the moment eventEvaluate
    // runs). The current action is +1 conceptually.
    const totalActions = recentActions + 1;

    if (totalActions >= STREAK_TEN) {
      return { copyKey: 'streak-10', score: 85, vars: { count: totalActions } };
    }
    if (totalActions >= STREAK_FIVE) {
      return { copyKey: 'streak-5', score: 78, vars: { count: totalActions } };
    }
    if (totalActions >= STREAK_THREE) {
      return { copyKey: 'streak-3', score: 70, vars: { count: totalActions } };
    }
    return null;
  },
};

export default trait;
