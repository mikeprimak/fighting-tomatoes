/**
 * Copy pool for rating-bias. Worms-tone.
 * Variables: {rating}, {community}, {delta}, {avgDelta}, {n}.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'single-agreement': {
      soft: [
        'You rated this {rating}; the room sits at {community}. In step.',
        'A {rating}, matching the {community} consensus. Aligned.',
        'You and the room landed in the same place. {rating} vs {community}.',
        'Right on the room: your {rating} matches the {community} consensus.',
        '{rating} from you, {community} from them. Same page.',
        'You agreed with the room: {rating} vs {community}.',
      ],
      humor: [
        '{rating}, same as the room. Suspiciously sensible of everyone.',
        'You and the room agree at {community}. The committee notes the consensus.',
        '{rating} vs {community}. Effectively the same. The math, satisfied.',
        'Lockstep with the room. {rating} from you, {community} from them. Strange feeling.',
        '{rating} from you, {community} from them. The opinion department has nothing to do today.',
        'You and the room walked into the same conclusion. {rating} vs {community}. Cozy.',
      ],
    },
    'single-mild-high': {
      soft: [
        'You rated this {rating}; the room sits at {community}. Slight lean up.',
        'A {rating} from you, {community} from them. Mild divergence.',
        'Your {rating} runs {delta} above the room. Touch warmer.',
        '{rating} vs {community}. A nudge above the consensus.',
        'You rated this {rating}, the room {community}. Modest bullishness.',
        'A {rating} where the room said {community}. Slightly higher than the consensus.',
      ],
      humor: [
        '{rating}. The room is at {community}. A polite disagreement.',
        'You rated this {rating}, the room {community}. Touch warmer than the consensus.',
        'A {rating} vs {community}. You enjoyed it {delta} more than the average member.',
        '{rating} from you, {community} from them. The opinion department logs a mild lean.',
        'A {rating}. The room offered {community}. You\'re feeling fractionally generous.',
        '{rating} vs {community}. A modest tilt above the room.',
      ],
    },
    'single-mild-low': {
      soft: [
        'You rated this {rating}; the room sits at {community}. Slight lean down.',
        'A {rating} from you, {community} from them. Mild divergence.',
        'Your {rating} runs {delta} below the room. Touch cooler.',
        '{rating} vs {community}. A nudge below the consensus.',
        'You rated this {rating}, the room {community}. Modest restraint.',
        'A {rating} where the room said {community}. Slightly lower than the consensus.',
      ],
      humor: [
        '{rating}. The room is at {community}. A polite disagreement.',
        'You rated this {rating}, the room {community}. Touch cooler than the consensus.',
        'A {rating} vs {community}. You enjoyed it {delta} less than the average member.',
        '{rating} from you, {community} from them. The opinion department logs a mild lean.',
        'A {rating}. The room offered {community}. You\'re feeling fractionally measured.',
        '{rating} vs {community}. A modest tilt below the room.',
      ],
    },
    'single-high': {
      soft: [
        'You rated this {rating}; the room landed at {community}. Bullish.',
        'A {rating} where the room said {community}. You saw more.',
        'Your {rating} vs a {community} community. Generous of you.',
        '{rating} from you, {community} from them. Delta {delta}.',
        'A high-water mark: {rating} vs {community} room.',
        'Your {rating} is {delta} above where the room landed.',
      ],
      humor: [
        'A {rating}. The room offered {community}. Someone in the room is wrong.',
        '{rating} vs {community}. You saw a different fight, possibly a better one.',
        "Your {rating} is {delta} brighter than the room's {community}. The math, undefeated.",
        "{rating}. Bold. The {community} consensus politely disagrees.",
        'You enjoyed this {rating}-worth. The room enjoyed it {community}-worth. Splendid divergence.',
        'A {rating} from you. We have informed the room.',
      ],
    },
    'single-low': {
      soft: [
        'You rated this {rating}; the room landed at {community}. Stern.',
        '{rating} from you, {community} from them. Tougher critic.',
        'Your {rating} sits {delta} below the room.',
        'A {rating} where the room said {community}. Not for you.',
        'You held the line at {rating}. The room went {community}.',
        'Your {rating} reads tougher than the {community} consensus.',
      ],
      humor: [
        'A {rating}. The room said {community}. One of you is fun at parties.',
        "{rating} vs {community}. We have notified the optimism department.",
        'Your {rating} is {delta} below where the room landed. Unmoved.',
        '{rating}. The {community} fans are looking at you with concern.',
        'You rated this {rating}. The room is hosting a fundraiser for your enjoyment.',
        'A stern {rating} from you. The {community} crowd is having a better night.',
      ],
    },
    'pattern-leans-high': {
      soft: [
        'Your average rating runs {avgDelta} above the room. {n} fights deep.',
        'You tend to land higher than the consensus. {avgDelta} on average.',
        'Across {n} fights, your tilt is +{avgDelta}. The room is more cautious.',
        'Generous reviewer. +{avgDelta} above room average over {n} fights.',
        "Pattern noted: your ratings run +{avgDelta} above the room's.",
      ],
      humor: [
        '+{avgDelta} above the room across {n} fights. The committee has stopped asking why.',
        'Your average tilt: +{avgDelta}. The room is, on average, less easily impressed.',
        '{n} fights, +{avgDelta} above consensus. You see the good in everyone.',
        'Pattern over {n} fights: +{avgDelta}. The optimism department salutes.',
        'You run +{avgDelta} above the room. Sustainably.',
      ],
    },
    'pattern-leans-low': {
      soft: [
        'Your average rating runs {avgDelta} below the room. {n} fights deep.',
        'You tend to land lower than the consensus. {avgDelta} on average.',
        'Across {n} fights, your tilt is -{avgDelta}. The room is more enthusiastic.',
        'Strict reviewer. -{avgDelta} below room average over {n} fights.',
        "Pattern noted: your ratings run -{avgDelta} below the room's.",
      ],
      humor: [
        '-{avgDelta} below the room across {n} fights. We respect the standards.',
        'Your average tilt: -{avgDelta}. The bar is somewhere above the moon.',
        '{n} fights, -{avgDelta} below consensus. Sternness, sustained.',
        '-{avgDelta} below the room over {n} fights. The committee is intimidated.',
        'You run -{avgDelta} below the room. Strictly.',
      ],
    },
  },
};

export default copy;
