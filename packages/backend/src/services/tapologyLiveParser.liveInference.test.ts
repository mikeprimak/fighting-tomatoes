/**
 * Contract test for the Tapology LIVE inference.
 *
 * Tapology publishes no live marker, so the running bout is inferred purely
 * from timing (see decideLiveFight). These assertions pin the rules that
 * matter, with no DB and no network:
 *
 *   - the running bout is the first non-COMPLETED fight in DESCENDING
 *     orderOnCard (cards run main-event-last)
 *   - it goes LIVE 5 min after the previous result was detected
 *   - the opening bout falls back to the card's earliest start time, but only
 *     once the event itself is LIVE
 *   - a stale anchor (card over or stalled) never produces a LIVE flip
 *   - a stray LIVE bout that is no longer current gets demoted
 *
 * Run: npx tsx src/services/tapologyLiveParser.liveInference.test.ts
 */

import { decideLiveFight, LiveInferenceFight, LiveInferenceEvent } from './tapologyLiveParser';

const NOW = new Date('2026-07-27T02:00:00Z').getTime();
const MIN = 60 * 1000;

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function fight(
  order: number,
  status: string,
  completedMinsAgo: number | null = null,
): LiveInferenceFight {
  return {
    id: `f${order}`,
    orderOnCard: order,
    fightStatus: status,
    completedAt: completedMinsAgo === null ? null : new Date(NOW - completedMinsAgo * MIN),
    label: `bout${order}`,
  };
}

const liveEvent: LiveInferenceEvent = { eventStatus: 'LIVE' };

console.log('\n[test] Tapology LIVE inference\n');

// --- 1. Running bout is the highest UPCOMING order below the completed ones ---
{
  // 8 fights, ord 8/7/6 done (they happen first), ord 5 is next in the ring.
  const fights = [
    fight(8, 'COMPLETED', 60), fight(7, 'COMPLETED', 40), fight(6, 'COMPLETED', 20),
    fight(5, 'UPCOMING'), fight(4, 'UPCOMING'), fight(1, 'UPCOMING'),
  ];
  const d = decideLiveFight(fights, liveEvent, NOW);
  check('picks the next bout in descending order (ord 5, not ord 1)',
    d.goLive?.orderOnCard === 5, `got ${d.goLive?.orderOnCard}`);
  check('reports the anchor as the previous result',
    d.anchorKind === 'previous result', `got ${d.anchorKind}`);
  check('anchors on the MOST RECENT completion (20m, not 60m)',
    Math.round((d.anchorAgeMs ?? 0) / MIN) === 20, `got ${(d.anchorAgeMs ?? 0) / MIN}m`);
}

// --- 2. The 5-minute delay ---
{
  const at = (mins: number) => decideLiveFight(
    [fight(8, 'COMPLETED', mins), fight(7, 'UPCOMING')], liveEvent, NOW,
  );
  check('4m after the result: still waiting', at(4).reason === 'waiting');
  check('5m after the result: goes LIVE', at(5).reason === 'live');
  check('30m after the result: still LIVE (not expired)', at(30).reason === 'live');
}

// --- 3. Opening bout falls back to the card start time ---
{
  const start = new Date(NOW - 10 * MIN);
  const fights = [fight(8, 'UPCOMING'), fight(7, 'UPCOMING')];

  const d = decideLiveFight(fights, { eventStatus: 'LIVE', mainStartTime: start }, NOW);
  check('opening bout goes LIVE 10m after card start',
    d.goLive?.orderOnCard === 8 && d.anchorKind === 'card start time');

  const early = decideLiveFight(
    fights, { eventStatus: 'LIVE', mainStartTime: new Date(NOW - 2 * MIN) }, NOW,
  );
  check('opening bout waits inside the 5m window', early.reason === 'waiting');

  const notLive = decideLiveFight(fights, { eventStatus: 'UPCOMING', mainStartTime: start }, NOW);
  check('start time is ignored while the event is still UPCOMING',
    notLive.reason === 'no-anchor', `got ${notLive.reason}`);

  const noTimes = decideLiveFight(fights, { eventStatus: 'LIVE' }, NOW);
  check('no start time at all: no inference', noTimes.reason === 'no-anchor');

  const earliest = decideLiveFight(fights, {
    eventStatus: 'LIVE',
    prelimStartTime: new Date(NOW - 90 * MIN),
    mainStartTime: new Date(NOW - 30 * MIN),
  }, NOW);
  check('uses the EARLIEST section start time',
    Math.round((earliest.anchorAgeMs ?? 0) / MIN) === 90, `got ${(earliest.anchorAgeMs ?? 0) / MIN}m`);
}

// --- 4. Stale anchor: a stalled or finished card must not claim a live bout ---
{
  const d = decideLiveFight(
    [fight(8, 'COMPLETED', 4 * 60), fight(7, 'UPCOMING')], liveEvent, NOW,
  );
  check('4h-old result does not flip anything LIVE',
    d.goLive === null && d.reason === 'stale-anchor', `got ${d.reason}`);
}

// --- 5. Idempotence and completion ---
{
  const already = decideLiveFight(
    [fight(8, 'COMPLETED', 30), fight(7, 'LIVE')], liveEvent, NOW,
  );
  check('a bout already LIVE is left alone',
    already.goLive === null && already.reason === 'already-live' && already.demote.length === 0);

  const done = decideLiveFight(
    [fight(8, 'COMPLETED', 30), fight(7, 'COMPLETED', 10)], liveEvent, NOW,
  );
  check('a fully completed card marks nothing LIVE',
    done.goLive === null && done.reason === 'card-over');
}

// --- 6. Stray LIVE demotion ---
{
  // ord 6 is stuck LIVE but ord 5 is the real current bout.
  const d = decideLiveFight([
    fight(8, 'COMPLETED', 40), fight(7, 'COMPLETED', 20), fight(6, 'LIVE'),
    fight(5, 'UPCOMING'),
  ], liveEvent, NOW);
  check('the earlier LIVE bout is the current one, so nothing is demoted',
    d.demote.length === 0 && d.goLive === null && d.reason === 'already-live');

  // Now ord 6 completed but a LATER bout was wrongly left LIVE.
  const d2 = decideLiveFight([
    fight(8, 'COMPLETED', 40), fight(7, 'COMPLETED', 20), fight(6, 'COMPLETED', 10),
    fight(5, 'UPCOMING'), fight(4, 'LIVE'),
  ], liveEvent, NOW);
  check('a stray LIVE bout that is not current gets demoted',
    d2.demote.length === 1 && d2.demote[0].orderOnCard === 4,
    `demoted ${d2.demote.map(f => f.orderOnCard).join(',')}`);
  check('and the real current bout still goes LIVE',
    d2.goLive?.orderOnCard === 5, `got ${d2.goLive?.orderOnCard}`);
}

// --- 7. Cancelled bouts are skipped, not treated as the running fight ---
{
  const d = decideLiveFight([
    fight(8, 'COMPLETED', 20), fight(7, 'CANCELLED'), fight(6, 'UPCOMING'),
  ], liveEvent, NOW);
  check('a CANCELLED bout is never marked LIVE',
    d.goLive?.orderOnCard === 6, `got ${d.goLive?.orderOnCard}`);
}

console.log(`\n[test] ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
