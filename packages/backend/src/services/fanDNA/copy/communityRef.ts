/**
 * Shared copy-variety toolkit for Fan DNA insight lines.
 *
 * Two jobs, both about the same goal — the user must never feel the app is
 * repeating itself:
 *
 *  1. communityRef() — a varied way to say "everyone else". The shipped copy
 *     leaned on "the room" ~125 times; that single phrase, repeated, reads as a
 *     tic. This rotates across a pool of natural alternatives, with "the room"
 *     demoted to just one option among many.
 *  2. pickVariety() — a generic deterministic picker for any copy pool, so a
 *     given (insight, context) is stable within a surfacing but well-spread
 *     across the pool rather than always landing on variant 0.
 *
 * Determinism uses the same hashIndex pattern as toggleStormCopy.ts so behavior
 * is consistent across the Fan DNA copy layer (and testable). The engine's
 * existing 30-day per-line cooldown still owns "don't show the SAME line twice";
 * this owns "don't show the same WORDS twice".
 */

/**
 * Ways to refer to the community in a comparison line. Ordered roughly
 * neutral-to-colloquial; the picker spreads across all of them. "the room" is
 * present but is one of many, not the default.
 */
export const COMMUNITY_REFS: readonly string[] = [
  'the community',
  'most fans',
  'the group',
  'everyone else',
  'the average fan',
  'other raters',
  'the crowd',
  'fans overall',
  'the rest of us',
  'the field',
  'the consensus',
  'the room',
];

/**
 * Subject-position variants ("most fans rate this…"), kept separate so a line
 * can choose a grammatically natural reference without string-munging.
 */
export const COMMUNITY_REFS_SUBJECT: readonly string[] = [
  'the community',
  'most fans',
  'the group',
  'everyone else',
  'the average fan',
  'other raters',
  'the crowd',
  'the consensus',
];

/** Deterministic index — same seed → same index, but well-spread across length. */
export function hashIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % length;
}

/**
 * A varied community reference for a comparison line, seeded by context (e.g.
 * `${userId}|${insightKey}`) so the same insight is stable but two different
 * insights in the same view don't both say "the room".
 */
export function communityRef(seed: string): string {
  return COMMUNITY_REFS[hashIndex(seed, COMMUNITY_REFS.length)];
}

/** Subject-position variant of communityRef(). */
export function communityRefSubject(seed: string): string {
  return COMMUNITY_REFS_SUBJECT[hashIndex(seed, COMMUNITY_REFS_SUBJECT.length)];
}

/**
 * Refs that take a third-person SINGULAR verb ("the crowd shrugs"). Templates
 * that conjugate a verb against the reference must use this pool — plural refs
 * like "most fans" read as "most fans shrugs" otherwise.
 */
export const COMMUNITY_REFS_SINGULAR: readonly string[] = [
  'the community',
  'the group',
  'the average fan',
  'the crowd',
  'the consensus',
  'the room',
];

/** Singular-verb-safe variant of communityRef(). */
export function communityRefSingular(seed: string): string {
  return COMMUNITY_REFS_SINGULAR[hashIndex(seed, COMMUNITY_REFS_SINGULAR.length)];
}

/** Generic deterministic pick from any copy pool. */
export function pickVariety<T>(pool: readonly T[], seed: string): T {
  return pool[hashIndex(seed, pool.length)];
}
