'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAnyLiveEvent } from '@/lib/useAnyLiveEvent';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { WeekendEventsSection } from '@/components/home/WeekendEventsSection';
import {
  HotUpcomingFightsSection,
  RecentGoodFightsSection,
  ClassicGoodFightsSection,
} from '@/components/home/FightSections';
import { TopCommentsSection, ClassicCommentsSection } from '@/components/home/CommentSections';
import { HighlightedFighterSection } from '@/components/home/HighlightedFighterSection';
import { RecentlyBookedSection } from '@/components/home/FighterSections';

/**
 * Web home screen — the default landing page. The blog (growth engine) now lives
 * at the top of the sidebar (BlogSidebarBlock), so the page leads with the
 * weekend events feed + sidebar. Then curated community bands (hot upcoming,
 * recent good fights, top comments, highlighted fighter, recently booked,
 * classic good fights + comments). The blog appears ONLY here on web —
 * the Live / Upcoming / Past / Good Fights tabs don't carry it.
 *
 * No external news section (that's mobile-only by design).
 */
export function HomeClient() {
  const router = useRouter();
  const hasLiveEvent = useAnyLiveEvent();

  // Mirror the mobile app: when something is live, bounce to the Live tab once
  // per session so it doesn't fight a user who deliberately navigates back home.
  useEffect(() => {
    if (!hasLiveEvent || typeof window === 'undefined') return;
    if (sessionStorage.getItem('gf_live_redirect')) return;
    sessionStorage.setItem('gf_live_redirect', '1');
    router.replace('/events/live');
  }, [hasLiveEvent, router]);

  return (
    <SidebarLayout>
      <WeekendEventsSection />
      <HotUpcomingFightsSection />
      <RecentGoodFightsSection />
      <TopCommentsSection />
      <HighlightedFighterSection />
      <RecentlyBookedSection />
      <ClassicGoodFightsSection />
      <ClassicCommentsSection />
    </SidebarLayout>
  );
}
