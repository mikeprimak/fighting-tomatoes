/**
 * Copy rendering for taste insights.
 *
 * Locked copy rules (identity-platform.md 2026-06-09):
 *   - Human, non-statistical HEADLINE ("You love wars"). The number lives in
 *     the small SUBLINE ("9.1 average across 23 fights, vs your usual 7.2").
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

const SUBLINES: Record<InsightKind, readonly string[]> = {
  loves: [
    'You average {avg} on them and {base} on everything else, across {n} fights.',
    '{n} rated, averaging {avg} against your usual {base}.',
    'A +{delta} bump over your average, across {n} fights.',
  ],
  cold: [
    'You average {avg} on them against your usual {base}, across {n} fights.',
    '{delta} below your average, across {n} fights.',
  ],
  'community-high': [
    'On the same fights, you rate them {delta} higher, across {n}.',
    'You average {avg} across {n} of them.',
    'A +{delta} lean, {n} fights in.',
  ],
  'community-low': [
    'On the same fights, you rate them {delta} lower, across {n}.',
    'You average {avg} across {n} of them.',
    'A {delta} discount, {n} fights in.',
  ],
  'rating-bias-high': [
    'Across {n} fights, your scores sit {delta} above {community} on average.',
    '{delta} higher than {community} on the same {n} fights.',
  ],
  'rating-bias-low': [
    'Across {n} fights, your scores sit {delta} below {community} on average.',
    '{delta} lower than {community} on the same {n} fights.',
  ],
  'never-above': [
    '{n} rated, never above a {cap}.',
    'Highest score so far: {cap}, across {n} tries.',
  ],
  'all-high': [
    'All {n} you have rated landed an 8 or higher.',
    '{n} for {n} at 8-plus.',
  ],
  'all-tens-share': ['All {tens} of your 10s carry that tag.'],
  'fighter-style': [
    'Built from {k} fighters you rate high, hype, or follow, led by {names}.',
    '{k} of your fighters fit the mold, {names} above all.',
  ],
  'fighter-appeal': [
    'Built from {k} fighters you rate high, hype, or follow, led by {names}.',
    '{k} of your fighters bring it, {names} above all.',
  ],
  'fighter-persona': [
    'Built from {k} fighters you rate high, hype, or follow, led by {names}.',
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
  const vars: Record<string, string> = {
    X: phrase,
    Xcap: cap(phrase),
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
