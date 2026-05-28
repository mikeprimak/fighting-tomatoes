'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { rateFight, createFightPrediction } from '@/lib/api';
import { readPendingFightAction, clearPendingFightAction } from '@/lib/pendingFightAction';

// Mounted once at the app root. When a user becomes authenticated and a pending
// hype/rating is waiting (entered before they were prompted to sign in), this
// replays it so their value is actually saved, then refreshes affected views.
export function PendingFightActionResumer() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || ran.current) return;
    const pending = readPendingFightAction();
    if (!pending) return;

    ran.current = true;
    clearPendingFightAction();

    (async () => {
      try {
        if (pending.kind === 'hype') {
          await createFightPrediction(pending.fightId, { predictedRating: pending.value });
        } else {
          await rateFight(pending.fightId, pending.value);
        }
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['eventFights'] });
        queryClient.invalidateQueries({ queryKey: ['fight', pending.fightId] });
        queryClient.invalidateQueries({ queryKey: ['fightStats', pending.fightId] });
        queryClient.invalidateQueries({ queryKey: ['topFights'] });
        queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
        queryClient.invalidateQueries({ queryKey: ['myRatings'] });
        queryClient.invalidateQueries({ queryKey: ['search'] });
      } catch {
        // Best-effort — if the replay fails the user can re-enter it manually.
      }
    })();
  }, [isAuthenticated, queryClient]);

  return null;
}
