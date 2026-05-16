/**
 * Copy pool for org-affinity. Worms-tone.
 * Variables: {org}, {count}, {total}, {verb}, {dominantOrg}, {dominantCount}.
 *   verb = "rated" | "hyped" — set by the trait based on the action.
 *
 * Phase 1 surface rule: fires only on first-ever, cross-org foray, or major
 * milestone counts on the dominant org. Doesn't fire on every UFC rating —
 * that's wallpaper. Let other traits speak.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'org-first': {
      soft: [
        'Your first {org} {verb}. A new corner of the catalogue opens.',
        "That's your debut on {org}. The list of promotions you've touched grows by one.",
        '{org} enters your record. First time.',
        "First {org} {verb} ever. Don't be a stranger.",
        '{org}: new territory. Welcome.',
        "First time on {org}. The map's a little wider tonight.",
      ],
      humor: [
        "Your first {org} ever. We weren't sure you knew the channel.",
        'A {org} sighting in the wild. The cartographers update the map.',
        'First {org} {verb}. The {org} algorithm just clocked you.',
        'Your {org} debut. We will mark the date in the ledger.',
        '{org} joins your dossier. About time.',
        'A virgin {org} rating. Treat it gently.',
      ],
    },
    'cross-org-foray': {
      soft: [
        'A {org} {verb} among {dominantCount} {dominantOrg} ones. Rare detour.',
        'You wandered off {dominantOrg} for a moment. {org} appreciates the visit.',
        'Outside your usual lane: {org}. Most of your {total} signals are {dominantOrg}.',
        '{org}, not {dominantOrg} for once. Variety is good.',
        'Off-piste: {org}. {dominantCount} {dominantOrg} ratings sit in the other pile.',
      ],
      humor: [
        '{org}? The {dominantCount} {dominantOrg} fans in your spreadsheet are sulking.',
        '{org}. Bold of you to leave the {dominantOrg} compound.',
        'A {org} appears. Your {dominantOrg} ratings shuffle uncomfortably.',
        "{org}, after {dominantCount} {dominantOrg} {verb}s? We're calling your supervisor.",
        '{org} gets a look-in. {dominantOrg} clutches its {dominantCount} entries protectively.',
        'You and {org}: rare. Last seen exiting the {dominantOrg} echo chamber, briefly.',
      ],
    },
    'dominant-milestone': {
      soft: [
        '{count} {org} {verb}s. The pattern is the pattern.',
        '{count}th {org}. The pile is officially a mountain.',
        'You just hit {count} {org} {verb}s. That is a record-keeping situation.',
        '{count} {org} {verb}s logged. {org} is your home court.',
        '{count} {org} entries on the books. We notice.',
      ],
      humor: [
        '{count} {org} {verb}s. The committee is starting to file paperwork.',
        '{count} {org}. At this point {org} should be sending you fruit baskets.',
        "{count} {org} {verb}s. The {org} algorithm has adopted you as kin.",
        "{count}th {org}. We've stopped asking why.",
        "{count} {org}. Couples therapy may be required.",
        "{count} {org}, all yours. The other promotions are starting to talk.",
      ],
    },
  },
};

export default copy;
