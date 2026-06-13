/**
 * Copy rendering for taste insights.
 *
 * Locked copy rules (identity-platform.md 2026-06-09; sublines reworked
 * 2026-06-12 round 4):
 *   - Human, non-statistical HEADLINE ("You love wars").
 *   - The SUBLINE is human and colloquial too — NO numbers anywhere (Mike,
 *     2026-06-12: "the numbers are too confusing for a new user"). It
 *     elaborates the headline in plain fan language; the raw stats stay on
 *     the candidate's `stats` for debugging and pilot review.
 *   - Deep pools per insight family + combinatorial specificity, picked
 *     deterministically (pickVariety) so a given insight is stable within a
 *     rotation period but spread across the pool between users/insights.
 *   - communityRef() for every "everyone else" mention — never "the room" tic.
 *   - House style: no em dashes or en dashes anywhere in user-facing strings.
 */
import {
  communityRef,
  communityRefSingular,
  pickVariety,
} from '../copy/communityRef';
import { cap, tokenPhrase } from './tokenLabels';
import type { InsightCandidate, InsightKind } from './types';

const HEADLINES: Record<InsightKind, readonly string[]> = {
  loves: [
    'You love {X}',
    '{Xcap} are your thing',
    'A certified fan of {X}',
    'You live for {X}',
    '{Xcap} speak to you',
    'Few things win you over like {X}',
  ],
  cold: [
    'Cold on {X}',
    '{Xcap} leave you flat',
    "You're a tough crowd for {X}",
    "{Xcap} don't do it for you",
    'Not your thing: {X}',
  ],
  'community-high': [
    'You see more in {X} than {community}',
    "You're higher on {X} than {community}",
    'Where {communityS} shrugs at {X}, you lean in',
    'You rate {X} extra high',
    '{Xcap} get extra credit from you',
    'You out-rate {community} on {X}',
  ],
  'community-low': [
    "You're harder on {X} than {community}",
    '{Xcap} get less love from you',
    'You hold {X} to a higher bar',
    '{Xcap} have to earn it with you',
  ],
  'rating-bias-high': [
    'You grade kinder than {community}',
    'A generous grader',
    'You find the good in a fight',
    'Your scores run warm',
  ],
  'rating-bias-low': [
    'You grade harder than {community}',
    'A tough grader',
    'You make fights earn every point',
    'Your scores run cool',
  ],
  prefers: [
    'You take {X} over {Y}',
    '{Xcap} over {Y}, every time',
    'Given the choice: {X}',
    '{Xcap} first, {Y} second',
    'Your heart picks {X}, not {Y}',
  ],
  'era-lean': [
    "You're {eraFan}",
    'Your taste runs {eraAdj}',
    '{eraWinsCap} hit different for you',
  ],
  'rates-high': [
    '{Xcap} score big with you',
    'You show up for {X}',
    '{Xcap} rarely disappoint you',
    '{Xcap} bring out your high scores',
    'Good nights usually involve {X}',
  ],
  'fighter-love': [
    'You seem to love {name} fights',
    'A {name} fight never misses for you',
    '{name} keeps earning your high scores',
    'When {name} fights, you watch happy',
  ],
  'fighter-rec': [
    'You might like {name}',
    '{name} looks like your kind of fighter',
    'One for your radar: {name}',
    'A name worth following: {name}',
  ],
  'never-above': [
    'Your top shelf has no room for {X}',
    "There's a ceiling on {X} for you",
    '{Xcap} never reach your summit',
    "You've yet to meet {X} worth raving about",
  ],
  'all-high': [
    '{Xcap} never miss for you',
    '{Xcap}: a perfect track record',
    "When it's {X}, you're all in",
    '{Xcap} have never let you down',
  ],
  'all-tens-share': [
    'Your perfect scores have one thing in common: {X}',
    'The road to your 10s runs through {X}',
    'Every masterpiece on your list features {X}',
  ],
  'fighter-style': [
    "You're drawn to {X}",
    '{Xcap} are your people',
    'Your kind of fighter: {X}',
    'You gravitate to {X}',
  ],
  'fighter-appeal': [
    'What pulls you in: {X}',
    "You can't look away from {X}",
    '{Xcap} get your attention every time',
    'Your weakness: {X}',
  ],
  'fighter-persona': [
    "You've got a soft spot for {X}",
    '{Xcap} win you over',
    'You keep ending up in the corner of {X}',
  ],
};

