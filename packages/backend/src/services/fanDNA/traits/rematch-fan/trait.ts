/**
 * Trait: rematch-fan
 *
 * Fourth tag-aware Fan DNA trait. Reads Fight.aiTags.storylines and fires when
 * the AI extractor flagged the fight as a confirmed rematch / trilogy /
 * unfinished business between the two named fighters. The enrichment prompt
 * (2026-05-17 revision) requires the literal token "rematch" or "trilogy" in
 * one of the storylines whenever a prior meeting is confirmed — this trait
 * keys off those tokens.
 *
 * v1 is single-event-scoped: no user-history pattern (e.g. "you've hyped 5
 * rematches 8+"). That layer requires batchCompute and a pre-aggregated user
 * stat. Add when we have enough data to make the count interesting.
 *
 * Score 78 — slightly above style-clash and stakes-aware (75). Rematches are
 * rarer hooks and carry historical weight; when one fires it's usually the
 * most interesting line on the modal.
 *
 * Detection: the trait categorizes into 'trilogy' if the literal word
 * "trilogy" appears in any storyline; otherwise 'rematch'. "Unfinished" is
 * treated as a rematch synonym.
 *
 * Suppressed when:
 *   • Fight has no aiTags or no storylines
 *   • aiConfidence < CONFIDENCE_FLOOR
 *   • No rematch/trilogy/unfinished token in any storyline
 */
import type {
  Trait,
  EventContext,
  TraitEventResult,
  TraitComputeResult,
} from '../../types';
import copy from './copy';

const CONFIDENCE_FLOOR = 0.5;
const SCORE = 78;

type RematchKind = 'rematch' | 'trilogy';

interface AiTagsShape {
  storylines?: unknown;
}

const TRILOGY_RE = /\btrilogy\b/i;
const REMATCH_RE = /\b(?:rematch|unfinished)\b/i;

const REMATCH_PHRASE: Record<RematchKind, string> = {
  rematch: 'a rematch',
  trilogy: 'a trilogy fight',
};

const trait: Trait = {
  id: 'rematch-fan',
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

    const kind = pickRematchKind(fight.aiTags);
    if (!kind) return null;

    const tier = valueTier(ctx.value);
    const valueVar =
      ctx.action === 'rate' ? { rating: ctx.value } : { hype: ctx.value };

    return {
      copyKey: `${ctx.action}-rematch-${tier}`,
      score: SCORE,
      vars: {
        ...valueVar,
        rematchKind: kind,
        rematchPhrase: REMATCH_PHRASE[kind],
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

function pickRematchKind(aiTags: unknown): RematchKind | null {
  if (!aiTags || typeof aiTags !== 'object') return null;
  const storylines = (aiTags as AiTagsShape).storylines;
  if (!Array.isArray(storylines)) return null;
  const joined = storylines.filter((s): s is string => typeof s === 'string').join(' | ');
  if (!joined) return null;
  if (TRILOGY_RE.test(joined)) return 'trilogy';
  if (REMATCH_RE.test(joined)) return 'rematch';
  return null;
}
