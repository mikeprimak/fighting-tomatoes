'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { followFighter, getRecommendedFighters } from '@/lib/api';
import { Check, UserPlus, Users } from 'lucide-react';

const LIMIT = 8;

export function MightLikeFightersBlock() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['recommendedFighters', isAuthenticated],
    queryFn: () => getRecommendedFighters(LIMIT),
    staleTime: 10 * 60 * 1000,
  });

  const followMutation = useMutation({
    mutationFn: (fighterId: string) => followFighter(fighterId),
    onSettled: (_, __, fighterId) => {
      setPending(prev => {
        const next = new Set(prev);
        next.delete(fighterId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['recommendedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['topFollowedFighters'] });
    },
  });

  const entries = data?.fighters ?? [];
  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Users size={11} className="text-primary" />
        Fighters you might like
      </h3>

      <ul className="space-y-2.5">
        {entries.map(({ fighter, reason }) => {
          const initials = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`;
          const isPending = pending.has(fighter.id);
          return (
            <li key={fighter.id} className="flex items-center gap-2">
              <Link
                href={`/fighters/${fighter.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 group"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-background-secondary ring-1 ring-border">
                  {fighter.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fighter.profileImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-text-secondary">
                      {initials || '?'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground group-hover:text-primary">
                    {fighter.firstName} {fighter.lastName}
                  </p>
                  <p className="truncate text-[10px] text-text-secondary">
                    {reason}
                  </p>
                </div>
              </Link>
              {isAuthenticated ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setPending(prev => new Set(prev).add(fighter.id));
                    followMutation.mutate(fighter.id);
                  }}
                  className="shrink-0 rounded-full border border-primary/40 p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
                  aria-label={`Follow ${fighter.firstName} ${fighter.lastName}`}
                >
                  {isPending ? <Check size={12} /> : <UserPlus size={12} />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