/**
 * Cluster-level headline voice. When an insight survives cluster dedupe it
 * speaks for the whole pattern, not its single winning token.
 *
 * Pools are keyed `cluster` (motive-NEUTRAL — claims only the behavior the
 * data proves) and `cluster|voice` (used only when the user's other tokens
 * corroborate that motivation; see CLUSTER_VOICES in insights.ts). The same
 * behavior has different whys: the 'tension' lines come from Mike's own
 * articulation at the pilot review (2026-06-11) — "I feel the tension, like
 * anything can happen, the entire fight, even if nothing is" — while the
 * 'chess' lines fit the fan who enjoys the calculations and the mental work.
 * Only `high` direction gets cluster voice; others fall back to kind pools.
 */
const CLUSTER_HEADLINES: Record<string, readonly string[]> = {
  'tension-watcher': [
    'You never give up on a slow fight',
    'Where {communityS} sees boring, you see more',
    'You stay locked in long after {communityS} checks out',
    'Slow fights have a way of keeping you',
  ],
  'tension-watcher|tension': [
    'You feel the tension even when nothing lands',
    'Anything can happen, and you watch like it will',
    'Where {communityS} sees boring, you see a fight about to happen',
    'You never stop waiting for the finish',
  ],
  'tension-watcher|chess': [
    'You appreciate the chess match {communityS} calls boring',
    'You watch the calculations, not just the action',
    'Two fighters thinking is still a fight to you',
    'You see the mental battle where {communityS} sees a stall',
  ],
};

// No numbers, no stats — plain fan language only (Mike, 2026-06-12 round 4).
const SUBLINES: Record<InsightKind, readonly string[]> = {
  loves: [
    'These keep landing at the top of your scorecard.',
    'Fights like this bring out your highest scores.',
    'Your ratings climb whenever a fight delivers this.',
  ],
  cold: [
    'They rarely crack your top scores.',
    'Something about them never quite lands for you.',
    'Your scores dip whenever a fight turns into this.',
  ],
  'community-high': [
    'You keep finding more in these than {community}.',
    'Fights {communityS} shrugs at, you score up.',
    'You see something here that {communityS} misses.',
  ],
  'community-low': [
    'These have to work harder to win you over.',
    'You hold them to a higher bar than {community}.',
    'What impresses {community} does not always impress you.',
  ],
  'rating-bias-high': [
    'You hand out high scores more freely than {community}.',
    'You look for reasons to like a fight, and usually find one.',
  ],
  'rating-bias-low': [
    'A high score from you has to be earned.',
    'You give out top marks less freely than {community}.',
  ],
  prefers: [
    'When it comes down to it, your scores pick {X}.',
    '{Ycap} are fine. {Xcap} are why you watch.',
    'Both have their nights, but {X} win yours.',
  ],
  'era-lean': [
    '{eraWinsCap} keep outscoring {eraLoses} in your book.',
    'Your highest scores keep coming from {eraWins}.',
  ],
  'rates-high': [
    'You love the nights that turn into {X}.',
    'Fights like this rarely let you down.',
    'When you get {X}, you go home happy.',
  ],
  'fighter-love': [
    'Their fights keep earning your highest scores.',
    'Almost every one you watched delivered for you.',
  ],
  'fighter-rec': [
    'Fits your taste for {recList}.',
    'Checks your boxes: {recList}.',
  ],
  'never-above': [
    'None of them have truly blown you away yet.',
    'You are still waiting for a great one.',
  ],
  'all-high': [
    'Every single one you rated delivered for you.',
    "You haven't met one you didn't like.",
  ],
  'all-tens-share': [
    "Every fight you've called perfect has this in it.",
    'Your all-time favorites all share this.',
  ],
  'fighter-style': [
    'The fighters you rate, hype, and follow keep proving it, {names} most of all.',
    'Fighters like {names} keep pulling you in.',
  ],
  'fighter-appeal': [
    'The fighters you gravitate to all bring this, {names} most of all.',
    'Fighters like {names} keep pulling you in.',
  ],
  'fighter-persona': [
    'The fighters you keep coming back to fit the mold, led by {names}.',
  ],
};

