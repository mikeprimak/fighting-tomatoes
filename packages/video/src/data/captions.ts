/**
 * One visceral line per fight — keyed by fightId.
 *
 * Spec §3 writing rule: emotion retains, the rating number carries the data weight.
 * Blood, smiling, final seconds. NOT a stats dump.
 *
 * These are the one part of a video that is written rather than queried. When
 * videoData.ts surfaces a fight with no entry here, the card falls back to
 * "<event> · <finish>" so a render never blocks — but a fallback line is a flat
 * line. Write a real one before publishing.
 */
export const CAPTIONS: Record<string, string> = {
  // #1 Glover Teixeira vs Jiri Prochazka — UFC Fight Night, Jun 11 2022
  '46e7dba1-0cf5-49d1-9564-38ffe7ed807d':
    'Both men nearly finished twice. It ended with 28 seconds left in the fifth.',

  // #2 Cub Swanson vs Doo Ho Choi — UFC 206
  'c5101dec-f72e-4be0-a01c-806038086dba':
    'Three rounds. Neither man took a backward step. Nobody went down.',

  // #3 Robbie Lawler vs Rory MacDonald — UFC 189
  '5c663026-7270-4b42-babb-e17e21042461':
    'They stood inches apart, faces opened up, and smiled at each other.',

  // #4 Michael Johnson vs Justin Gaethje — TUF 25 Finale
  'e6010dfb-ee6a-4538-80b5-62d7ad05105a':
    'Gaethje got dropped, got up, and walked him down anyway.',

  // #5 Ilia Topuria vs Justin Gaethje — UFC Freedom 250
  '678f5cab-59af-45fc-8e8a-80f969965adf':
    'Four rounds of a firefight nobody was winning, until suddenly it was over.',
};
