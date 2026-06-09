/**
 * Assert-based script test for the copy-variety toolkit (matches the repo's
 * existing .test.ts convention: plain asserts, runnable via tsx, no jest
 * globals). Run: `npx tsx src/services/fanDNA/copy/communityRef.test.ts`
 *
 * Proves the toolkit kills the "the room" repetition: deterministic per seed,
 * spread across the whole pool, "the room" demoted to one of many, and two
 * different insights for the same user don't echo the same community-word.
 */
import {
  COMMUNITY_REFS,
  communityRef,
  communityRefSubject,
  pickVariety,
  hashIndex,
} from './communityRef';

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(`FAIL: ${msg}`);
}

function run() {
  // Deterministic for a given seed.
  assert(
    communityRef('user-1|war-love') === communityRef('user-1|war-love'),
    'communityRef is deterministic for a given seed',
  );
  assert(
    pickVariety(['a', 'b', 'c'], 'x') === pickVariety(['a', 'b', 'c'], 'x'),
    'pickVariety is deterministic for a given seed',
  );

  // Spreads across the pool rather than collapsing to one or two phrasings.
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(communityRef(`user-${i}|insight`));
  assert(
    seen.size >= Math.ceil(COMMUNITY_REFS.length * 0.6),
    `communityRef spreads across the pool (saw ${seen.size}/${COMMUNITY_REFS.length})`,
  );

  // "the room" is one of many — well under a fifth of surfacings.
  let roomCount = 0;
  const N = 300;
  for (let i = 0; i < N; i++) if (communityRef(`u${i}|k`) === 'the room') roomCount++;
  assert(roomCount / N < 0.2, `"the room" is rare, not the default (was ${((roomCount / N) * 100).toFixed(1)}%)`);

  // Different insights for one user don't all echo the same word.
  const trio = new Set([
    communityRef('user-7|war-love'),
    communityRef('user-7|knockout-love'),
    communityRef('user-7|grappling-love'),
  ]);
  assert(trio.size > 1, "one user's three insights use more than one community-word");

  // Subject-position helper returns a real string.
  assert(communityRefSubject('seed').length > 0, 'communityRefSubject returns a non-empty string');

  // hashIndex stays in range and is empty-safe.
  assert(hashIndex('anything', 0) === 0, 'hashIndex is safe on empty pool');
  let inRange = true;
  for (let i = 0; i < 50; i++) {
    const idx = hashIndex(`s${i}`, 5);
    if (idx < 0 || idx >= 5) inRange = false;
  }
  assert(inRange, 'hashIndex stays within [0, length)');

  if (failures.length === 0) {
    console.log('\n✅ communityRef: all assertions passed.');
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures.length} assertion(s) failed:\n`);
    failures.forEach((f) => console.error(f));
    process.exit(1);
  }
}

run();
