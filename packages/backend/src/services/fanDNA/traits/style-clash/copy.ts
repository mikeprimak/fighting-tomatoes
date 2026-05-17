/**
 * Copy pool for style-clash. Worms-tone.
 * Variables: {hype} or {rating} (one of, depending on action), {styleTag}.
 *
 * Templates never start with {styleTag} — the AI extractor emits lowercase
 * tags ("striker vs grappler") and we want sentences to read naturally.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'hype-clash-high': {
      soft: [
        'A {hype} on a {styleTag}. You came for the clash.',
        '{hype} for a {styleTag}. Style-purist tonight.',
        'Hyped this {hype} — {styleTag} is your kind of math.',
        'A {hype} on a {styleTag}. Stylistic chemistry, locked in.',
        '{hype} on the {styleTag} matchup. You read the bracket.',
      ],
      humor: [
        '{hype} on a {styleTag}. The opinion department logs a stylistic preference.',
        'A {hype} for a {styleTag}. You picked the most diagram-friendly fight on the card.',
        '{hype}. {styleTag}. The matchmaker is taking notes.',
        'A {hype} on the {styleTag} matchup. The committee approves of your tastes.',
        '{hype} for a {styleTag}. Spoken like a styles-make-fights person.',
      ],
    },
    'hype-clash-mid': {
      soft: [
        'A {hype} on a {styleTag}. Curious, not sold.',
        '{hype} for a {styleTag}. Reserving judgement on the matchup.',
        'A measured {hype} on the {styleTag}. Could go either way.',
        '{hype} on a {styleTag}. Politely interested.',
      ],
      humor: [
        '{hype} on a {styleTag}. The clash department awaits further data.',
        'A {hype} for a {styleTag}. The enthusiasm meter is calibrating.',
        '{hype}. {styleTag}. A noncommittal nod to the matchmakers.',
        'A {hype} on the {styleTag}. Neither sold nor sold against.',
      ],
    },
    'hype-clash-low': {
      soft: [
        'A {hype} on a {styleTag}. Not the clash you came for.',
        '{hype} for a {styleTag}. Style mismatch, for you.',
        'A {hype} on the {styleTag} matchup. Unconvinced.',
        '{hype} on a {styleTag}. The stylistic pitch did not land.',
      ],
      humor: [
        '{hype} on a {styleTag}. The matchmaker is rethinking choices.',
        'A {hype} for a {styleTag}. The clash department received your feedback.',
        '{hype}. {styleTag}. Not all matchups land with everyone.',
        'A {hype} on the {styleTag} matchup. The styles, less make-fights tonight.',
      ],
    },
    'rate-clash-high': {
      soft: [
        'A {rating} on a {styleTag}. The clash delivered.',
        '{rating} for a {styleTag}. The matchup paid off.',
        'A {rating} on the {styleTag} fight. Styles made the fight.',
        '{rating} on a {styleTag}. The contrast worked.',
        'A {rating} on a {styleTag}. The bracket math held up.',
      ],
      humor: [
        '{rating} on a {styleTag}. The styles played, you stayed.',
        'A {rating} for a {styleTag}. The matchmaker is feeling very vindicated.',
        '{rating}. {styleTag}. Diagram-friendly fight, diagram-friendly score.',
        'A {rating} on the {styleTag} matchup. The clash department closes the case.',
        '{rating} for a {styleTag}. The contrast committee accepts your vote.',
      ],
    },
    'rate-clash-mid': {
      soft: [
        'A {rating} on a {styleTag}. The clash, partial.',
        '{rating} for a {styleTag}. Style worked, fight didn\'t quite.',
        'A {rating} on the {styleTag} matchup. Half there.',
        '{rating} on a {styleTag}. The contrast showed up in pieces.',
      ],
      humor: [
        '{rating} on a {styleTag}. The clash had a quiet night.',
        'A {rating} for a {styleTag}. The matchup tried.',
        '{rating}. {styleTag}. Mostly the style, less the clash.',
        'A {rating} on the {styleTag}. The contrast department logs a draw.',
      ],
    },
    'rate-clash-low': {
      soft: [
        'A {rating} on a {styleTag}. The clash did not land.',
        '{rating} for a {styleTag}. Style on paper, not on canvas.',
        'A {rating} on the {styleTag} matchup. Unmoved.',
        '{rating} on a {styleTag}. The contrast went missing.',
      ],
      humor: [
        '{rating} on a {styleTag}. The clash department apologizes.',
        'A {rating} for a {styleTag}. The matchmaker is workshopping a different pitch.',
        '{rating}. {styleTag}. The styles did not, in fact, make the fight.',
        'A {rating} on the {styleTag}. The contrast committee notes the disappointment.',
      ],
    },
  },
};

export default copy;
