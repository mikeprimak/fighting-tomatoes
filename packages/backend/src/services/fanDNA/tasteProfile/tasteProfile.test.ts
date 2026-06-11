/**
 * Assert-based script test for the taste-profile engine (repo convention:
 * plain asserts, runnable via tsx, no jest globals).
 * Run: `npx tsx src/services/fanDNA/tasteProfile/tasteProfile.test.ts`
 *
 * Proves the agreed scoring model on a synthetic user:
 *   - community-compare beats self-contrast on the same token (war lover)
 *   - the "everyone likes knockouts" rarity filter suppresses common tastes
 *   - rare tastes (clinch wars) surface despite smaller samples
 *   - absolutes fire: never-above (decisions), all-tens-share (comebacks)
 *   - cold (negative) direction fires on a notable token
 *   - floors silence noise (small n, tiny gaps) — silence > filler
 *   - vocab-agnostic: an unknown future dimension flows through untouched
 *   - fighter axis fires with the locked sourcing weights, floors respected
 *   - copy renders human headlines with no leftover {placeholders}
 *   - fully deterministic for identical input
 */
import { FIGHT_CHARACTER_VOCAB } from '../../aiEnrichment/postFight/extractPostFightEnrichment';
import { computeTasteProfile } from './index';
import { commonness, rarityMultiplier } from './priors';
import { scoreSelfContrast } from './surprise';
import { humanize, tokenPhrase } from './tokenLabels';
import type { FighterInput, RatedFightInput } from './types';

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(`FAIL: ${msg}`);
}

// ── synthetic dataset ──────────────────────────────────────────────────────

let fid = 0;
function fight(
  rating: number,
  dims: RatedFightInput['dims'],
  community?: { avg: number; n: number },
): RatedFightInput {
  return {
    fightId: `f${++fid}`,
    rating,
    dims,
    communityAvg: community?.avg ?? null,
    communityN: community?.n ?? 0,
  };
}

function buildFights(): RatedFightInput[] {
  const fights: RatedFightInput[] = [];
  // 100 filler fights at the baseline, community agreeing with the user —
  // they anchor the GLOBAL community-delta baseline near zero. Their token
  // ("steady") must stay silent.
  for (let i = 0; i < 100; i++)
    fights.push(fight(7, { pace: 'steady' }, { avg: 7.0, n: 10 }));
  // War lover, AND the community agrees much less: user runs 1.8 above the
  // crowd on wars vs ~0.3 globally — the adjusted gap is the signal.
  for (let i = 0; i < 20; i++)
    fights.push(fight(9, { actionLevel: 'war' }, { avg: 7.2, n: 10 }));
  // Rare taste: clinch wars, all rated 9.
  for (let i = 0; i < 12; i++) fights.push(fight(9, { phase: 'clinch_war' }));
  // Common taste: knockouts at a modest gap (avg 8, mixed 7/8/9) — must be
  // rarity-suppressed. Varied so the all-high absolute can't ride around the
  // rarity filter on artificially uniform data.
  for (let i = 0; i < 30; i++)
    fights.push(fight(7 + (i % 3), { appeals: ['knockout'] }));
  // Never-above absolute: 20 decisions, never above a 7.
  for (let i = 0; i < 20; i++)
    fights.push(fight(i % 2 === 0 ? 6 : 7, { finish: 'decision' }));
  // All-tens-share: the user's ONLY perfect scores, all carrying "comeback".
  for (let i = 0; i < 5; i++) fights.push(fight(10, { drama: 'comeback' }));
  // Cold direction on a notable token: dominance leaves this user flat.
  for (let i = 0; i < 12; i++) fights.push(fight(5.5, { drama: 'dominance' }));
  // Correlated-token cluster: the SAME 12 fights carry both low_action and
  // low_output (one story, two tokens) — cluster dedupe must keep exactly one.
  for (let i = 0; i < 12; i++)
    fights.push(fight(9, { actionLevel: 'low_action', letdowns: ['low_output'] }));
  // Vocab-agnostic: a dimension that does not exist in any taxonomy today.
  for (let i = 0; i < 14; i++) fights.push(fight(9, { crowdEnergy: 'electric' }));
  // Noise: strong rating but n=3 — below MIN_N, must be silent.
  for (let i = 0; i < 3; i++) fights.push(fight(9, { texture: 'awkward' }));
  return fights;
}

