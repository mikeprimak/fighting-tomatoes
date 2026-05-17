/**
 * Trait: night-owl
 *
 * Fires when the user is active during late-night / very-early-morning hours.
 *
 * Timezone caveat: User records have no timezone field, so the trait uses
 * server UTC and a wide window (02:00-10:00 UTC) that catches late-evening
 * through early-morning across most US timezones. EST 22:00 = 02:00 UTC,
 * PST 22:00 = 05:00 UTC, so EST 22:00 - 06:00 maps to 02:00 - 10:00 UTC.
 * Adjust NIGHT_HOUR_START / NIGHT_HOUR_END if we add user timezones later.
 *
 * Score 68 — wins over hype-accuracy's weak buckets and hype-bias agreement,
 * loses to rating-bias single-* (the natural rating-vs-room comparison stays
 * primary). Adds variety to repeated nighttime testing.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const NIGHT_HOUR_START_UTC = 2; // inclusive
const NIGHT_HOUR_END_UTC = 10; // exclusive

const trait: Trait = {
  id: 'night-owl',
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

    const hourUtc = new Date().getUTCHours();
    if (hourUtc < NIGHT_HOUR_START_UTC || hourUtc >= NIGHT_HOUR_END_UTC) {
      return null;
    }

    // Split into two flavor copyKeys so the same line doesn't fire across
    // every action in one nighttime session — the 30-day cooldown is per-line,
    // not per-trait, but splitting buckets adds variety.
    const verb = ctx.action === 'hype' ? 'hype' : 'rating';
    return {
      copyKey: 'night',
      score: 68,
      vars: { verb },
    };
  },
};

export default trait;
