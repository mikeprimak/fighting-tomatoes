'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getTopFollowedFighters } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { FollowButton } from '@/components/FollowButton';
import { hasRecord } from '@/lib/record';
import { Sparkles } from 'lucide-react';

const VISIBLE_LIMIT = 10;

export function PopularFightersBlock() {
  const { isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['topFollowedFighters'],
    queryFn: () => getTopFollowedFighters(20),
    staleTime: 10 * 60 * 1000,
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
                <FollowButton fighterId={fighter.id} isFollowing={false} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
