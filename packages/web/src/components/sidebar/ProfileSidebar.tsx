'use client';

import { BlogSidebarBlock } from './BlogSidebarBlock';
import { IdentityBlock } from './IdentityBlock';
import { FanDNABlock } from './FanDNABlock';
import { DistributionBlock } from './DistributionBlock';
import { YourCommentsBlock } from './YourCommentsBlock';
import { FollowedFightersStrip } from './FollowedFightersStrip';
import { MightLikeFightersBlock } from './MightLikeFightersBlock';
import { UpcomingHypedBlock } from './UpcomingHypedBlock';
import { SpotlightBlock } from './SpotlightBlock';
import { MightLikeBlock } from './MightLikeBlock';

/**
 * Right-rail sidebar.
 *
 * Order is meaningful — the blog block sits at the very top (the editorial
 * growth engine, moved here from the page header), then the "About you" tiles:
 * identity first, DNA + distribution next so users see their own stats high up,
 * then social/following, then forward-looking recommendation tiles.
 */
export function ProfileSidebar() {
  return (
    <aside aria-label="From the blog and about you" className="space-y-4">
      <BlogSidebarBlock />
      <IdentityBlock />
      <FanDNABlock />
      <DistributionBlock />
      <YourCommentsBlock />
      <FollowedFightersStrip />
      <MightLikeFightersBlock />
      <UpcomingHypedBlock />
      <SpotlightBlock />
      <MightLikeBlock />
    </aside>
  );
}
