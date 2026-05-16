/**
 * Copy pool for org-affinity. Worms-tone.
 * Variables: {org}, {count}, {total}, {dominantOrg}, {dominantCount}.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'org-first': {
      soft: [
        'First {org} signal. Welcome to a new corner of the catalogue.',
        'Your first {org}. The map gets a little wider.',
        '{org} enters your record. Curious choice.',
        "That's your debut on {org}. Noted.",
        'A new promotion joins the list. {org} it is.',
        'First time on {org}. Brave.',
      ],
      humor: [
        "First {org}. We weren't sure you knew it existed.",
        'A {org} sighting. The committee leans forward.',
        '{org}, finally. We had a bet running.',
        "Your first {org}. Don't tell the others.",
        '{org} on the board. The cartographers update the map.',
        'Welcome to {org}. The other {dominantOrg} fans will get over it.',
      ],
    },
    'cross-org-foray': {
      soft: [
        'Rare {org} appearance. {count} of {total} signals — your taste broadens.',
        'You drifted from {dominantOrg} for a moment. {org} appreciates the visit.',
        'A {org} entry among {dominantCount} {dominantOrg} ones. Variety is good.',
        'Off-piste: {org}. The {dominantOrg} pile is wondering where you went.',
        '{org} gets a rating. The {dominantOrg}-to-{org} ratio is updated.',
        'Diversification: {org}. We respect a wandering eye.',
      ],
      humor: [
        '{org}? The {dominantOrg} side of your spreadsheet is filing a complaint.',
        '{count} {org} signals out of {total}. {org} is starting to wonder if you exist.',
        '{org}. Bold. Possibly a typo.',
        'A wild {org} appears. The {dominantOrg} pile pretends not to notice.',
        'You and {org}: rare. Like a comet. Mostly silent. Occasionally beautiful.',
        '{org} gets a ping. {dominantOrg} clutches its {dominantCount} ratings protectively.',
      ],
    },
    'dominant-pile-on': {
      soft: [
        '{count} {org} signals. Your loyalty is documented.',
        'Another {org} entry. The pile is now {count} deep.',
        '{org}, {org}, {org}. Your taste has a tell.',
        '{count}th {org} signal. Consistency is a virtue.',
        'The {org} pile grows. {count} and counting.',
        '{count} of {total}. {org} is your home court.',
      ],
      humor: [
        '{count} {org} signals. We are starting to notice a pattern.',
        '{count} of {total}. {org} is less your favorite promotion and more your personality.',
        '{count}th {org}. We have stopped being surprised.',
        '{org} again. Tradition is important.',
        '{count} {org} entries. The {org} algorithm has accepted you as its own.',
        "You and {org}: still going strong. Don't change.",
      ],
    },
  },
};

export default copy;
