'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useAnyLiveEvent } from '@/lib/useAnyLiveEvent';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { EditorialHero } from '@/components/EditorialHero';
import { EditorialSecondary } from '@/components/EditorialSecondary';
import { WeekendEventsSection } from '@/components/home/WeekendEventsSection';
import {
  HotUpcomingFightsSection,
  RecentGoodFightsSection,
  ClassicGoodFightsSection,
} from '@/components/home/FightSections';
import { TopCommentsSection, ClassicCommentsSection } from '@/components/home/CommentSections';
import { HighlightedFighterSection } from '@/components/home/HighlightedFighterSection';
import { HotFightersSection, RecentlyBookedSection } from '@/components/home/FighterSections';

/**
 * Web home screen — the default landing page. Mirrors the mobile home: an
 * editorial band (the blog growth engine) on top, then curated community bands
 * (weekend events, hot upcoming, recent good fights, top comments, highlighted
 * fighter, hot fighters, recently booked, classic good fights + comments). The
 * blog appears ONLY here on web — the
 * Live / Upcoming / Past / Good Fights tabs no longer carry the editorial band.
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
    <>
      <EditorialHero />
      <EditorialSecondary />
      <SidebarLayout>
        <WeekendEventsSection />
        <HotUpcomingFightsSection />
        <RecentGoodFightsSection />
        <TopCommentsSection />
        <HighlightedFighterSection />
        <HotFightersSection />
        <RecentlyBookedSection />
        <ClassicGoodFightsSection />
        <ClassicCommentsSection />

        <Link
          href="/blog"
          className="flex items-center justify-center gap-1 rounded-lg border border-border bg-card py-3 text-sm font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
        >
          More from the blog
          <ArrowRight size={15} />
        </Link>
      </SidebarLayout>
    </>
  );
}
