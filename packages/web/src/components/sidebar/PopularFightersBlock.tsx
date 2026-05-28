'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { followFighter, getTopFollowedFighters } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { UserPlus, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

const VISIBLE_LIMIT = 10;

function hasRecord(f: { wins?: number; losses?: number; draws?: number }): boolean {
  return (f.wins ?? 0) + (f.losses ?? 0) + (f.draws ?? 0) > 0;
}

export function PopularFightersBlock() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['topFollowedFighters'],
    queryFn: () => getTopFollowedFighters(20),
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
      queryClient.invalidateQueries({ queryKey: ['topFollowedFighters'] });
    },
  });

  const entries = (data?.data ?? []).filter(e => !e.isFollowing).slice(0, VISIBLE_LIMIT);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Sparkles size={11} className="text-primary" />
        Popular on Good Fights
      </h3>

      {entries.length === 0 ? (
        <p className="text-xs text-text-secondary">
          {isAuthenticated
            ? "You're already following the most-followed fighters. Nice."
            : 'Loading suggestions…'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map(({ fighter, followerCount }) => {
            const initials = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`;
            const isPending = pending.has(fighter.id);
            return (
              <li key={fighter.id} className="flex items-center gap-2">
                <Link
                  href={`/fighters/${fighter.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-background-secondary ring-1 ring-border">
                    <FighterAvatar
                      src={fighter.profileImage}
                      initials={initials}
                      imgClassName="h-full w-full object-cover"
                      initialsClassName="flex h-full w-full items-center justify-center text-[10px] font-bold text-text-secondary"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground hover:text-primary">
                      {fighter.firstName} {fighter.lastName}
                    </p>
                    <p className="truncate text-[10px] text-text-secondary">
                      {hasRecord(fighter)
                        ? `${fighter.wins}-${fighter.losses}-${fighter.draws}`
                        : ''}
                      {hasRecord(fighter) && followerCount ? ' · ' : ''}
                      {followerCount} follower{followerCount === 1 ? '' : 's'}
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
                    aria-label="Follow fighter"
                  >
                    {isPending ? <Check size={12} /> : <UserPlus size={12} />}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
