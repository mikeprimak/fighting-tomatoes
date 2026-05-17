/**
 * Copy pool for night-owl. Worms-tone.
 * Variables: {verb} ("hype" | "rating").
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'night': {
      soft: [
        "Late-night {verb}. The room is asleep, you are not.",
        "After-hours {verb}. The committee is in pajamas.",
        "Night-shift {verb}. We respect the hours.",
        "A {verb} at this hour. The fights don't care about clocks; neither do you.",
        "Quiet hours, loud {verb}. We are here for it.",
        "{verb} in the dark. The slider glows for you.",
      ],
      humor: [
        "A {verb} at this hour? The committee has questions. And concerns.",
        "Late-night {verb}. The fight gods are wearing slippers.",
        "Night-owl {verb} logged. We will not tell your sleep tracker.",
        "After-hours engagement. The room is asleep, presumably more responsibly.",
        "A {verb} at this hour. Bold. Or insomnia. Possibly both.",
        "You and the slider, both up too late. The committee sees you.",
      ],
    },
  },
};

export default copy;