export interface RenderedCopy {
  headline: string;
  subline: string;
}

/**
 * Render one candidate. `seed` should bake in userId + insight key (+ optional
 * rotation salt) so phrasing is deterministic within a period but varies
 * across insights, users, and periods.
 */
export function renderInsight(c: InsightCandidate, seed: string): RenderedCopy {
  const phrase = tokenPhrase(c.dimension, c.token);
  const vsPhrase = c.stats.vsToken
    ? tokenPhrase(c.dimension, c.stats.vsToken)
    : '';
  // Era-lean speaks in era words, not token labels ("old school fights").
  const oldSchoolWins = c.token === 'old_school';
  const eraWins = oldSchoolWins ? 'the pre-2015 classics' : "today's fights";
  const eraLoses = oldSchoolWins ? "today's fights" : 'the old classics';
  const vars: Record<string, string> = {
    eraFan: oldSchoolWins ? 'an old-school fan' : 'a modern-era fan',
    eraAdj: oldSchoolWins ? 'old-school' : 'modern',
    eraWins,
    eraWinsCap: cap(eraWins),
    eraLoses,
    X: phrase,
    Xcap: cap(phrase),
    Y: vsPhrase,
    Ycap: cap(vsPhrase),
    avgB: fmt(c.stats.avgB),
    name: c.stats.topFighters?.[0] ?? '',
    highN: c.stats.highN != null ? String(c.stats.highN) : '',
    recList: (c.stats.recTokens ?? [])
      .map((t) => tokenPhrase(t.dimension, t.token))
      .join(' and '),
    community: communityRef(`${seed}|community`),
    communityS: communityRefSingular(`${seed}|community`),
    n: String(c.stats.n),
    avg: fmt(c.stats.avg),
    base: fmt(c.stats.baseline),
    delta: fmtAbsDelta(c),
    cap: c.stats.cap != null ? String(c.stats.cap) : '',
    tens: c.stats.tens != null ? String(c.stats.tens) : '',
    k: c.stats.fighterCount != null ? String(c.stats.fighterCount) : '',
    names: (c.stats.topFighters ?? []).join(' and '),
  };

  const clusterPool =
    c.cluster && c.direction === 'high'
      ? (c.voice && CLUSTER_HEADLINES[`${c.cluster}|${c.voice}`]) ||
        CLUSTER_HEADLINES[c.cluster]
      : undefined;
  const headlinePool = clusterPool || HEADLINES[c.kind];
  const headline = fill(pickVariety(headlinePool, `${seed}|h`), vars);
  const subline = fill(pickVariety(SUBLINES[c.kind], `${seed}|s`), vars);
  return { headline: cap(headline), subline };
}

/**
 * Subline delta is always shown as a magnitude; direction is in the words.
 * Community lines use the ADJUSTED delta (beyond the user's global gap) so
 * the number matches the direction the headline claims.
 */
function fmtAbsDelta(c: InsightCandidate): string {
  const d = c.stats.adjustedDelta ?? c.stats.deltaVsCommunity ?? c.stats.delta;
  return d != null ? Math.abs(d).toFixed(1) : '';
}

function fmt(n: number | undefined): string {
  return n != null ? n.toFixed(1) : '';
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}
