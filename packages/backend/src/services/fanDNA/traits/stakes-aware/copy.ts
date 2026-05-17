/**
 * Copy pool for stakes-aware. Worms-tone.
 * Variables: {hype} or {rating} (one of, depending on action), {stakes}.
 *
 * {stakes} is a normalized short label ("title fight", "comeback", "debut",
 * "cross-sport showcase", "main event", "ranking shake-up"). All labels start
 * with consonants, so "a {stakes}" reads grammatically every time. Templates
 * never start with {stakes} — keeps the user's number leading the sentence.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'hype-stakes-high': {
      soft: [
        'A {hype} on a {stakes}. You show up for the big ones.',
        '{hype} for a {stakes}. The marquee gets your vote.',
        'A {hype} on the {stakes}. Big-night fan, confirmed.',
        '{hype} on a {stakes}. The stakes added a tick.',
        'A {hype} for a {stakes}. You came for the spotlight.',
      ],
      humor: [
        '{hype} on a {stakes}. The stakes department logs your enthusiasm.',
        'A {hype} for a {stakes}. The big-night committee accepts your vote.',
        '{hype}. A {stakes}. The marquee earned its keep.',
        'A {hype} on a {stakes}. A tick added for the lights alone.',
        '{hype} for a {stakes}. Spoken like a person who reads the card billing.',
      ],
    },
    'hype-stakes-mid': {
      soft: [
        'A {hype} on a {stakes}. Cautious about the spotlight.',
        "{hype} for a {stakes}. The big-night billing isn't carrying it.",
        'A measured {hype} on the {stakes}. Stage is set, you are not sold.',
        '{hype} on a {stakes}. Politely watching the marquee.',
      ],
      humor: [
        '{hype} on a {stakes}. The stakes department awaits more data.',
        'A {hype} for a {stakes}. Not sold by the marquee alone.',
        '{hype}. A {stakes}. A noncommittal nod to the big stage.',
        'A {hype} on the {stakes}. The lights are bright, the verdict is mid.',
      ],
    },
    'hype-stakes-low': {
      soft: [
        'A {hype} on a {stakes}. The stakes did not move you.',
        '{hype} for a {stakes}. Marquee billing, mild reaction.',
        'A {hype} on the {stakes}. Big stage, small interest.',
        '{hype} on a {stakes}. The spotlight could not save it.',
      ],
      humor: [
        '{hype} on a {stakes}. The stakes department received your feedback.',
        'A {hype} for a {stakes}. The marquee is workshopping a different pitch.',
        '{hype}. A {stakes}. Not all big nights are big nights for you.',
        'A {hype} on the {stakes}. The committee has noted your disinterest.',
      ],
    },
    'rate-stakes-high': {
      soft: [
        'A {rating} on a {stakes}. The big night delivered.',
        '{rating} for a {stakes}. The marquee earned the score.',
        'A {rating} on the {stakes}. Big-stage fight, big-stage rating.',
        '{rating} on a {stakes}. The spotlight paid off.',
        'A {rating} for a {stakes}. The card billing held up.',
      ],
      humor: [
        '{rating} on a {stakes}. The marquee, vindicated.',
        'A {rating} for a {stakes}. The stakes department closes the case.',
        '{rating}. A {stakes}. The big-night committee accepts the verdict.',
        'A {rating} on the {stakes}. Lights on, score up.',
        '{rating} for a {stakes}. The card got the rating its billing implied.',
      ],
    },
    'rate-stakes-mid': {
      soft: [
        'A {rating} on a {stakes}. The big-night billing got partial credit.',
        '{rating} for a {stakes}. The stakes showed up in pieces.',
        'A {rating} on the {stakes}. Half a marquee night.',
        '{rating} on a {stakes}. The spotlight was on, the fight was mid.',
      ],
      humor: [
        '{rating} on a {stakes}. The marquee tried.',
        'A {rating} for a {stakes}. The stakes department logs a partial.',
        '{rating}. A {stakes}. The lights were brighter than the action.',
        'A {rating} on the {stakes}. The card billing partially redeemed.',
      ],
    },
    'rate-stakes-low': {
      soft: [
        'A {rating} on a {stakes}. The big night did not land.',
        '{rating} for a {stakes}. Marquee on paper, mid on canvas.',
        'A {rating} on the {stakes}. The spotlight could not save it.',
        '{rating} on a {stakes}. The stakes did not deliver.',
      ],
      humor: [
        '{rating} on a {stakes}. The marquee apologizes.',
        'A {rating} for a {stakes}. The stakes department received your feedback.',
        '{rating}. A {stakes}. Big billing, small payoff.',
        'A {rating} on the {stakes}. The committee notes the disappointment.',
      ],
    },
  },
};

export default copy;
