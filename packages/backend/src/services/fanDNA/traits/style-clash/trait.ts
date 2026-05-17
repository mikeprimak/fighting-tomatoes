/**
 * Trait: style-clash
 *
 * The first tag-aware Fan DNA trait — reads Fight.aiTags.styleTags and fires
 * when the fight is framed as a stylistic clash (any "X vs Y" tag from the AI
 * enrichment extractor: "striker vs grappler", "judo-based grappler vs striker",
 * "wrestler vs striker", etc.).
 *
 * Responds to BOTH rate and hype, with separate copy pools per (action × user
 * value tier). The user's number is always interpolated alongside the tag — we
 * never bare-quote the tag verbatim; it always reads as a sentence.
 *
 * Score 75 — primary-tier flavour that wins over rating-bias mild (72) but
 * loses to dramatic single-event deltas (rating-bias big at 88, trailblazer at
 * 95, promotion-debut at 82). When the room is hot or you're a hot-take, those
 * still take the line.
 *
 * Suppressed when:
 *   • Fight has no aiTags (small orgs without coverage)
 *   • aiConfidence < CONFIDENCE_FLOOR (defense in depth — the pipeline already
 *     filters, but the trait double-checks)
 *   • No styleTag matches the clash pattern
 *
 * Defers user-level pattern detection (e.g. "you've hyped 7 striker-grappler
 * fights at 8+") to a future rematch-fan / style-pattern trait that needs
 * batchCompute.
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const CONFIDENCE_FLOOR = 0.5;
const SCORE = 75;
const CLASH_REGEX = /\b(?:vs\.?|versus)\b/i;

interface AiTagsShape {
  styleTags?: unknown;
}

const trait: Trait = {
  id: 'style-clash',
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

    const styleTag = pickClashTag(fight.aiTags);
    if (!styleTag) return null;

    const tier = valueTier(ctx.value);
    const valueVar =
      ctx.action === 'rate' ? { rating: ctx.value } : { hype: ctx.value };

    return {
      copyKey: `${ctx.action}-clash-${tier}`,
      score: SCORE,
      vars: {
        ...valueVar,
        styleTag,
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

function pickClashTag(aiTags: unknown): string | null {
  if (!aiTags || typeof aiTags !== 'object') return null;
  const tags = (aiTags as AiTagsShape).styleTags;
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    if (typeof t === 'string' && CLASH_REGEX.test(t)) return t.trim();
  }
  return null;
}
