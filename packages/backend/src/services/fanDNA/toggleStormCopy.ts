/**
 * Toggle-storm copy pool. Used by the engine when the same (user, fight,
 * action) has changed value 5+ times in 10 minutes (META) or 10+ times (EXIT).
 *
 * Worms-tone rules: affectionate, two-beat, the data is the joke, never
 * punching down at the user. See `docs/brand/voice.md` (TBD) for the full
 * voice spec.
 */

export const META_LINES: readonly string[] = [
  "You've changed your mind a few times now. We're enjoying watching this.",
  "Four toggles deep. Whatever you land on, we believe in you.",
  "Quite the deliberation. Take your time.",
  "We're keeping the score for you. Don't worry about us.",
  "This is the most attention this fight has had all week.",
  "You're really turning it over. We respect a thorough review.",
  "The slider has feelings now. We thought you should know.",
  "Five revisions. The committee remains in session.",
  "We can do this all night. Take your time.",
  "Genuinely curious where you land.",
  "This is what democracy must feel like.",
  "We're not going anywhere. Pick a number.",
  "Splendid stamina on the rating slider.",
  "The numbers are starting to look at each other suspiciously.",
  "Working through it. We salute the commitment.",
];

export const EXIT_LINES: readonly string[] = [
  "Alright. You've found our best material. We're going to sit this one out.",
  "We'll let you negotiate with the slider in private. Back in a bit.",
  "Excellent persistence. We're stepping away for a moment.",
  "Our work here is done. For now. Carry on.",
  "We've reached the end of our prepared remarks.",
  "Going to give you and this fight some space. Talk soon.",
];

export function pickMetaLine(seed: string): string {
  return META_LINES[hashIndex(seed, META_LINES.length)];
}

export function pickExitLine(seed: string): string {
  return EXIT_LINES[hashIndex(seed, EXIT_LINES.length)];
}

/** Deterministic-ish index so the same (user, fight) doesn't always get line 0. */
function hashIndex(seed: string, length: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % length;
}
