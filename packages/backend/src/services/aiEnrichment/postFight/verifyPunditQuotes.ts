/**
 * Deterministic verification for pundit quotes.
 *
 * This is the anti-hallucination guard, and it is deliberately stricter than
 * every other enrichment gate: a confidence float is enough for a soft narrative
 * line, but we are publicly attributing WORDS to a REAL NAMED PERSON. LLMs asked
 * for verbatim quotes will quietly paraphrase under pressure, and a paraphrase
 * presented as a quote is a misquote.
 *
 * The rule: the normalized quote must appear as a literal substring of the
 * article text we ACTUALLY FETCHED for the sourceUrl the model claimed. No
 * fuzzy matching, no similarity threshold, no "close enough". A quote that
 * fails is dropped and logged — never softened into the strip.
 *
 * Note this also means quotes can only come from pages we fully fetched (never
 * from a search snippet), which the Phase 6 piggyback design already satisfies.
 */

import { createHash } from 'crypto';
import type { PunditQuoteDraft } from './extractPostFightEnrichment';

export interface VerifiedPunditQuote extends PunditQuoteDraft {
  /** sha256 of the normalized quote — dedupe key across outlets. */
  quoteHash: string;
}

export type QuoteRejectionReason =
  | 'unknown_source_url'   // model cited a URL that wasn't in the source set
  | 'not_in_source'        // quote text is not literally in that article
  | 'empty_after_normalize';

export interface QuoteRejection {
  quote: string;
  speaker: string;
  sourceUrl: string;
  reason: QuoteRejectionReason;
  /** Set when the quote WAS found, just in a different fetched source. */
  foundInUrl?: string;
}

export interface VerifyPunditQuotesResult {
  verified: VerifiedPunditQuote[];
  rejected: QuoteRejection[];
}

/**
 * Fold the cosmetic differences between what an article renders and what a
 * model echoes back: smart quotes, dashes, ellipses, NBSP, case, whitespace runs.
 * Everything else (word choice, order, grammar) must match exactly.
 */
export function normalizeQuoteText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")   // single quotes / primes
    .replace(/[“”„‟″]/g, '"')   // double quotes
    .replace(/[‐-―−]/g, '-')              // hyphens / dashes / minus
    .replace(/…/g, '...')                           // ellipsis
    .replace(/[   ]/g, ' ')               // non-breaking spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The comparison key: normalized text with ALL whitespace removed.
 *
 * Whitespace has to be ignored because our article extractor concatenates block
 * elements without separators ("...flying kick.His planting leg gives out..."),
 * so a model copying the passage correctly re-inserts the space a human reader
 * infers and would otherwise fail a raw substring test. Ignoring whitespace
 * costs the guard nothing: word choice, word order, and spelling must still
 * match character for character, which is what stops paraphrase.
 */
function matchKey(s: string): string {
  return normalizeQuoteText(s).replace(/\s+/g, '');
}

/** Strip leading/trailing quote marks and stray punctuation the model may have kept. */
function trimQuoteMarks(s: string): string {
  return s.replace(/^["'\s]+/, '').replace(/["'\s]+$/, '');
}

/** Dedupe key. Whitespace-insensitive too, so the same line from two outlets
 *  collapses even when their markup differs. */
export function hashQuote(quote: string): string {
  return createHash('sha256').update(matchKey(quote)).digest('hex');
}

/**
 * @param drafts   quotes as parsed from the model output
 * @param sources  the articles we actually fetched, keyed by the URL we gave the model
 */
export function verifyPunditQuotes(
  drafts: PunditQuoteDraft[],
  sources: Array<{ url: string; text: string }>,
): VerifyPunditQuotesResult {
  // Pre-normalize each source once — an event's quotes all scan the same corpus.
  const byUrl = new Map<string, string>();
  for (const s of sources) {
    byUrl.set(s.url, matchKey(s.text));
  }

  const verified: VerifiedPunditQuote[] = [];
  const rejected: QuoteRejection[] = [];

  for (const d of drafts) {
    const needle = matchKey(trimQuoteMarks(d.quote));
    if (!needle) {
      rejected.push({ quote: d.quote, speaker: d.speaker, sourceUrl: d.sourceUrl, reason: 'empty_after_normalize' });
      continue;
    }

    const haystack = byUrl.get(d.sourceUrl);
    if (haystack === undefined) {
      rejected.push({ quote: d.quote, speaker: d.speaker, sourceUrl: d.sourceUrl, reason: 'unknown_source_url' });
      continue;
    }

    if (!haystack.includes(needle)) {
      // Diagnostic only: if it's in a DIFFERENT fetched article the model got the
      // attribution URL wrong. We still drop it — publishing a quote under a URL
      // that doesn't contain it is exactly the failure this gate exists to stop.
      const foundInUrl = [...byUrl.entries()].find(([url, text]) => url !== d.sourceUrl && text.includes(needle))?.[0];
      rejected.push({
        quote: d.quote,
        speaker: d.speaker,
        sourceUrl: d.sourceUrl,
        reason: 'not_in_source',
        ...(foundInUrl ? { foundInUrl } : {}),
      });
      continue;
    }

    verified.push({ ...d, quote: trimQuoteMarks(d.quote).trim(), quoteHash: hashQuote(d.quote) });
  }

  return { verified, rejected };
}
