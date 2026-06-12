/**
 * Taste-profile engine — public entry point.
 *
 * computeTasteProfile(input) is PURE: pre-loaded data in, signature + ranked
 * rendered insights out. The prisma loader that feeds it real user data is
 * built at pilot time (needs the dev DB); until then synthetic data exercises
 * every path (tasteProfile.test.ts).
 *
 * Surfacing (home dashboard, profile, recap) integrates later with the Fan DNA
 * engine's impression ledger using each insight's `key` as the cooldown
 * identity, the same way DNALine.lineKey works today.
 */
import { buildSignature } from './aggregate';
import { renderInsight } from './copy';
import { generateCandidates } from './insights';
import {
  MAX_PER_KIND,
  type RankedInsight,
  type TasteProfileInput,
  type TasteProfileResult,
} from './types';

const DEFAULT_MAX_INSIGHTS = 12;

/**
 * Kinds that read alike share one diversity-quota bucket (MAX_PER_KIND per
 * bucket in the final list). The three fighter-axis kinds all render as
 * "Built from N fighters you rate high..."; the community kinds are already
 * hard-capped at one per direction but share a bucket anyway.
 */
const KIND_GROUP: Record<string, string> = {
  'fighter-style': 'fighter-axis',
  'fighter-appeal': 'fighter-axis',
  'fighter-persona': 'fighter-axis',
  'community-high': 'community',
  'community-low': 'community',
  'rating-bias-high': 'community',
  'rating-bias-low': 'community',
};

/**
 * Greedy diverse selection: walk the ranked list, skip anything past its kind
 * group's quota. No backfill — a shorter varied list beats a wall of one
 * format (Mike, 2026-06-12).
 */
function pickDiverse(
  candidates: ReturnType<typeof generateCandidates>,
  max: number,
): ReturnType<typeof generateCandidates> {
  const counts = new Map<string, number>();
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= max) break;
    const group = KIND_GROUP[c.kind] ?? c.kind;
    const n = counts.get(group) ?? 0;
    if (n >= MAX_PER_KIND) continue;
    counts.set(group, n + 1);
    picked.push(c);
  }
  return picked;
}

export function computeTasteProfile(
  input: TasteProfileInput,
): TasteProfileResult {
  const signature = buildSignature(input.fights, input.fighters ?? []);
  const candidates = generateCandidates(signature, {
    fighters: input.fighters,
    recCandidates: input.recCandidates,
  });

  const max = input.maxInsights ?? DEFAULT_MAX_INSIGHTS;
  const salt = input.rotationSalt ?? '';

  const insights: RankedInsight[] = pickDiverse(candidates, max).map((c) => {
    const key = `${c.kind}|${c.dimension}|${c.token}|${c.direction}`;
    const { headline, subline } = renderInsight(
      c,
      `${input.userId}|${key}|${salt}`,
    );
    return { ...c, key, headline, subline };
  });

  return { signature, insights };
}

export * from './types';
export { buildSignature } from './aggregate';
export { generateCandidates } from './insights';
export { renderInsight } from './copy';
export { tokenPhrase } from './tokenLabels';
export { commonness, rarityMultiplier } from './priors';
