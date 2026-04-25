import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useOrgFilter } from '../store/OrgFilterContext';

interface Event {
  id: string;
  eventStatus: string;
  promotion?: string;
}

/**
 * Hook to check if there's currently a live event that matches the user's org filter.
 * Returns true if any event is LIVE and passes the filter. A LIVE event the user has
 * filtered out should not force the app onto the Live Events tab.
 */
export function useHasLiveEvent() {
  const { filterByPromotion } = useOrgFilter();
  const { data: eventsData } = useQuery({
    queryKey: ['upcomingEvents', 'liveCheck'],
    queryFn: () => apiService.getEvents({ type: 'upcoming', limit: 20 }),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const allEvents = eventsData?.events || [];
  const hasLiveEvent = allEvents.some(
    (event: Event) => event.eventStatus === 'LIVE' && filterByPromotion(event.promotion)
  );

  return hasLiveEvent;
}

/**
 * Returns true if any event is currently LIVE, regardless of the user's org filter.
 * Used for the Live Events tab red-dot indicator — the badge should appear even if
 * the live event belongs to a promotion the user has filtered out.
 */
export function useAnyLiveEvent() {
  const { data: eventsData } = useQuery({
    queryKey: ['upcomingEvents', 'liveCheck'],
    queryFn: () => apiService.getEvents({ type: 'upcoming', limit: 20 }),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const allEvents = eventsData?.events || [];
  return allEvents.some((event: Event) => event.eventStatus === 'LIVE');
}

/**
 * Same as useHasLiveEvent but also returns loading state,
 * so callers can wait before acting on the result.
 */
export function useHasLiveEventWithLoading() {
  const { filterByPromotion } = useOrgFilter();
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['upcomingEvents', 'liveCheck'],
    queryFn: () => apiService.getEvents({ type: 'upcoming', limit: 20 }),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const allEvents = eventsData?.events || [];
  const hasLiveEvent = allEvents.some(
    (event: Event) => event.eventStatus === 'LIVE' && filterByPromotion(event.promotion)
  );

  return { hasLiveEvent, isLoading };
}
