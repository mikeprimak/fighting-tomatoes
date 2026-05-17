/**
 * Trait: stakes-aware
 *
 * Second tag-aware Fan DNA trait. Reads Fight.aiTags.stakes and fires when the
 * AI extractor framed the fight as a notable stake situation — title fight,
 * comeback, debut, main event, cross-sport novelty, ranking shake-up.
 *
 * Responds to BOTH rate and hype, with separate copy pools per (action × user
 * value tier). The detected stakes category is normalized to a short, mid-
 * sentence-safe label (e.g. "title fight", "comeback") and interpolated as
 * `{stakes}` alongside the user's number — never bare-quoted.
 *
 * Score 75 — primary-tier flavour, same as style-clash. When both fire on the
 * same event, the engine's tie-break (insertion order in the trait registry)
 * will pick one; both lines are flavour-equivalent and the user shouldn't notice
 * a winner.
 *
 * Suppressed when:
 *   • Fight has no aiTags (small orgs without coverage)
 *   • aiConfidence < CONFIDENCE_FLOOR (defense in depth — the pipeline already
 *     filters, but the trait double-checks)
 *   • aiTags.stakes is empty or none of its phrases match a known category
 *
 * Skipped categories for v1:
 *   • undefeated — single fight in current data and the phrase ("0-loss record
 *     on the line") doesn't slot cleanly into the templates. Revisit when more
 *     undefeated fighters get enriched coverage.
 *
 * Skipped trait altogether for v1: rematch-fan. The AI enrichment pipeline
 * currently produces zero "rematch" / "trilogy" / "unfinished business" phrases
 * across 52 enriched fights — building it now means a silent trait. Revisit
 * when coverage of recurring matchups (e.g. Volkanovski/Topuria-style) lands.
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

interface AiTagsShape {
  stakes?: unknown;
}

interface StakesPattern {
  label: string;
  re: RegExp;
}

const STAKES_PATTERNS: readonly StakesPattern[] = [
  {
    label: 'title fight',
    re: /\btitle\b(?! conversation)|\bchampion(?:ship)?\b|\bbelt\b/i,
  },
  { label: 'comeback', re: /\b(?:comeback|return(?:ing|s)?)\b/i },
  { label: 'debut', re: /\bdebut\b/i },
  { label: 'cross-sport showcase', re: /\b(?:cross.?sport|novelty)\b/i },
  { label: 'main event', re: /\bmain event\b/i },
  { label: 'ranking shake-up', re: /\branking\b/i },
] as const;

const trait: Trait = {
  id: 'stakes-aware',
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

    const stakesLabel = pickStakesLabel(fight.aiTags);
    if (!stakesLabel) return null;

    const tier = valueTier(ctx.value);
    const valueVar =
      ctx.action === 'rate' ? { rating: ctx.value } : { hype: ctx.value };

    return {
      copyKey: `${ctx.action}-stakes-${tier}`,
      score: SCORE,
      vars: {
        ...valueVar,
        stakes: stakesLabel,
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

function pickStakesLabel(aiTags: unknown): string | null {
  if (!aiTags || typeof aiTags !== 'object') return null;
  const stakes = (aiTags as AiTagsShape).stakes;
  if (!Array.isArray(stakes) || stakes.length === 0) return null;
  const strings = stakes.filter((s): s is string => typeof s === 'string');
  if (strings.length === 0) return null;
  const joined = strings.join(' | ');
  for (const { label, re } of STAKES_PATTERNS) {
    if (re.test(joined)) return label;
  }
  return null;
}
