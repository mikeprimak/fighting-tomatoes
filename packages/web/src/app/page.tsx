'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getEvents } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { isEventLiveNow } from '@/lib/eventStatus';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { EventCard } from '@/components/EventCard';
import { LoadMoreSentinel } from '@/components/layout/LoadMoreSentinel';
import { ProfileSidebar } from '@/components/sidebar/ProfileSidebar';
import { IdentityBlock } from '@/components/sidebar/IdentityBlock';
import { FanDNABlock } from '@/components/sidebar/FanDNABlock';
import { Loader2, ChevronRight } from 'lucide-react';

export default function UpcomingEventsPage() {
  const { filterEventsByOrg } = useOrgFilter();

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
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
      {/* Mobile-only "About you" strip above the feed. The desktop sidebar is
          unreachable on mobile because the events feed lazy-loads forever. */}
      <div className="mb-6 space-y-4 lg:hidden">
        <IdentityBlock />
        <FanDNABlock />
        <Link
          href="/profile"
          className="flex items-center justify-center gap-0.5 rounded-lg border border-border bg-card py-2 text-xs font-medium text-text-secondary hover:border-primary/30 hover:text-primary"
        >
          More about you
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="min-w-0">
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
      </div>

      <div className="hidden lg:block">
        <ProfileSidebar />
      </div>
    </div>
  );
}
