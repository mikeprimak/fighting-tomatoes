'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getEvents } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { isEventLiveNow } from '@/lib/eventStatus';
import { useAnyLiveEvent } from '@/lib/useAnyLiveEvent';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { EventCard } from '@/components/EventCard';
import { LoadMoreSentinel } from '@/components/layout/LoadMoreSentinel';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { EditorialHero } from '@/components/EditorialHero';
import { EditorialSecondary } from '@/components/EditorialSecondary';
import { Loader2 } from 'lucide-react';

export function HomeClient() {
  const { filterEventsByOrg } = useOrgFilter();
  const router = useRouter();
  const hasLiveEvent = useAnyLiveEvent();

  // Mirror the mobile app: when something is live, land on the Live tab. Guard
  // with a per-session flag so it fires once on entry and doesn't bounce the
  // user back to /events/live every time they deliberately open Upcoming.
  useEffect(() => {
    if (!hasLiveEvent || typeof window === 'undefined') return;
    if (sessionStorage.getItem('gf_live_redirect')) return;
    sessionStorage.setItem('gf_live_redirect', '1');
    router.replace('/events/live');
  }, [hasLiveEvent, router]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: ({ pageParam = 1 }) =>
      getEvents({ page: pageParam, limit: 5, type: 'upcoming', includeFights: true }),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const allEvents = data?.pages.flatMap(page => page.events) ?? [];
  const filteredEvents = filterEventsByOrg(allEvents.filter((e: any) => !isEventLiveNow(e)));

  return (
    <>
      <EditorialHero />
      <EditorialSecondary />
      <SidebarLayout>
        <div className="mb-4">
          <h1 className="mb-3 text-lg font-bold text-foreground">Upcoming Events</h1>
          <OrgFilterTabs />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-center text-sm text-danger">
            Failed to load events. Please try again.
          </div>
        )}

        {filteredEvents.map(event => (
          <EventCard key={event.id} event={event} mode="upcoming" />
        ))}

        {!isLoading && filteredEvents.length === 0 && !error && (
          <p className="py-12 text-center text-sm text-text-secondary">
            No upcoming events found for the selected promotions.
          </p>
        )}

        <LoadMoreSentinel
          hasMore={!!hasNextPage}
          isFetching={isFetchingNextPage}
          onIntersect={fetchNextPage}
        />
      </SidebarLayout>
    </>
  );
}
