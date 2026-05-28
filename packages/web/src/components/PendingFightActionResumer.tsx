'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { rateFight, createFightPrediction } from '@/lib/api';
import { readPendingFightAction, clearPendingFightAction } from '@/lib/pendingFightAction';

// Auth pages we should NOT replay on — wait until the user is back on the page
// they came from, so the refetch we trigger lands on a mounted, listening query.
const AUTH_ROUTES = ['/login', '/register'];

// Mounted once at the app root. When a user becomes authenticated and a pending
// hype/rating is waiting (entered before they were prompted to sign in), this
// replays it so their value is actually saved, then refreshes affected views.
// The pending action is only cleared once the save succeeds, so a transient
// failure can be retried on the next navigation/mount.
export function PendingFightActionResumer() {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || running.current) return;
    if (AUTH_ROUTES.includes(pathname)) return;

    const pending = readPendingFightAction();
    if (!pending) return;

    running.current = true;
    (async () => {
      try {
        if (pending.kind === 'hype') {
          await createFightPrediction(pending.fightId, { predictedRating: pending.value });
        } else {
          await rateFight(pending.fightId, pending.value);
        }
        clearPendingFightAction();
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['eventFights'] });
        queryClient.invalidateQueries({ queryKey: ['fight', pending.fightId] });
        queryClient.invalidateQueries({ queryKey: ['fightStats', pending.fightId] });
        queryClient.invalidateQueries({ queryKey: ['topFights'] });
        queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
        queryClient.invalidateQueries({ queryKey: ['myRatings'] });
        queryClient.invalidateQueries({ queryKey: ['search'] });
      } catch (err) {
        // Keep the pending action so a later mount can retry, and surface the
        // failure rather than swallowing it.
        running.current = false;
        console.warn('[PendingFightActionResumer] failed to save pending action', err);
      }
    })();
  }, [isAuthenticated, pathname, queryClient]);

  return null;
}
