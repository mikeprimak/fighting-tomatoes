/**
 * Copy pool for hype-bias. Worms-tone.
 * Variables: {hype}, {community}, {delta}, {avgDelta}, {n}.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'single-high': {
      soft: [
        'You hyped this {hype}; the room sits at {community}. Bullish.',
        'A {hype} from you, {community} from them. You see more here.',
        'Your {hype} runs {delta} above the room.',
        'A high call: {hype} vs {community} room.',
        '{hype} from you, {community} consensus. Heat detected.',
        'You like this {hype}-worth. The room likes it {community}-worth.',
      ],
      humor: [
        'A {hype}. The room offered {community}. One of you is wrong, possibly delightfully.',
        '{hype} vs {community}. You smell something the room missed.',
        "Your {hype} is {delta} hotter than the room's {community}. We have notified the hype department.",
        '{hype}. Bold. The {community} consensus is checking your work.',
        'You enjoyed the build-up {hype}-worth. The room: a polite {community}.',
        'A {hype} from you. The room is at {community} and starting to wonder.',
      ],
    },
    'single-low': {
      soft: [
        'You hyped this {hype}; the room sits at {community}. Skeptical.',
        '{hype} from you, {community} from them. Cooler call.',
        'Your {hype} runs {delta} below the room.',
        'A measured call: {hype} vs {community} room.',
        '{hype} from you, {community} consensus. You see less here.',
        'You held the line at {hype}. The room went {community}.',
      ],
      humor: [
        'A {hype}. The room said {community}. Someone is being grown-up about this.',
        '{hype} vs {community}. The room is excited; you have seen a few fights.',
        "Your {hype} is {delta} cooler than the room's {community}. Steady hand.",
        '{hype}. The {community} crowd is doing the wave; you are seated.',
        'You hyped this {hype}-worth. The room hyped it {community}-worth. Splendid divergence.',
        'A {hype} from you. The room is at {community} and waving glow sticks.',
      ],
    },
    'agreement': {
      soft: [
        'You and the room landed at {hype}. Consensus.',
        '{hype} from you, {community} from the room. Aligned.',
        'Right on the room: {hype} matches consensus.',
        "You're sitting where the room is sitting. {hype}.",
        'A {hype}, matching the {community} room. In step.',
      ],
      humor: [
        '{hype}, same as the room. Suspiciously sensible of everyone.',
        'You and the room agree at {hype}. The committee notes the consensus.',
        '{hype} vs {community}. Effectively the same. The math, satisfied.',
        'Lockstep with the room at {hype}. Nothing to argue about. Strange feeling.',
        '{hype} from you, {community} from them. The hype department has nothing to do today.',
      ],
    },
    'pattern-leans-high': {
      soft: [
        'Your average hype runs {avgDelta} above the room. {n} fights deep.',
        'You tend to hype higher than the consensus. +{avgDelta} on average.',
        'Across {n} hyped fights, your tilt is +{avgDelta}. The room is more cautious.',
        'Excitable hyper. +{avgDelta} above room average over {n} fights.',
        "Pattern noted: your hype runs +{avgDelta} above the room's.",
      ],
      humor: [
        '+{avgDelta} above the room across {n} fights. The hype department has a favorite.',
        'Your average tilt: +{avgDelta}. The room is, on average, harder to impress.',
        '{n} fights, +{avgDelta} above consensus. You believe in this sport.',
        'Pattern over {n} fights: +{avgDelta}. Sustained optimism.',
        'You run +{avgDelta} above the room. The matchmakers thank you.',
      ],
    },
    'pattern-leans-low': {
      soft: [
        'Your average hype runs {avgDelta} below the room. {n} fights deep.',
        'You tend to hype lower than the consensus. -{avgDelta} on average.',
        'Across {n} hyped fights, your tilt is -{avgDelta}. The room is more excited.',
        'Measured hyper. -{avgDelta} below room average over {n} fights.',
        "Pattern noted: your hype runs -{avgDelta} below the room's.",
      ],
      humor: [
        '-{avgDelta} below the room across {n} fights. The standards are held.',
        'Your average tilt: -{avgDelta}. The bar lives somewhere above the room.',
        '{n} fights, -{avgDelta} below consensus. Restraint, sustained.',
        '-{avgDelta} below the room over {n} fights. The hype department respects it.',
        'You run -{avgDelta} below the room. The room is having more fun, possibly.',
      ],
    },
  },
};

export default copy;
