/**
 * Unit test for the Tapology hub-page event matcher (`tapologyEventMatcher.ts`).
 *
 * Calibrated on the REAL 2026-07-24 incident (RIZIN Landmark 15 cross-linked
 * to Landmark 13's Tapology page, importing its whole card) plus the actual
 * prod URL shapes the numeric guard must NOT break: number-less Zuffa Boxing
 * slugs, roman-numeral MVP slugs, and opponent-change slugs.
 *
 * Run from packages/backend:
 *   npx tsx src/utils/tapologyEventMatcher.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import { matchTapologyEventLink, TapologyEventLink } from './tapologyEventMatcher';

let failures = 0;
function check(desc: string, eventName: string, links: TapologyEventLink[], expectSlug: string | null): void {
  const m = matchTapologyEventLink(eventName, links);
  const got = m ? m.url.split('/').pop() : null;
  if (got === expectSlug) {
    console.log(`  ✓ ${desc}`);
  } else {
    failures++;
    console.error(`  ✗ ${desc} — got ${got}, want ${expectSlug}`);
  }
}

const E = 'https://www.tapology.com/fightcenter/events';

const rizinHub: TapologyEventLink[] = [
  { name: 'RIZIN LANDMARK 13 in FUKUOKA', url: `${E}/137827-rizin-landmark-13-in-fukuoka` },
  { name: 'RIZIN LANDMARK 14 in SENDAI', url: `${E}/140753-rizin-landmark-14-in-sendai` },
  { name: 'RIZIN LANDMARK 15 in HIROSHIMA', url: `${E}/140754-rizin-landmark-15-in-hiroshima` },
  { name: 'RIZIN 52', url: `${E}/141000-rizin-52` },
];

// The incident class: numbered series must never cross-link.
check('Landmark 15 picks its own page (2026-07-24 incident)', 'Rizin FF - Landmark Vol. 15', rizinHub, '140754-rizin-landmark-15-in-hiroshima');
check('Landmark 13 picks its own page', 'Rizin FF - Landmark Vol. 13', rizinHub, '137827-rizin-landmark-13-in-fukuoka');
check('Rizin 52 by number', 'Rizin FF 52', rizinHub, '141000-rizin-52');
check('Absent Landmark 16 matches nothing', 'Rizin FF - Landmark Vol. 16', rizinHub, null);

// Real prod shapes that must keep matching despite the guard.
const zuffaHub: TapologyEventLink[] = [
  { name: 'Zuffa Boxing: Walsh vs. Ocampo', url: `${E}/137070-zuffa-boxing` },
  { name: 'Zuffa Boxing: Berlanga vs. Butler', url: `${E}/142881-zuffa-boxing` },
  { name: 'Zuffa Boxing: McKenny vs. Oliha', url: `${E}/144122-zuffa-boxing` },
];
check('Zuffa 10 disambiguated by fighter names in link text', 'Zuffa Boxing 10: McKenny vs. Oliha', zuffaHub, '144122-zuffa-boxing');
check('Zuffa 9 disambiguated by fighter names in link text', 'Zuffa Boxing 9: Berlanga vs. Butler', zuffaHub, '142881-zuffa-boxing');
check('Ambiguous generic slugs refuse to guess', 'Zuffa Boxing 11', zuffaHub, null);

check('Roman-numeral slug counts as its number', 'MVP Showcase 2', [
  { name: 'MVP Showcase II', url: `${E}/136826-mvp-showcase-ii` },
  { name: 'MVP Showcase III', url: `${E}/139999-mvp-showcase-iii` },
], '136826-mvp-showcase-ii');

check('Roman rematch numeral + series number both present', 'Han vs. Holm 2', [
  { name: 'MVPW 03: Han vs. Holm II', url: `${E}/140777-han-vs-holm-ii-mvpw-03` },
], '140777-han-vs-holm-ii-mvpw-03');

check('Number-less slug still matches numbered rematch', 'Taylor vs. Serrano 3', [
  { name: 'Taylor vs. Serrano', url: `${E}/125176-taylor-vs-serrano` },
], '125176-taylor-vs-serrano');

check('No-number name matches single link', 'Some Show', [
  { name: 'Some Show', url: `${E}/1-some-show` },
], '1-some-show');

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll tapologyEventMatcher tests passed');
