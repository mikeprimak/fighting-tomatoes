'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import {
  getMyRatings,
  getUpcomingFollowedFights,
  type UpcomingFollowedFight,
} from '@/lib/api';
import { Star, Clock } from 'lucide-react';

function timeUntil(dateStr: string): string {
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = target - now;
  if (diffMs <= 0) return 'now';
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days}d ${hours}h`;
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function fighterDisplay(f: UpcomingFollowedFight['fighter1']) {
  const last = f.lastName || '';
  const first = f.firstName || '';
  return last ? last : first;
}

export function RecencyBlock() {
  const { user, isAuthenticated } = useAuth();

  const { data: ratingsData } = useQuery({
    queryKey: ['myRatings', 'sidebar-last'],
    queryFn: () =>
      getMyRatings({ page: '1', limit: '1', filterType: 'ratings', sortBy: 'newest' }),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const { data: upcomingData } = useQuery({
    queryKey: ['upcomingFollowed', user?.id ?? null],
    queryFn: () => getUpcomingFollowedFights(1),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated || !user) return null;

  const lastRated = ratingsData?.fights?.[0];
  const nextFollowed = upcomingData?.fights?.[0];

  // Hide block entirely if nothing to show.
  if (!lastRated && !nextFollowed) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        Recency
      </h3>

      {lastRated ? (
        <Link
          href={`/fights/${lastRated.id}`}
          className="block group"
        >
          <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            <Star size={10} />
            Last rated
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
            {fighterDisplay(lastRated.fighter1)} vs {fighterDisplay(lastRated.fighter2)}
          </p>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-text-secondary">
            <span className="truncate">{lastRated.event?.name ?? ''}</span>
            {typeof lastRated.userRating === 'number' ? (
              <span className="ml-2 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">
                {lastRated.userRating}
              </span>
            ) : null}
          </div>
        </Link>
      ) : null}

      {lastRated && nextFollowed ? (
        <div className="my-3 border-t border-border" />
      ) : null}

      {nextFollowed ? (
        <Link
          href={`/events/${nextFollowed.event.id}`}
          className="block group"
        >
          <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            <Clock size={10} />
            Next followed fight
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
            {fighterDisplay(nextFollowed.fighter1)} vs {fighterDisplay(nextFollowed.fighter2)}
          </p>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-text-secondary">
            <span className="truncate">{nextFollowed.event.name}</span>
            <span className="ml-2 shrink-0 font-medium text-primary">
              in {timeUntil(nextFollowed.event.date)}
            </span>
          </div>
        </Link>
      ) : null}
    </div>
  );
}