function buildFighters(): FighterInput[] {
  const out: FighterInput[] = [];
  // 10 pressure fighters the user genuinely loves (high-rated, one followed).
  // Every fighter also carries the same persona to prove the volume artifact
  // is dead: uniform affection across a persona must stay silent.
  const names = [
    'Gaethje', 'Chandler', 'Holloway', 'Lawler', 'Blachowicz',
    'Pereira', 'Burns', 'Moicano', 'Barboza', 'Fiziev',
  ];
  for (let i = 0; i < names.length; i++) {
    out.push({
      fighterId: `p${i}`,
      name: names[i],
      styleArchetype: ['pressure_fighter'],
      fighterAppeals: ['nonstop_action'],
      personaType: 'respected-veteran',
      followed: i === 0,
      highRatedCount: 3,
    });
  }
  // 15 counter strikers the user merely TOUCHED (rated, never high) — they
  // anchor the lift denominator. Volume must not read as taste.
  for (let i = 0; i < 15; i++) {
    out.push({
      fighterId: `c${i}`,
      name: `Counter${i}`,
      styleArchetype: ['counter_striker'],
      fighterAppeals: [],
      personaType: 'respected-veteran',
      highRatedCount: 0,
      ratedCount: 5,
    });
  }
  // Only 2 distinct loved wrestlers — below FIGHTER_MIN_DISTINCT, silent.
  out.push(
    {
      fighterId: 'w1',
      name: 'WrestlerOne',
      styleArchetype: ['wrestler'],
      fighterAppeals: [],
      followed: true,
      highRatedCount: 2,
    },
    {
      fighterId: 'w2',
      name: 'WrestlerTwo',
      styleArchetype: ['wrestler'],
      fighterAppeals: [],
      highRatedCount: 4,
    },
  );
  return out;
}

// ── integration ────────────────────────────────────────────────────────────

