/**
 * Copy pool for weight-class-affinity. Worms-tone.
 * Variables: {class}, {count}, {total}, {verb}, {dominantClass}, {dominantCount}.
 *   verb = "rated" | "hyped" — set by the trait based on the action.
 *   class is lowercase ("lightweight", "boxing welterweight", "women's flyweight"),
 *   safe to drop into the middle of a sentence. Never start a line with {class}.
 *
 * Fires only on class-first, cross-class-foray, or milestone in dominant class.
 * Same surface discipline as org-affinity — silent on routine taps.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'class-first': {
      soft: [
        'Your first {class} fight {verb}. A new division enters your dossier.',
        "That's your debut on a {class} fight. The scales notice.",
        'First {class} fight {verb}. The {class} bracket is no longer blank.',
        'First time on a {class} fight. The weigh-in committee waves you in.',
        '{class} fights: new territory. Welcome.',
      ],
      humor: [
        "Your first {class} fight ever. Weren't sure you knew the weigh-in existed.",
        'A {class} sighting in your ledger. The cartographers update the map.',
        'First {class} fight {verb}. The scale just clocked you.',
        'Your {class} debut. We will mark the date in the ledger.',
        '{class} joins your dossier. About time.',
      ],
    },
    'cross-class-foray': {
      soft: [
        'A {class} fight {verb} among {dominantCount} {dominantClass} ones. Rare detour.',
        'You wandered off the {dominantClass} lane for a moment. {class} appreciates the visit.',
        'Outside your usual division: a {class} fight. Most of your {total} are {dominantClass}.',
        '{class}, not {dominantClass} for once. Variety is good.',
        "Off the {dominantClass} lane: a {class} fight. The other pile of {dominantCount} sits patiently.",
      ],
      humor: [
        'A {class} fight? The {dominantCount} {dominantClass} entries in your spreadsheet are sulking.',
        '{class}. Bold of you to leave the {dominantClass} compound.',
        'A {class} fight appears. Your {dominantClass} entries shuffle uncomfortably.',
        "{class}, after {dominantCount} {dominantClass} fights? We're calling your supervisor.",
        "You and {class}: rare. Last seen exiting the {dominantClass} echo chamber, briefly.",
      ],
    },
    'dominant-milestone': {
      soft: [
        '{count} {class} fights {verb}. The pattern is the pattern.',
        '{count}th {class} fight. The pile is officially a mountain.',
        'You just hit {count} {class} fights {verb}. That is a record-keeping situation.',
        '{count} {class} fights {verb}. {class} is your home division.',
        '{count} {class} fights logged. We notice.',
      ],
      humor: [
        '{count} {class} fights {verb}. The committee is starting to file paperwork.',
        '{count} {class}. At this point the {class} division should be sending you fruit baskets.',
        "{count} {class} fights {verb}. The {class} algorithm has adopted you as kin.",
        "{count}th {class} fight. We've stopped asking why.",
        "{count} {class} fights, all yours. The other divisions are starting to talk.",
      ],
    },
  },
};

export default copy;
