/** Display-time content filter for user comments surfaced algorithmically
 *  (home page bands). Masks slurs and violent/sexual-crime terms with ******
 *  so an ugly comment can't ambush someone from the home page. Deliberately
 *  NOT general profanity — "damn/hell/ass" stay; this is the
 *  never-want-to-see-it list. Display-only: the stored comment is untouched
 *  and renders unmasked on the fight detail screen the user chose to open.
 *
 *  Keep in sync with packages/mobile/utils/contentFilter.ts.
 */

const OFFENSIVE_PATTERNS = [
  'rap(?:e|es|ed|ing|ist|ists)',
  'p[ae]do(?:phile|philes)?',
  'p[ae]edo(?:phile|philes)?',
  'molest(?:s|ed|er|ers|ing)?',
  'nigg\\w+',
  'fag(?:got)?s?',
  'kikes?',
  'chinks?',
  'spics?',
  'wetbacks?',
  'trann(?:y|ies)',
  'retard(?:s|ed)?',
];

const MASK = '******';

const OFFENSIVE_RE = new RegExp(`\\b(?:${OFFENSIVE_PATTERNS.join('|')})\\b`, 'gi');

export function maskOffensiveWords(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(OFFENSIVE_RE, MASK);
}
