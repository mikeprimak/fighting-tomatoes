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
 *   - VOICE (Good_Fights_Voice_Guide, root): the narrator is the friend who's
 *     been watching since Pride. The headline makes a claim; the subline adds
 *     proof, consequence, or a twist — never an echo. No hedging ("might",
 *     "tends to", "seem to"), no customer-service cheer ("go home happy",
 *     "never lets you down"), no app self-reference, no "their" for a named
 *     fighter. Half the lines want an enemy in them (the bike, the judges,
 *     the point-fighter). Reveal, don't report.
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
    '{Xcap} own your scorecard',
    'Nothing buys your score like {X}',
    "You'd clear a Tuesday for {X}",
  ],
  cold: [
    'Cold on {X}',
    '{Xcap} leave you flat',
    "{Xcap} don't do it for you",
    '{Xcap} get nothing from you',
    'You never bought {X}',
  ],
  'community-high': [
    'You see more in {X} than {community}',
    "You're higher on {X} than {community}",
    'Where {communityS} shrugs at {X}, you lean in',
    '{Xcap} get extra credit from you',
    'You out-rate {community} on {X}',
    'Somebody has to defend {X}. You volunteered',
  ],
  'community-low': [
    "You're harder on {X} than {community}",
    'You hold {X} to a higher bar',
    '{Xcap} have to earn it with you',
    'The hype around {X} stops at your door',
  ],
  'rating-bias-high': [
    'You grade kinder than {community}',
    'A generous grader',
    'You find the good in a fight',
    'You walk in rooting for the fight',
  ],
  'rating-bias-low': [
    "You're a tough grader",
    'You grade harder than {community}',
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
    '{Xcap} bring out your high scores',
    'Your good nights have {X} in them',
    'You know what you came for: {X}',
  ],
  'fighter-love': [
    '{name} never misses for you',
    'A {name} fight is appointment viewing for you',
    '{name} keeps earning your high scores',
    'You collect {name} fights',
  ],
  'fighter-rec': [
    'Watch {name}',
    '{name} is your kind of fighter',
    '{name} belongs on your radar',
    'Your taste already picked {name}',
  ],
  'never-above': [
    'Your top shelf has no room for {X}',
    "There's a ceiling on {X} for you",
    '{Xcap} never reach your summit',
    'Good {X} exist. Great ones keep not showing up',
  ],
  'all-high': [
    '{Xcap} never miss for you',
    '{Xcap}: a perfect record with you',
    "When it's {X}, you're all in",
  ],
  'all-tens-share': [
    'Your perfect scores have one thing in common: {X}',
    'The road to your top scores runs through {X}',
    'Every masterpiece on your list features {X}',
  ],
  'fighter-style': [
    "You're drawn to {X}",
    '{Xcap} are your people',
    'Your kind of fighter: {X}',
    'You keep ending up with {X}',
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
// The subline ADDS: proof, consequence, or a twist. Never an echo of the
// headline, never customer-service cheer (Good_Fights_Voice_Guide rules 1, 7).
const SUBLINES: Record<InsightKind, readonly string[]> = {
  loves: [
    'Your top scores read like a highlight reel of {X}.',
    'Everything else is killing time between {X}.',
    'A card without {X} barely counts as a card to you.',
  ],
  cold: [
    "Everyone has a price. {Xcap} aren't yours.",
    'You sit through them. You just refuse to reward them.',
    'Your scorecard has a door policy, and {X} wait outside.',
  ],
  'community-high': [
    'While {communityS} reaches for the remote, you lean in.',
    "You're not grading on the crowd's curve.",
    'You catch what {communityS} keeps missing in these.',
  ],
  'community-low': [
    'These have to show receipts for what {communityS} gives away free.',
    'What impresses {community} barely moves you.',
    'You watched the same fight and refused to round up.',
  ],
  'rating-bias-high': [
    'You walk into every card wanting it to be great, and your scores admit it.',
    'Somewhere in every dud you find the round that almost saved it.',
  ],
  'rating-bias-low': [
    "Most fights bore you. The ones that don't, you remember.",
    'A high score from you means something actually happened in that cage.',
  ],
  prefers: [
    '{Ycap} are fine. {Xcap} are why you watch.',
    'When both are on the card, everyone knows where your score is going.',
    'Your scores picked a side a long time ago.',
  ],
  'era-lean': [
    'Put {eraLoses} next to {eraWins} and your scorecard already knows the winner.',
    'Your highest scores keep coming from {eraWins}.',
  ],
  'rates-high': [
    'The nights you rave about keep having {X} in them.',
    "No {X}, no rave. That's how your scores read.",
    'Your scorecard keeps writing the same love letter to {X}.',
  ],
  'fighter-love': [
    'Almost every one you watched, you scored like a main event.',
    'Some fighters sell tickets. {name} sells you.',
    "You don't rate {name} fights so much as collect them.",
  ],
  'fighter-rec': [
    "You reward {recList}. That's {name} all over.",
    'Your scorecard keeps asking for {recList}. {name} is the answer.',
  ],
  'never-above': [
    'You keep showing up for them. They keep almost paying it off.',
    'Good, sure. Great, never. Your scores draw that line.',
  ],
  'all-high': [
    'You keep waiting for a bad one. It keeps not coming.',
    'Every single one you rated, you rated high. No exceptions yet.',
  ],
  'all-tens-share': [
    "That's not a coincidence. That's a signature.",
    'Call it luck if you want. It keeps happening.',
  ],
  'fighter-style': [
    'The proof is who you keep coming back to: {names}.',
    '{names} did not end up on your list by accident.',
  ],
  'fighter-appeal': [
    "It's why {names} keep showing up in your ratings.",
    '{names} figured you out a long time ago.',
  ],
  'fighter-persona': [
    'The ones you keep backing fit the mold, {names} up front.',
    '{names} led you there, and you went willingly.',
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
