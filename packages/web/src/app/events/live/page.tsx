'use client';

import { useQuery } from '@tanstack/react-query';
import { getEvents } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { isEventLiveNow } from '@/lib/eventStatus';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { EventCard } from '@/components/EventCard';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { EditorialHero } from '@/components/EditorialHero';
import { EditorialSecondary } from '@/components/EditorialSecondary';
import { Loader2, Radio } from 'lucide-react';

export default function LiveEventsPage() {
  const { selectedOrgs, filterByPromotion, handleOrgPress } = useOrgFilter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', 'live'],
    queryFn: () => getEvents({ type: 'upcoming', includeFights: true, limit: 20 }),
    refetchInterval: 60000,
  });

  const allEvents = data?.events ?? [];
  const allLiveEvents = allEvents.filter((e: any) => isEventLiveNow(e));
  const liveEvents = allLiveEvents.filter((e: any) => filterByPromotion(e.promotion));
  // Live events the user's org filter is hiding — so we can offer to show them.
  const hiddenLiveOrgs = Array.from(
    new Set(
      allLiveEvents
        .filter((e: any) => !filterByPromotion(e.promotion))
        .map((e: any) => e.promotion)
        .filter(Boolean),
    ),
  ) as string[];

  return (
    <>
      <EditorialHero />
      <EditorialSecondary />
      <SidebarLayout>
        <div className="mb-4">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="text-danger" size={20} />
            <h1 className="text-lg font-bold text-foreground">Live Events</h1>
          </div>
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

        {liveEvents.map((event: any) => (
          <EventCard key={event.id} event={event} mode="live" />
        ))}

        {!isLoading && liveEvents.length === 0 && !error && (
          <div className="py-12 text-center">
            <p className="text-sm text-text-secondary">
              {selectedOrgs.size === 0
                ? 'No events are live right now.'
                : `No ${Array.from(selectedOrgs).join(', ')} events live right now.`}
            </p>
            {hiddenLiveOrgs.length > 0 ? (
              <button
                onClick={() => handleOrgPress('ALL')}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                {hiddenLiveOrgs.length === 1
                  ? `But there is a ${hiddenLiveOrgs[0]} event live. Show?`
                  : `But there are live events from ${hiddenLiveOrgs.join(', ')}. Show?`}
              </button>
            ) : (
              <p className="mt-1 text-xs text-text-secondary">Check the Upcoming tab to see what&apos;s next.</p>
            )}
          </div>
        )}
      </SidebarLayout>
    </>
  );
}
