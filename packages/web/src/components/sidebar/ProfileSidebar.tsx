'use client';

import { IdentityBlock } from './IdentityBlock';
import { FanDNABlock } from './FanDNABlock';
import { DistributionBlock } from './DistributionBlock';
import { YourCommentsBlock } from './YourCommentsBlock';
import { FollowedFightersStrip } from './FollowedFightersStrip';
import { UpcomingHypedBlock } from './UpcomingHypedBlock';
import { SpotlightBlock } from './SpotlightBlock';
import { MightLikeBlock } from './MightLikeBlock';

/**
 * Right-rail "About you" sidebar.
 *
 * Order is meaningful — identity first, DNA + distribution next so users see
 * their own stats high up, then social/following, then forward-looking
 * recommendation tiles (hype, spotlight, might-like).
 */
export function ProfileSidebar() {
  return (
    <aside className="space-y-4">
      <IdentityBlock />
      <FanDNABlock />
      <DistributionBlock />
      <YourCommentsBlock />
      <FollowedFightersStrip />
      <UpcomingHypedBlock />
      <SpotlightBlock />
      <MightLikeBlock />
    </aside>
  );
}
