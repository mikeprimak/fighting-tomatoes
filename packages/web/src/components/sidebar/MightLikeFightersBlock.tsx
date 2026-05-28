'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getRecommendedFighters } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { FollowButton } from '@/components/FollowButton';
import { Users } from 'lucide-react';

const LIMIT = 8;

export function MightLikeFightersBlock() {
  const { isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['recommendedFighters', isAuthenticated],
    queryFn: () => getRecommendedFighters(LIMIT),
    staleTime: 10 * 60 * 1000,
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
          return (
            <li key={fighter.id} className="flex items-center gap-2">
              <Link
                href={`/fighters/${fighter.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 group"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-background-secondary ring-1 ring-border">
                  <FighterAvatar
                    src={fighter.profileImage}
                    initials={initials}
                    imgClassName="h-full w-full object-cover"
                    initialsClassName="flex h-full w-full items-center justify-center text-[10px] font-bold text-text-secondary"
                  />
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
                <FollowButton fighterId={fighter.id} isFollowing={false} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
