/**
 * Copy pool for trailblazer. Worms-tone.
 * Variables: {verb} ("rate"|"hype"), {verbed} ("rated"|"hyped"),
 *            {noun} ("rating"|"hype"), {others} (count of other signals,
 *            only set for among-first-few).
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'first-ever': {
      soft: [
        'First to {verb} this one. You opened the book.',
        "Nobody had {verbed} this fight yet. You're first on record.",
        'Your {noun} is the only one on file. Setting the tone.',
        'First {noun} for this fight. The community follows you.',
        "You're the pioneer on this one. The scoreboard was empty.",
        'First signal in. The rest of the room is still loading.',
      ],
      humor: [
        'First to {verb} this fight. Brave. Or early. Possibly both.',
        "Nobody else has touched this one. You're either ahead of the curve or alone in the wilderness.",
        'A {noun} of one. The scoreboard waits for company.',
        "You're the inaugural {verb}r. We'll print a certificate.",
        'First {noun}. The other fans are still warming up their thumbs.',
        'Solo {noun} on the board. The committee will form behind you.',
      ],
    },
    'among-first-few': {
      soft: [
        'Only {others} others {verbed} this before you. Early call.',
        "You're among the first to {verb} this fight. The crowd hasn't arrived yet.",
        'Just {others} {verbed} before you. The verdict is still forming.',
        "Early {noun}. The community is barely starting to weigh in.",
        '{others} {verbed} before you. You beat most of the room.',
      ],
      humor: [
        'You and {others} others. The rest of the fanbase is fashionably late.',
        'Only {others} got here before you. Speedrunning verdicts now, are we?',
        'Among the first {others}-plus-one. The bandwagon hasn\'t left the station.',
        'Early {noun}. Most fans are still finding their stars.',
        '{others} {verbed} ahead of you. The pile is suspiciously empty.',
      ],
    },
  },
};

export default copy;
