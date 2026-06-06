'use client';

import { useQuery } from '@tanstack/react-query';
import { getEvents } from '@/lib/api';
import { isEventLiveNow } from '@/lib/eventStatus';

/**
 * Returns true if any event is currently live, regardless of the user's org
 * filter. Mirrors the mobile `useAnyLiveEvent` hook and drives the navbar
 * "Live" red-dot indicator. Uses the same `isEventLiveNow` check as the Live
 * Events page, so the dot reflects whether that page would have content.
 */
export function useAnyLiveEvent(): boolean {
  const { data } = useQuery({
    // Liveness only needs event-level status/start-time fields (see isEventLiveNow),
    // NOT the full fight cards. Requesting includeFights here ran the heavy
    // /api/events aggregation (all fights + all hype predictions) every 60s per
    // open tab — a top contributor to the 2026-06-06 DB connection crash-loop.
    // Keep this poll cheap.
    queryKey: ['events', 'live'],
    queryFn: () => getEvents({ type: 'upcoming', includeFights: false, limit: 20 }),
    refetchInterval: 60000,
  });

  const allEvents = data?.events ?? [];
  return allEvents.some((e: any) => isEventLiveNow(e));
}
