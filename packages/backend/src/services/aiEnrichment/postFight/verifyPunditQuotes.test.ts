/**
 * Unit test for the pundit-quote verifier (`verifyPunditQuotes.ts`).
 *
 * This guard is the only thing between a hallucinated paraphrase and words
 * published under a real journalist's name, so its guarantees are pinned here
 * rather than left to manual spot-checks.
 *
 * The tension it has to hold: loose enough to survive cosmetic differences
 * (smart quotes, em dashes, and the missing block-boundary spaces our cheerio
 * article extractor produces — "…flying kick.His planting leg…"), strict enough
 * that no rewording, reordering or stitching survives. Both halves are
 * calibrated on the real UFC 329 reaction articles from the 2026-07-18 dry run.
 *
 * Run from packages/backend:
 *   npx tsx src/services/aiEnrichment/postFight/verifyPunditQuotes.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import * as assert from 'assert';
import { verifyPunditQuotes, hashQuote, normalizeQuoteText } from './verifyPunditQuotes';

let failures = 0;
function check(desc: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${desc}`);
    console.error(`    ${(err as Error).message}`);
  }
}

// The run-on tail mimics the real extractor artifact: cheerio's .text()
// concatenates block elements with no separator.
const SOURCES = [
  {
    url: 'https://a.com/x',
    text:
      'Sonnen said: “That was the best   fight I’ve seen all year — no question.” ' +
      'Well... that happened.The first strike Conor McGregor throws is a flying kick.' +
      'His planting leg gives out on impact.Fight, over.',
  },
  { url: 'https://b.com/y', text: 'Helwani wrote: A career-defining night for him, plainly.' },
];

function verifyOne(quote: string, url = 'https://a.com/x') {
  return verifyPunditQuotes(
    [{ speaker: 'Chael Sonnen', speakerRole: 'ex_fighter', outlet: 'Bloody Elbow', sourceUrl: url, quote, confidence: 0.8 }],
    SOURCES,
  );
}

function assertAccepted(quote: string, url?: string) {
  const r = verifyOne(quote, url);
  assert.strictEqual(r.verified.length, 1, `expected ACCEPT, got reject(${r.rejected[0]?.reason})`);
  return r.verified[0];
}

function assertRejected(quote: string, url?: string, reason?: string) {
  const r = verifyOne(quote, url);
  assert.strictEqual(r.verified.length, 0, 'expected REJECT, quote was accepted');
  if (reason) assert.strictEqual(r.rejected[0].reason, reason);
  return r.rejected[0];
}

function main(): void {
  console.log('Accepts genuinely verbatim quotes:');

  check('folds smart quotes, em dash and collapsed whitespace', () => {
    assertAccepted("That was the best fight I've seen all year - no question.");
  });

  check('tolerates spaces the model re-inserts at block boundaries', () => {
    // Source reads "...flying kick.His planting leg..." with no space.
    assertAccepted('The first strike Conor McGregor throws is a flying kick. His planting leg gives out on impact. Fight, over.');
  });

  check('allows trimming from the ends, and strips wrapping quote marks', () => {
    const v = assertAccepted('"His planting leg gives out on impact."');
    assert.strictEqual(v.quote, 'His planting leg gives out on impact.');
  });

  console.log('\nRejects anything not literally in the cited source:');

  check('rejects a paraphrase', () => {
    assertRejected('The first thing McGregor throws is a flying kick and his leg gives out.', undefined, 'not_in_source');
  });

  check('rejects reordered clauses', () => {
    assertRejected('His planting leg gives out on impact. The first strike Conor McGregor throws is a flying kick.', undefined, 'not_in_source');
  });

  check('rejects a quote stitched across a gap in the article', () => {
    assertRejected('Well... that happened. Fight, over.', undefined, 'not_in_source');
  });

  check('rejects a single swapped word (fight -> bout)', () => {
    assertRejected("That was the best bout I've seen all year - no question.", undefined, 'not_in_source');
  });

  check('rejects a URL that was never fetched', () => {
    assertRejected('His planting leg gives out on impact.', 'https://nope.com', 'unknown_source_url');
  });

  check('rejects a real quote cited to the wrong source, and reports where it lives', () => {
    // Publishing a quote under a URL that does not contain it is exactly the
    // failure this gate exists to stop — being real elsewhere does not save it.
    const r = assertRejected('A career-defining night for him', 'https://a.com/x', 'not_in_source');
    assert.strictEqual(r.foundInUrl, 'https://b.com/y');
  });

  check('rejects an empty quote', () => {
    assertRejected('   ', undefined, 'empty_after_normalize');
  });

  console.log('\nDedupe hashing:');

  check('collapses the same line rendered differently by two outlets', () => {
    assert.strictEqual(
      hashQuote('That was the best fight — no question.'),
      hashQuote('that was  the best fight - no question.'),
    );
  });

  check('separates genuinely different lines', () => {
    assert.notStrictEqual(hashQuote('That was the best fight.'), hashQuote('That was the worst fight.'));
  });

  check('normalizeQuoteText leaves word content alone', () => {
    assert.strictEqual(normalizeQuoteText('  He   said “No.”  '), 'he said "no."');
  });

  if (failures > 0) {
    console.error(`\n${failures} assertion group(s) FAILED`);
    process.exit(1);
  }
  console.log('\nAll pundit-quote verifier tests passed ✅');
  process.exit(0);
}

main();
