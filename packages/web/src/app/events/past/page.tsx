'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getEvents } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { EventCard } from '@/components/EventCard';
import { LoadMoreSentinel } from '@/components/layout/LoadMoreSentinel';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { Loader2 } from 'lucide-react';

// Priority orgs float above everyone else *within the same day*; days themselves
// stay newest-first and each group stays time-sorted. Match against the canonical
// Event.promotion strings, upper-cased.
const PRIMARY_PROMOTIONS = new Set(['UFC', 'PFL', 'BKFC', 'KARATE COMBAT', 'DIRTY BOXING', 'RAF']);

const isPrimaryOrg = (promotion?: string) =>
  !!promotion && PRIMARY_PROMOTIONS.has(promotion.toUpperCase());

// UTC day bucket (YYYY-MM-DD) so events are grouped by calendar day regardless
// of the viewer's timezone — mirrors how event dates are rendered.
const dayKey = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const startMs = (e: any): number => {
  const d = new Date(e.mainStartTime ?? e.date);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

function sortPastEvents(events: any[]): any[] {
  return [...events].sort((a, b) => {
    // 1) newest day first
    const byDay = dayKey(b.date).localeCompare(dayKey(a.date));
    if (byDay !== 0) return byDay;
    // 2) priority group above secondary group
    const groupDelta = (isPrimaryOrg(a.promotion) ? 0 : 1) - (isPrimaryOrg(b.promotion) ? 0 : 1);
    if (groupDelta !== 0) return groupDelta;
    // 3) time-based within the group (latest first)
    return startMs(b) - startMs(a);
  });
}

export default function PastEventsPage() {
  const { filterEventsByOrg } = useOrgFilter();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['events', 'past'],
    queryFn: ({ pageParam = 1 }) =>
      getEvents({ page: pageParam, limit: 5, type: 'past', includeFights: true }),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const allEvents = data?.pages.flatMap(page => page.events) ?? [];
  const filteredEvents = sortPastEvents(filterEventsByOrg(allEvents));

  return (
    <SidebarLayout>
        <div className="mb-4">
          <h1 className="mb-3 text-lg font-bold text-foreground">Past Events</h1>
          <OrgFilterTabs />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-center text-sm text-danger">
            Failed to load events.
          </div>
        )}

        {filteredEvents.map((event: any) => (
          <EventCard key={event.id} event={event} mode="past" />
        ))}

        {!isLoading && filteredEvents.length === 0 && !error && (
          <p className="py-12 text-center text-sm text-text-secondary">
            No past events found for the selected promotions.
          </p>
        )}

        <LoadMoreSentinel
          hasMore={!!hasNextPage}
          isFetching={isFetchingNextPage}
          onIntersect={fetchNextPage}
        />
    </SidebarLayout>
  );
}
