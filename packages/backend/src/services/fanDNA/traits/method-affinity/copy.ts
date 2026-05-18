/**
 * Copy pool for method-affinity.
 *
 * Profile-only trait. The profileSummary returns its own headline + body, so
 * this copy module exists for shape compatibility with the Trait contract —
 * the empty `lines` map is intentional.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {},
};

export default copy;
