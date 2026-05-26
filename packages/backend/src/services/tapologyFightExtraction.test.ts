/**
 * Fixture test for the Tapology fight-bleed hardening (Layer 1).
 *
 * Proves the container-scoped selector excludes related/sidebar bouts that
 * the old page-wide `li.border-b` extraction bled into the card.
 *
 * Uses a REAL Tapology event-page HTML fixture (Zuffa Boxing event 137070,
 * captured 2026-01-24) plus a synthetic "polluted" variant built by injecting
 * a bleed bout <li> OUTSIDE the bout-list container — the exact failure mode.
 *
 * Imports the selectors from `tapologyFightExtraction.js` (the same module the
 * 8 daily scrapers pass into `page.evaluate`) so the test can never drift from
 * the scrapers.
 *
 * Run from packages/backend:
 *   node_modules/.bin/ts-node src/services/tapologyFightExtraction.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  FIGHT_CARD_CONTAINER_SELECTOR,
  FIGHT_ROW_SELECTOR,
} = require('./tapologyFightExtraction');

const FIXTURE = path.join(__dirname, '__fixtures__', 'tapology-event-zuffa-137070.html');

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(`FAIL: ${msg}`);
}
function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    failures.push(`FAIL: ${msg}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
  }
}

interface ExtractResult {
  fights: string[]; // "A vs B" pairKey labels
  containerMissing: boolean;
}

/**
 * Mirror of the in-browser extraction traversal, using the SHARED selectors.
 * `scoped=true` reproduces the new fail-closed scrapers; `scoped=false`
 * reproduces the old page-wide bug for comparison.
 */
function extractFights($: cheerio.CheerioAPI, scoped: boolean): ExtractResult {
  let $rows: cheerio.Cheerio<any>;
  if (scoped) {
    const $container = $(FIGHT_CARD_CONTAINER_SELECTOR);
    if ($container.length === 0) return { fights: [], containerMissing: true };
    $rows = $container.find(FIGHT_ROW_SELECTOR);
  } else {
    $rows = $(FIGHT_ROW_SELECTOR);
  }

  const fights: string[] = [];
  const processedPairs = new Set<string>();

  $rows.each((_, li) => {
    const $li = $(li);
    if ($li.closest('nav, header, footer, aside').length) return;

    const links: { name: string; url: string }[] = [];
    const seen = new Set<string>();
    $li.find('a[href*="/fightcenter/fighters/"]').each((__, a) => {
      const name = $(a).text().trim();
      const url = $(a).attr('href') || '';
      if (!name || name.length < 3 || seen.has(url)) return;
      seen.add(url);
      links.push({ name, url });
    });
    if (links.length < 2) return;

    const pairKey = [links[0].url, links[1].url].sort().join('|');
    if (processedPairs.has(pairKey)) return;
    processedPairs.add(pairKey);
    fights.push(`${links[0].name} vs ${links[1].name}`);
  });

  return { fights, containerMissing: false };
}

const BLEED_LI =
  `<li class="border-b border-dotted border-tap_6">` +
  `<a href="/fightcenter/fighters/12345-tyson-fury">Tyson Fury</a>` +
  `<a href="/fightcenter/fighters/67890-arslanbek-makhmudov">Arslanbek Makhmudov</a>` +
  `</li>`;

function run() {
  const html = fs.readFileSync(FIXTURE, 'utf8');

  // 1. Selectors are non-empty strings (guards against an accidental wipe).
  assert(typeof FIGHT_CARD_CONTAINER_SELECTOR === 'string' && FIGHT_CARD_CONTAINER_SELECTOR.length > 0,
    'FIGHT_CARD_CONTAINER_SELECTOR is a non-empty string');
  assert(/data-event-view-toggle-target/.test(FIGHT_CARD_CONTAINER_SELECTOR),
    'container selector targets the Stimulus list view');

  // 2. Clean real fixture: scoped extraction returns the true card.
  const clean = extractFights(cheerio.load(html), true);
  assert(!clean.containerMissing, 'clean fixture: container found');
  assertEq(clean.fights.length, 8, 'clean fixture: 8 fights extracted');
  assert(clean.fights[0] === 'Callum Walsh vs Carlos Ocampo',
    `clean fixture: headliner is Walsh vs Ocampo (got "${clean.fights[0]}")`);
  assert(!clean.fights.some(f => /Fury|Makhmudov/.test(f)),
    'clean fixture: no bleed names present');

  // 3. Polluted fixture: inject a bleed bout OUTSIDE the container, at end of <body>.
  const $p = cheerio.load(html);
  $p('body').append(BLEED_LI);
  const pageWide = extractFights($p, false); // old buggy behavior
  const scoped = extractFights($p, true);    // new behavior

  assert(pageWide.fights.some(f => /Fury/.test(f)),
    'polluted fixture: page-wide extraction PICKS UP the bleed bout (reproduces the bug)');
  assertEq(pageWide.fights.length, 9, 'polluted fixture: page-wide sees 9 (8 real + 1 bleed)');

  assertEq(scoped.fights.length, 8, 'polluted fixture: scoped extraction still 8 (bleed excluded)');
  assert(!scoped.fights.some(f => /Fury|Makhmudov/.test(f)),
    'polluted fixture: scoped extraction contains NO bleed bout');

  // 4. Missing container (Tapology layout change): fail CLOSED — 0 fights.
  const $m = cheerio.load(html);
  $m(FIGHT_CARD_CONTAINER_SELECTOR).removeAttr('data-event-view-toggle-target');
  const missing = extractFights($m, true);
  assert(missing.containerMissing, 'missing container: flagged containerMissing');
  assertEq(missing.fights.length, 0, 'missing container: fail-closed to 0 fights (no page-wide fallback)');

  // Report
  if (failures.length === 0) {
    console.log('\n✅ tapologyFightExtraction: all assertions passed.');
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures.length} assertion(s) failed:\n`);
    failures.forEach(f => console.error(f));
    process.exit(1);
  }
}

run();
