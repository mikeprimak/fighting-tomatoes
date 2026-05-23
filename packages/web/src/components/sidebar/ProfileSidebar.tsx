'use client';

import { IdentityBlock } from './IdentityBlock';
import { DistributionBlock } from './DistributionBlock';

/**
 * Right-rail "About you" sidebar.
 *
 * Stable spine + (later) a rotating spotlight tile. Each block decides its own
 * empty-room handling — `ProfileSidebar` just composes them in display order.
 */
export function ProfileSidebar() {
  return (
    <aside className="space-y-4">
      <IdentityBlock />
      <DistributionBlock />
    </aside>
  );
}
