import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface UseLiveEventPollingOptions {
  eventId: string;
  isLive: boolean;
  intervalMs?: number;
}

/**
 * Hook to poll for live event updates
 * Refetches event and fights data when an event is live
 */
export function useLiveEventPolling({
  eventId,
  isLive,
  intervalMs = 10000 // Default: 10 seconds
}: UseLiveEventPollingOptions) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only poll if event is live
    if (!isLive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    console.log(`🔴 [LIVE POLLING] Starting for event ${eventId} (every ${intervalMs}ms)`);

    // Invalidate queries immediately to get fresh data
    queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    queryClient.invalidateQueries({ queryKey: ['eventFights', eventId] });

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      console.log(`🔄 [LIVE POLLING] Refreshing event ${eventId}`);

      // Invalidate queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventFights', eventId] });
    }, intervalMs);

    // Cleanup on unmount or when isLive changes
    return () => {
      if (intervalRef.current) {
        console.log(`⏹️ [LIVE POLLING] Stopping for event ${eventId}`);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [eventId, isLive, intervalMs, queryClient]);
}
