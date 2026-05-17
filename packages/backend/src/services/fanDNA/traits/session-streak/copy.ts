/**
 * Copy pool for session-streak. Worms-tone.
 * Variables: {count} (total rate+hype actions in the 10-minute window,
 *            current action included).
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'streak-3': {
      soft: [
        'On a tear tonight. {count} actions in ten minutes.',
        '{count} fights in a row. Building momentum.',
        "You're in the zone. {count} in the last ten minutes.",
        'Three deep. The slider is warming up.',
        'A small streak forming. {count} actions and counting.',
      ],
      humor: [
        '{count} in ten minutes. We see you.',
        'Three deep. The hype department has a new favorite tonight.',
        '{count} actions in ten minutes. Either a fight night or a moment of clarity.',
        "You're on a roll. {count} so far. The slider is glowing.",
        '{count} taps in ten minutes. Someone called in sick to do this.',
      ],
    },
    'streak-5': {
      soft: [
        'Five deep tonight. {count} actions in ten minutes.',
        '{count} in a row. You\'re committed.',
        'A real streak now. {count} actions, no signs of stopping.',
        "You're in a flow state. {count} fights in ten minutes.",
        'Five-and-counting. The slider has muscle memory by now.',
      ],
      humor: [
        '{count} actions. The slider is filing for overtime.',
        'Five deep. The fight gods have noticed.',
        '{count} in ten minutes. We are no longer surprised.',
        'You and the slider are now in a serious relationship. {count} actions deep.',
        '{count} taps. The hype department is taking notes for a documentary.',
      ],
    },
    'streak-10': {
      soft: [
        '{count} actions in ten minutes. This is dedication.',
        'Double digits. You are putting in the work.',
        '{count} fights deep tonight. Marathon energy.',
        "You've hit ten. The slider is rooting for you.",
        '{count} in ten minutes. The committee will issue a commendation.',
      ],
      humor: [
        '{count} actions in ten minutes. The slider has unionized.',
        'Ten deep. We are starting to worry about you. Lovingly.',
        '{count} taps in one window. The hype department is sending snacks.',
        'Double digits. You are now legally obligated to take a break. (You will not.)',
        '{count} actions. The fight gods are taking turns watching.',
      ],
    },
  },
};

export default copy;
