import captions from './captions.json';

/**
 * One visceral line per fight — keyed by fightId.
 *
 * Spec §3 writing rule: emotion retains, the rating number carries the data weight.
 * Blood, smiling, final seconds. NOT a stats dump.
 *
 * Stored as JSON (not inline here) so the local control panel can edit them —
 * see `studio/server.mjs`. Editing captions.json by hand is equally fine.
 *
 * A fight with no entry falls back to "<event> · <finish>" so a render never blocks,
 * but a fallback line is a flat line. Write a real one before publishing.
 */
export const CAPTIONS: Record<string, string> = captions;
