/**
 * Assertion test for pflLiveScraper. Hits two live URLs:
 *   - pfl-belfast-2026 (completed Apr 16, 2026): expect 12 fights, all complete,
 *     methods in {KO,TKO,SUB,DEC}, every fight has winnerSide+round+time.
 *   - pfl-sioux-falls-2026 (upcoming): expect 12 fights, all upcoming.
 *
 * Also exercises pure helpers (normalizePFLMethod, parseRoundTime,
 * parsePFLFighterName).
 *
 * Run from packages/backend:
 *   node_modules/.bin/ts-node src/services/pflLiveScraper.test.ts
 *
 * Exit 0 = all asserts passed, 1 = any failure.
 */

import {
  PFLLiveScraper,
  normalizePFLMethod,
  parseRoundTime,
  parsePFLFighterName,
} from './pflLiveScraper';

const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(`FAIL: ${msg}`);
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    failures.push(`FAIL: ${msg}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
  }
}

// ============== UNIT TESTS ==============

function testHelpers() {
  console.log('\n=== Unit tests ===');

  // normalizePFLMethod
  assertEq(normalizePFLMethod('KO'), 'KO', 'normalizePFLMethod KO');
  assertEq(normalizePFLMethod('TKO'), 'TKO', 'normalizePFLMethod TKO');
  assertEq(normalizePFLMethod('Submission'), 'SUB', 'normalizePFLMethod Submission');
  assertEq(normalizePFLMethod('Decision'), 'DEC', 'normalizePFLMethod Decision');
  assertEq(normalizePFLMethod('decision'), 'DEC', 'normalizePFLMethod lowercase');
  assertEq(normalizePFLMethod(''), undefined, 'normalizePFLMethod empty');
  assertEq(normalizePFLMethod(undefined), undefined, 'normalizePFLMethod undefined');
  assertEq(normalizePFLMethod('No Contest'), 'NC', 'normalizePFLMethod NC');
  assertEq(normalizePFLMethod('Draw'), 'DRAW', 'normalizePFLMethod Draw');

  // parseRoundTime — handles both formats observed across events
  const rt1 = parseRoundTime('R1 0:37');
  assertEq(rt1.round, 1, 'parseRoundTime R1 0:37 round');
  assertEq(rt1.time, '0:37', 'parseRoundTime R1 0:37 time');

  const rt2 = parseRoundTime('R1, 2:09');
  assertEq(rt2.round, 1, 'parseRoundTime R1, 2:09 round');
  assertEq(rt2.time, '2:09', 'parseRoundTime R1, 2:09 time');

  const rt3 = parseRoundTime('R3 5:00');
  assertEq(rt3.round, 3, 'parseRoundTime R3 5:00 round');
  assertEq(rt3.time, '5:00', 'parseRoundTime R3 5:00 time');

  assertEq(parseRoundTime('').round, undefined, 'parseRoundTime empty');
  assertEq(parseRoundTime(undefined).round, undefined, 'parseRoundTime undefined');

  // parsePFLFighterName — URL slug preferred over display
  const n1 = parsePFLFighterName('Wilson', 'https://pflmma.com/fighter/jay-jay-wilson');
  assertEq(n1.firstName, 'Jay', 'parsePFLFighterName slug firstName');
  assertEq(n1.lastName, 'Jay Wilson', 'parsePFLFighterName slug lastName');

  const n2 = parsePFLFighterName('Darragh Kelly', 'https://pflmma.com/fighter/darragh-kelly');
  assertEq(n2.firstName, 'Darragh', 'parsePFLFighterName basic firstName');
  assertEq(n2.lastName, 'Kelly', 'parsePFLFighterName basic lastName');

  // Display-name fallback
  const n3 = parsePFLFighterName('Chequina Noso Pedro');
  assertEq(n3.firstName, 'Chequina', 'parsePFLFighterName display firstName');
  assertEq(n3.lastName, 'Noso Pedro', 'parsePFLFighterName display lastName');

  console.log(`  helpers: ${failures.length === 0 ? 'OK' : `${failures.length} failures so far`}`);
}

// ============== INTEGRATION TESTS ==============

async function testCompletedEvent() {
  console.log('\n=== Integration: pfl-belfast-2026 (completed) ===');
  const scraper = new PFLLiveScraper('https://pflmma.com/event/pfl-belfast-2026');
  try {
    const data = await scraper.scrape();

    assertEq(data.status, 'complete', 'belfast event status');
    assertEq(data.isComplete, true, 'belfast isComplete');
    assertEq(data.hasStarted, true, 'belfast hasStarted');
    assertEq(data.fights.length, 12, 'belfast fight count');

    const validMethods = new Set(['KO', 'TKO', 'SUB', 'DEC']);
    let allHaveResults = true;
    for (const f of data.fights) {
      if (!f.isComplete) {
        failures.push(`FAIL: belfast fight #${f.order} not complete`);
        allHaveResults = false;
        continue;
      }
      if (!f.result) {
        failures.push(`FAIL: belfast fight #${f.order} missing result`);
        allHaveResults = false;
        continue;
      }
      if (!f.result.winnerSide || !['A', 'B'].includes(f.result.winnerSide)) {
        failures.push(`FAIL: belfast fight #${f.order} missing winnerSide`);
        allHaveResults = false;
      }
      if (!f.result.method || !validMethods.has(f.result.method)) {
        failures.push(`FAIL: belfast fight #${f.order} method "${f.result.method}" not in {${[...validMethods].join(',')}}`);
        allHaveResults = false;
      }
      if (!f.result.round || f.result.round < 1) {
        failures.push(`FAIL: belfast fight #${f.order} missing round`);
        allHaveResults = false;
      }
      if (!f.result.time || !/^\d+:\d{2}$/.test(f.result.time)) {
        failures.push(`FAIL: belfast fight #${f.order} bad time "${f.result.time}"`);
        allHaveResults = false;
      }
      if (!f.fighterA.firstName && !f.fighterA.lastName) {
        failures.push(`FAIL: belfast fight #${f.order} fighterA has no name`);
      }
      if (!f.fighterB.firstName && !f.fighterB.lastName) {
        failures.push(`FAIL: belfast fight #${f.order} fighterB has no name`);
      }
      if (!f.fighterA.athleteUrl || !f.fighterB.athleteUrl) {
        failures.push(`FAIL: belfast fight #${f.order} missing athleteUrl`);
      }
      if (!f.fighterA.pflFighterId || !f.fighterB.pflFighterId) {
        failures.push(`FAIL: belfast fight #${f.order} missing pflFighterId`);
      }
    }
    assert(allHaveResults, 'belfast all fights have valid results');

    // Spot-check fight #1 (the lead fight on the card)
    const f1 = data.fights.find(f => f.order === 1);
    assert(!!f1, 'belfast has fight #1');
    if (f1) {
      assertEq(f1.result?.winnerSide, 'B', 'belfast fight #1 winnerSide (Wilson won)');
      assertEq(f1.result?.method, 'KO', 'belfast fight #1 method');
      assertEq(f1.result?.round, 1, 'belfast fight #1 round');
      assertEq(f1.result?.time, '0:37', 'belfast fight #1 time');
    }

    // Order numbers should be unique 1..12
    const orders = data.fights.map(f => f.order).sort((a, b) => a - b);
    assertEq(JSON.stringify(orders), JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'belfast order numbers');
  } finally {
    await scraper.stop();
  }
}

