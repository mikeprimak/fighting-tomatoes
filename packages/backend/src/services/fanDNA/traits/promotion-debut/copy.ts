/**
 * Copy pool for promotion-debut. Worms-tone.
 * Variables: {promotion} (UFC, BKFC, ONE FC, Karate Combat, etc.).
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'debut': {
      soft: [
        "First time at the {promotion} table. Welcome.",
        "Your first {promotion} action. The room has been waiting.",
        "Debut: {promotion}. A new org enters your orbit.",
        "First {promotion} fight on the books. The doors are open.",
        "Crossing into {promotion} for the first time. We logged it.",
        "{promotion} debut. New territory.",
      ],
      humor: [
        "First time at the {promotion} table. We will pretend we didn't notice you reading the menu.",
        "{promotion} debut. The committee has prepared a welcome basket.",
        "Your first {promotion} engagement. The other orgs are taking it personally.",
        "Crossing into {promotion}. Bold expansion strategy.",
        "First {promotion} action. The slider is now multilingual.",
        "{promotion} debut. The fight gods stamp your passport.",
      ],
    },
  },
};

export default copy;
