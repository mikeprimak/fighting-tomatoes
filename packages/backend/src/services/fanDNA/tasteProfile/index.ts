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

/**
 * Kinds whose claim is positive enough to carry a "Because you liked ..."
 * receipt line. Negative/absence claims (cold, never-above, community-low)
 * get none — citing fights the user LIKED under a claim about what they
 * don't would read as a contradiction.
 */
const EVIDENCE_KINDS = new Set([
  'loves',
  'community-high',
  'rates-high',
  'all-high',
  'all-tens-share',
  'prefers',
  'era-lean',
]);

/** "Because you liked A and B" — the receipts behind a positive claim. */
export function renderEvidence(examples: string[] | undefined): string | undefined {
  if (!examples || examples.length === 0) return undefined;
  return `Because you liked ${examples.join(' and ')}`;
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

  // Receipt lookups for evidence lines (Mike, 2026-07-04: cite the concrete
  // fights behind the claim). Token insights read from the signature's
  // aggregates; fighter-love reads from that fighter's own top-rated fights.
  const tokenExamples = new Map<string, string[]>();
  for (const t of signature.tokens) {
    if (t.topExamples.length > 0)
      tokenExamples.set(`${t.dimension}|${t.token}`, t.topExamples);
  }
  const fighterExamples = new Map<string, string[]>();
  for (const f of input.fighters ?? []) {
    if (f.exampleFights && f.exampleFights.length > 0)
      fighterExamples.set(f.fighterId, f.exampleFights);
  }

  const insights: RankedInsight[] = pickDiverse(candidates, max).map((c) => {
    const key = `${c.kind}|${c.dimension}|${c.token}|${c.direction}`;
    const { headline, subline } = renderInsight(
      c,
      `${input.userId}|${key}|${salt}`,
    );
    const examples =
      c.kind === 'fighter-love'
        ? fighterExamples.get(c.token)
        : EVIDENCE_KINDS.has(c.kind)
          ? tokenExamples.get(`${c.dimension}|${c.token}`)
          : undefined;
    return { ...c, key, headline, subline, evidence: renderEvidence(examples) };
  });

  return { signature, insights };
}

export * from './types';
export { buildSignature } from './aggregate';
export { generateCandidates } from './insights';
export { renderInsight } from './copy';
export { tokenPhrase } from './tokenLabels';
export { commonness, rarityMultiplier } from './priors';