async function testUpcomingEvent() {
  console.log('\n=== Integration: pfl-sioux-falls-2026 (upcoming) ===');
  const scraper = new PFLLiveScraper('https://pflmma.com/event/pfl-sioux-falls-2026');
  try {
    const data = await scraper.scrape();

    assertEq(data.status, 'upcoming', 'sioux falls status');
    assertEq(data.isComplete, false, 'sioux falls isComplete');
    assertEq(data.hasStarted, false, 'sioux falls hasStarted');
    assert(data.fights.length >= 10, `sioux falls fight count >= 10 (got ${data.fights.length})`);

    for (const f of data.fights) {
      if (f.isComplete) {
        failures.push(`FAIL: sioux falls fight #${f.order} marked complete`);
      }
      if (f.isLive) {
        failures.push(`FAIL: sioux falls fight #${f.order} marked live`);
      }
      if (f.result) {
        failures.push(`FAIL: sioux falls fight #${f.order} has unexpected result`);
      }
      if (!f.fighterA.athleteUrl || !f.fighterB.athleteUrl) {
        failures.push(`FAIL: sioux falls fight #${f.order} missing athleteUrl`);
      }
    }
  } finally {
    await scraper.stop();
  }
}

(async () => {
  testHelpers();
  await testCompletedEvent();
  await testUpcomingEvent();

  console.log('\n=== RESULTS ===');
  if (failures.length === 0) {
    console.log('✅ All assertions passed.');
    process.exit(0);
  } else {
    console.log(`❌ ${failures.length} failure(s):`);
    failures.forEach(f => console.log(`  ${f}`));
    process.exit(1);
  }
})().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
