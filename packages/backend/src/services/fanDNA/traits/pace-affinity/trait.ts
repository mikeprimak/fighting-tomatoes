/**
 * Trait: pace-affinity
 *
 * Third tag-aware Fan DNA trait. Reads Fight.aiTags.pace ∈ {fast, tactical,
 * grinding} and produces copy that pairs the user's number with their apparent
 * affinity for that style of fight. Sibling to style-clash and stakes-aware —
 * same shape, lower score (70) so it loses tie-breaks to clashes and stakes
 * when both fire (those framings are richer hooks).
 *
 * Responds to BOTH rate and hype with separate copy pools per
 * (action × pace × value tier). 3 paces × 2 actions × 3 tiers = 18 copy keys.
 *
 * The pace label is interpolated as a noun phrase ("a fast one", "a tactical
 * fight", "a grinding match") via the precomputed `pacePhrase` var — never
 * bare-quoted as just "fast" / "tactical" / "grinding".
 *
 * Suppressed when:
 *   • Fight has no aiTags
 *   • aiConfidence < CONFIDENCE_FLOOR
 *   • aiTags.pace is null or not one of the known values
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const CONFIDENCE_FLOOR = 0.5;
const SCORE = 70;

type Pace = 'fast' | 'tactical' | 'grinding';

interface AiTagsShape {
  pace?: unknown;
}

const PACE_PHRASE: Record<Pace, string> = {
  fast: 'a fast one',
  tactical: 'a tactical fight',
  grinding: 'a grinding match',
};

const trait: Trait = {
  id: 'pace-affinity',
  family: 'affinity',
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
    if (!ctx.fightId || ctx.value == null) return null;

    const fight = await ctx.prisma.fight.findUnique({
      where: { id: ctx.fightId },
      select: { aiTags: true, aiConfidence: true },
    });
    if (!fight) return null;
    if (fight.aiConfidence == null || fight.aiConfidence < CONFIDENCE_FLOOR) {
      return null;
    }

    const pace = pickPace(fight.aiTags);
    if (!pace) return null;

    const tier = valueTier(ctx.value);
    const valueVar =
      ctx.action === 'rate' ? { rating: ctx.value } : { hype: ctx.value };

    return {
      copyKey: `${ctx.action}-pace-${pace}-${tier}`,
      score: SCORE,
      vars: {
        ...valueVar,
        pace,
        pacePhrase: PACE_PHRASE[pace],
      },
    };
  },
};

export default trait;

function valueTier(v: number): 'high' | 'mid' | 'low' {
  if (v >= 7) return 'high';
  if (v <= 3) return 'low';
  return 'mid';
}

function pickPace(aiTags: unknown): Pace | null {
  if (!aiTags || typeof aiTags !== 'object') return null;
  const p = (aiTags as AiTagsShape).pace;
  if (p === 'fast' || p === 'tactical' || p === 'grinding') return p;
  return null;
}
