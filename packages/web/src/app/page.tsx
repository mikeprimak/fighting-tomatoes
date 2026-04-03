'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getEvents } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { EventCard } from '@/components/EventCard';
import { Loader2 } from 'lucide-react';

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
      getEvents({ page: pageParam, limit: 2, type: 'upcoming', includeFights: true }),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const allEvents = data?.pages.flatMap(page => page.events) ?? [];
  const filteredEvents = filterEventsByOrg(allEvents);

  return (
    <div>
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

      {hasNextPage && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 rounded-lg bg-card px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More Events'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
