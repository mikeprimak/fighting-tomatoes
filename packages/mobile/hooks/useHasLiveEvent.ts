import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

interface Event {
  id: string;
  hasStarted: boolean;
  isComplete: boolean;
}

/**
 * Hook to check if there's currently a live event
 * Returns true if any event has started but not completed
 */
export function useHasLiveEvent() {
  const { data: eventsData } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });

  const allEvents = eventsData?.events || [];
  const hasLiveEvent = allEvents.some((event: Event) => event.hasStarted && !event.isComplete);

  return hasLiveEvent;
}
