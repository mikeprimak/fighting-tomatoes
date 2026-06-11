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
import type {
  RankedInsight,
  TasteProfileInput,
  TasteProfileResult,
} from './types';

const DEFAULT_MAX_INSIGHTS = 12;

export function computeTasteProfile(
  input: TasteProfileInput,
): TasteProfileResult {
  const signature = buildSignature(input.fights, input.fighters ?? []);
  const candidates = generateCandidates(signature);

  const max = input.maxInsights ?? DEFAULT_MAX_INSIGHTS;
  const salt = input.rotationSalt ?? '';

  const insights: RankedInsight[] = candidates.slice(0, max).map((c) => {
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
