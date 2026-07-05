/**
 * Copy rendering for taste insights.
 *
 * Locked copy rules (identity-platform.md 2026-06-09; sublines reworked
 * 2026-06-12 round 4; full voice pass 2026-07-04 per Good_Fights_Voice_Guide):
 *   - Human, non-statistical HEADLINE ("You love wars").
 *   - The SUBLINE is human and colloquial too — NO numbers anywhere (Mike,
 *     2026-06-12: "the numbers are too confusing for a new user"). It
 *     elaborates the headline in plain fan language; the raw stats stay on
 *     the candidate's `stats` for debugging and pilot review.
 *   - VOICE (Good_Fights_Voice_Guide, root; register tuned 2026-07-04 after
 *     Mike's on-device read "too dramatic, I can barely tell what they're
 *     saying"): the narrator is still the friend, but DESCRIPTIVE beats
 *     clever — every line must be instantly parseable. The headline makes a
 *     plain claim; the subline says what the ratings actually show. Concrete
 *     proof now lives in the separate `evidence` line ("Because you liked
 *     Max Holloway vs Justin Gaethje"), so sublines don't have to strain for
 *     punch. Still banned: hedging ("might", "tends to", "seem to"),
 *     customer-service cheer ("go home happy", "never lets you down"), app
 *     self-reference, "their" for a named fighter.
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
    'You live for {X}',
    '{Xcap} top your scorecard',
  ],
  cold: [
    'Cold on {X}',
    '{Xcap} leave you flat',
    "{Xcap} don't do it for you",
    'Not your thing: {X}',
  ],
  'community-high': [
    'You rate {X} higher than {community}',
    'You see more in {X} than {community}',
    '{Xcap} get extra credit from you',
    'You out-rate {community} on {X}',
  ],
  'community-low': [
    "You're harder on {X} than {community}",
    'You rate {X} lower than {community}',
    '{Xcap} have to earn it with you',
  ],
  'rating-bias-high': [
    'You grade kinder than {community}',
    'A generous grader',
    'You find the good in a fight',
  ],
  'rating-bias-low': [
    "You're a tough grader",
    'You grade harder than {community}',
    'You make fights earn every point',
  ],
  prefers: [
    'You take {X} over {Y}',
    '{Xcap} over {Y}, every time',
    '{Xcap} first, {Y} second',
  ],
  'era-lean': [
    "You're {eraFan}",
    'Your taste runs {eraAdj}',
    '{eraWinsCap} hit different for you',
  ],
  'rates-high': [
    '{Xcap} score big with you',
    '{Xcap} bring out your high scores',
    'Your best nights have {X} in them',
  ],
  'fighter-love': [
    '{name} never misses for you',
    '{name} keeps earning your high scores',
    'You show up for {name} fights',
  ],
  'fighter-rec': [
    'Watch {name}',
    '{name} is your kind of fighter',
    '{name} belongs on your radar',
  ],
  'never-above': [
    "There's a ceiling on {X} for you",
    'Your top shelf has no room for {X}',
    '{Xcap} never crack your top scores',
  ],
  'all-high': [
    '{Xcap} never miss for you',
    '{Xcap}: a perfect record with you',
  ],
  'all-tens-share': [
    'Your perfect scores have one thing in common: {X}',
    'Every masterpiece on your list features {X}',
  ],
  'fighter-style': [
    "You're drawn to {X}",
    'Your kind of fighter: {X}',
    '{Xcap} are your people',
  ],
  'fighter-appeal': [
    'What pulls you in: {X}',
    '{Xcap} get your attention every time',
    'Your weakness: {X}',
  ],
  'fighter-persona': [
    "You've got a soft spot for {X}",
    '{Xcap} win you over',
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
// DESCRIPTIVE register (Mike, 2026-07-04): the subline says what the ratings
// actually show, in words a new user parses instantly. The concrete fights
// live in the separate evidence line, so no straining for punch here.
const SUBLINES: Record<InsightKind, readonly string[]> = {
  loves: [
    'These keep landing at the top of your scorecard.',
    'Fights like this pull your highest scores.',
  ],
  cold: [
    'They keep landing near the bottom of your scorecard.',
    'Something about them never lands for you.',
  ],
  'community-high': [
    'You score these higher than most fans do.',
    'Fights {communityS} shrugs at, you rate up.',
  ],
  'community-low': [
    'You score these lower than {community} does.',
    'These have to work harder to win you over.',
  ],
  'rating-bias-high': [
    'You hand out high scores more freely than {community}.',
    'You look for reasons to like a fight.',
  ],
  'rating-bias-low': [
    'You hand out high scores less freely than {community}.',
    'A high score from you has to be earned.',
  ],
  prefers: [
    'Your scores for {X} run well above your scores for {Y}.',
    '{Ycap} are fine. {Xcap} are why you watch.',
  ],
  'era-lean': [
    'Your highest scores keep coming from {eraWins}.',
    '{eraWinsCap} keep outscoring {eraLoses} on your card.',
  ],
  'rates-high': [
    'These keep showing up among your top-rated fights.',
    'When a card gives you {X}, your scores climb.',
  ],
  'fighter-love': [
    'You rated almost every {name} fight high.',
    '{name} fights keep landing at the top of your scorecard.',
  ],
  'fighter-rec': [
    'You rate {recList} high. {name} fights exactly that way.',
    'Your favorite fights keep featuring {recList}. {name} brings that.',
  ],
  'never-above': [
    "You keep watching them, but none has cracked your top scores yet.",
    'Plenty rated. None rated great.',
  ],
  'all-high': [
    'Every one you rated, you rated high.',
    "You haven't scored a single one low.",
  ],
  'all-tens-share': [
    'Every fight you gave your top score has this in it.',
    'Your all-time favorites all share this.',
  ],
  'fighter-style': [
    'It shows in the fighters you rate highest and follow: {names}.',
    'Fighters like {names} keep pulling you in.',
  ],
  'fighter-appeal': [
    'The fighters you keep coming back to all bring it: {names}.',
    "It's why {names} keep showing up in your ratings.",
  ],
  'fighter-persona': [
    'The fighters you back keep fitting this type, {names} first.',
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
