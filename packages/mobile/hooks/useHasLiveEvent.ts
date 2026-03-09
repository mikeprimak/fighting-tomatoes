import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

interface Event {
  id: string;
  eventStatus: string;
}

/**
 * Hook to check if there's currently a live event
 * Returns true if any event has started but not completed
 */
export function useHasLiveEvent() {
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['upcomingEvents', 'liveCheck'],
    queryFn: () => apiService.getEvents({ type: 'upcoming', limit: 20 }),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });

  const allEvents = eventsData?.events || [];
  // Live event = eventStatus is 'LIVE'
  const hasLiveEvent = allEvents.some((event: Event) => event.eventStatus === 'LIVE');

  return hasLiveEvent;
}

/**
 * Same as useHasLiveEvent but also returns loading state,
 * so callers can wait before acting on the result.
 */
export function useHasLiveEventWithLoading() {
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['upcomingEvents', 'liveCheck'],
    queryFn: () => apiService.getEvents({ type: 'upcoming', limit: 20 }),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const allEvents = eventsData?.events || [];
  const hasLiveEvent = allEvents.some((event: Event) => event.eventStatus === 'LIVE');

  return { hasLiveEvent, isLoading };
}
