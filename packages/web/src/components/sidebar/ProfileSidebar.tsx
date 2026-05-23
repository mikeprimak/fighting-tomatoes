'use client';

import { IdentityBlock } from './IdentityBlock';
import { FollowedFightersStrip } from './FollowedFightersStrip';
import { SpotlightBlock } from './SpotlightBlock';
import { UpcomingHypedBlock } from './UpcomingHypedBlock';
import { MightLikeBlock } from './MightLikeBlock';
import { FanDNABlock } from './FanDNABlock';
import { DistributionBlock } from './DistributionBlock';

/**
 * Right-rail "About you" sidebar.
 *
 * Stable spine + a rotating spotlight tile. Each block decides its own
 * empty-room handling — `ProfileSidebar` just composes them in display order.
 */
export function ProfileSidebar() {
  return (
    <aside className="space-y-4">
      <IdentityBlock />
      <FollowedFightersStrip />
      <SpotlightBlock />
      <UpcomingHypedBlock />
      <MightLikeBlock />
      <FanDNABlock />
      <DistributionBlock />
    </aside>
  );
}
