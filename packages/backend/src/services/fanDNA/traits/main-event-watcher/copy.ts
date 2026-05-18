/**
 * Copy pool for main-event-watcher.
 *
 * v1 surfaces this trait only on the profile (no reveal-modal line). The
 * profileSummary returns its own headline + body, so this copy module
 * exists for shape compatibility with the trait contract — the empty `lines`
 * map is intentional.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {},
};

export default copy;