function run() {
  const input = {
    userId: 'user-1',
    fights: buildFights(),
    fighters: buildFighters(),
  };
  const result = computeTasteProfile(input);
  const keys = result.insights.map((i) => i.key);
  const byToken = (token: string) =>
    result.insights.find((i) => i.token === token);

  // 1. Community-compare wins the war token and ranks #1 overall.
  assert(
    keys[0] === 'community-high|actionLevel|war|high',
    `war community-high ranks #1 (got ${keys[0]})`,
  );

  // 2. Everyone-likes-knockouts filter: 30 fights at +0.5 stays silent.
  assert(!byToken('knockout'), 'common knockout taste is rarity-suppressed');

  // 3. Rare taste surfaces from a smaller sample.
  const clinch = byToken('clinch_war');
  assert(!!clinch && clinch.direction === 'high', 'clinch_war surfaces (rare taste)');

  // 4. Absolutes.
  assert(
    keys.includes('never-above|finish|decision|low'),
    'never-above fires on decisions',
  );
  assert(
    keys.includes('all-tens-share|drama|comeback|high'),
    'all-tens-share fires on comebacks',
  );

  // 5. Cold direction.
  assert(keys.includes('cold|drama|dominance|low'), 'cold fires on dominance');

  // 6. Vocab-agnostic: unknown dimension flows through and renders.
  const electric = byToken('electric');
  assert(!!electric, 'unknown dimension (crowdEnergy) emits an insight');
  assert(
    (electric?.headline ?? '').toLowerCase().includes('electric fights'),
    `unknown token humanizes in copy (got "${electric?.headline}")`,
  );

  // 7. Floors: filler token, sub-MIN_N token, and sub-floor fighters silent.
  assert(!byToken('steady'), 'baseline-hugging filler token stays silent');
  assert(!byToken('awkward'), 'n=3 token stays silent (MIN_N floor)');
  assert(!byToken('wrestler'), '2-fighter token stays silent (distinct floor)');

  // 7b. Volume artifact dead: every fighter shares a persona, affection is
  // spread exactly like viewing (lift ~1) → silent despite huge counts.
  assert(
    !byToken('respected-veteran'),
    'uniform persona across the pool stays silent (lift baseline)',
  );
  // Touched-but-never-loved token stays silent (zero affection weight).
  assert(!byToken('counter_striker'), 'touched-only token stays silent');

  // 7c. Correlated-token cluster collapses to ONE insight wearing the
  // cluster voice; the losing twin token is silent.
  const clusterHits = result.insights.filter(
    (i) => i.cluster === 'tension-watcher',
  );
  assert(
    clusterHits.length === 1,
    `cluster emits exactly one insight (got ${clusterHits.length})`,
  );
  assert(
    !!byToken('low_action') !== !!byToken('low_output'),
    'only one member of a token cluster survives dedupe',
  );

  // 8. Fighter axis fires with locked sourcing; followed fighter leads copy.
  const pf = result.insights.find(
    (i) => i.key === 'fighter-style|fighterStyle|pressure_fighter|high',
  );
  assert(!!pf, 'fighter-style pressure_fighter fires');
  assert(
    (pf?.stats.topFighters ?? [])[0] === 'Gaethje',
    'followed fighter carries the most weight and leads the copy',
  );

  // 9. Copy hygiene: human headline, no leftover placeholders, no dashes.
  for (const i of result.insights) {
    assert(i.headline.length > 0 && i.subline.length > 0, `copy non-empty (${i.key})`);
    assert(
      !/[{}]/.test(i.headline) && !/[{}]/.test(i.subline),
      `no leftover placeholders (${i.key}: "${i.headline}" / "${i.subline}")`,
    );
    assert(
      !/[—–]/.test(i.headline) && !/[—–]/.test(i.subline),
      `house style: no em/en dashes (${i.key})`,
    );
    assert(
      !/\d/.test(i.headline),
      `headline is human, number lives in subline (${i.key}: "${i.headline}")`,
    );
    // Plural community refs must never meet a singular verb ("most fans shrugs").
    assert(
      !/\b(fans|raters|us)\s+(checks|sees|shrugs|rates|tunes)\b/.test(
        `${i.headline} ${i.subline}`,
      ),
      `community ref verb agreement (${i.key}: "${i.headline}")`,
    );
  }

  // 10. Determinism: identical input → byte-identical output.
  const again = computeTasteProfile(input);
  assert(
    JSON.stringify(result) === JSON.stringify(again),
    'fully deterministic for identical input',
  );

  // 11. Rotation salt keeps output valid and deterministic per salt.
  const salted = computeTasteProfile({ ...input, rotationSalt: '2026-W24' });
  const saltedAgain = computeTasteProfile({ ...input, rotationSalt: '2026-W24' });
  assert(
    JSON.stringify(salted) === JSON.stringify(saltedAgain),
    'deterministic within a rotation salt',
  );
  assert(
    salted.insights.length === result.insights.length,
    'salt changes phrasing only, never the ranking',
  );

  // 12. Empty input degrades to silence, not a crash.
  const empty = computeTasteProfile({ userId: 'u2', fights: [] });
  assert(empty.insights.length === 0, 'empty input → no insights');
  assert(empty.signature.baseline.count === 0, 'empty input → empty baseline');

  // ── unit checks ──────────────────────────────────────────────────────────

  // Scorer floors.
  assert(
    scoreSelfContrast({ dimension: 'actionLevel', token: 'war', n: 7, delta: 2 }) ===
      null,
    'scoreSelfContrast returns null below MIN_N',
  );

  // Priors.
  assert(commonness('appeals', 'knockout', 'high') === 0.95, 'knockout prior set');
  assert(
    commonness('appeals', 'knockout', 'low') === 0.1,
    'cold-on-knockouts is rare (direction-aware prior)',
  );
  assert(
    commonness('madeUpDim', 'madeUpToken', 'high') === 0.45,
    'unknown token gets the default prior',
  );
  assert(rarityMultiplier(1) === 0.35 && rarityMultiplier(0) === 1, 'rarity bounds');

  // Labels: every taxonomy token renders a non-empty phrase; builders work.
  for (const [dim, tokens] of Object.entries(FIGHT_CHARACTER_VOCAB)) {
    for (const token of tokens as readonly string[]) {
      assert(
        tokenPhrase(dim, token).length > 0,
        `label resolves for ${dim}.${token}`,
      );
    }
  }
  assert(
    tokenPhrase('weightClass', 'WOMENS_STRAWWEIGHT') ===
      "women's strawweight fights",
    'weight-class builder handles the womens prefix',
  );
  assert(tokenPhrase('gender', 'FEMALE') === "women's fights", 'gender label');
  assert(humanize('one_punch_ko') === 'one punch ko', 'humanizer fallback');

  // ── report ───────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log(`All assertions passed (${result.insights.length} insights emitted).`);
  console.log('\nTop insights from the synthetic user:');
  for (const i of result.insights.slice(0, 8)) {
    console.log(`  [${i.score.toFixed(2)}] ${i.headline}`);
    console.log(`         ${i.subline}`);
  }
}

run();
