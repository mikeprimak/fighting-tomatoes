/**
 * Copy pool for org-affinity. Worms-tone.
 * Variables: {org}, {count}, {total}, {verb}, {dominantOrg}, {dominantCount}.
 *   verb = "rated" | "hyped" — set by the trait based on the action.
 *
 * Phrasing rule: always make it clear we're talking about FIGHTS. "25 UFC
 * hyped" reads as a typo; "25 UFC fights hyped" reads naturally.
 *
 * Surface rule: fires only on first-ever, cross-org foray, or major milestone
 * counts on the dominant org. Doesn't fire on every UFC rating — that's
 * wallpaper. Let other traits speak.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'org-first': {
      soft: [
        'Your first {org} fight {verb}. A new corner of the catalogue opens.',
        "That's your debut on {org}. The list of promotions you've touched grows by one.",
        'First {org} fight {verb}. {org} enters your record.',
        "First {org} fight ever. Don't be a stranger.",
        '{org}: new territory. Welcome.',
        "First time on {org}. The map's a little wider tonight.",
      ],
      humor: [
        "Your first {org} fight ever. We weren't sure you knew the channel.",
        'An {org} sighting in the wild. The cartographers update the map.',
        'First {org} fight {verb}. The {org} algorithm just clocked you.',
        'Your {org} debut. We will mark the date in the ledger.',
        '{org} joins your dossier. About time.',
        'A virgin {org} fight on the board. Treat it gently.',
      ],
    },
    'cross-org-foray': {
      soft: [
        'An {org} fight {verb} among {dominantCount} {dominantOrg} ones. Rare detour.',
        'You wandered off {dominantOrg} for a moment. {org} appreciates the visit.',
        'Outside your usual lane: an {org} fight. Most of your {total} are {dominantOrg}.',
        '{org}, not {dominantOrg} for once. Variety is good.',
        'Off-piste: an {org} fight. {dominantCount} {dominantOrg} ones sit in the other pile.',
      ],
      humor: [
        'An {org} fight? The {dominantCount} {dominantOrg} fans in your spreadsheet are sulking.',
        '{org}. Bold of you to leave the {dominantOrg} compound.',
        'An {org} fight appears. Your {dominantOrg} entries shuffle uncomfortably.',
        "{org}, after {dominantCount} {dominantOrg} fights? We're calling your supervisor.",
        '{org} gets a look-in. {dominantOrg} clutches its {dominantCount} entries protectively.',
        'You and {org}: rare. Last seen exiting the {dominantOrg} echo chamber, briefly.',
      ],
    },
    'dominant-milestone': {
      soft: [
        '{count} {org} fights {verb}. The pattern is the pattern.',
        '{count}th {org} fight. The pile is officially a mountain.',
        'You just hit {count} {org} fights {verb}. That is a record-keeping situation.',
        '{count} {org} fights {verb}. {org} is your home court.',
        '{count} {org} fights logged. We notice.',
      ],
      humor: [
        '{count} {org} fights {verb}. The committee is starting to file paperwork.',
        '{count} {org}. At this point {org} should be sending you fruit baskets.',
        "{count} {org} fights {verb}. The {org} algorithm has adopted you as kin.",
        "{count}th {org} fight. We've stopped asking why.",
        "{count} {org} fights, all yours. Couples therapy may be required.",
        "{count} {org} fights {verb}. The other promotions are starting to talk.",
      ],
    },
  },
};

export default copy;
