'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getMyRatings, getTopRecentFights } from '@/lib/api';
import { Telescope, Star } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';

function fighterLast(
  f: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!f) return '';
  return f.lastName || f.firstName || '';
}

export function SpotlightBlock() {
  const { user, isAuthenticated } = useAuth();

  const { data: topRecent, isFetched: topRecentFetched } = useQuery({
    queryKey: ['topRecentFights', 'month'],
    queryFn: () => getTopRecentFights('month'),
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
  });

  const { data: myRatings, isFetched: myRatingsFetched } = useQuery({
    queryKey: ['myRatings', 'sidebar-spotlight'],
    queryFn: () =>
      getMyRatings({ page: '1', limit: '20', filterType: 'ratings', sortBy: 'newest' }),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Hold rendering until both queries settle so we don't flash an empty card
  // before deciding whether to render at all.
  const queriesSettled = topRecentFetched && myRatingsFetched;

  if (!isAuthenticated || !user) return null;
  if (!queriesSettled) {
    return (
      <div className="rounded-lg border border-primary/30 bg-card p-4">
        <div className="h-16 animate-pulse rounded bg-background-secondary" />
      </div>
    );
  }

  // Pick the highest community-rated fight in the last month the user hasn't
  // rated. Need >= 7 avg to feel worth recommending.
  const ratedFightIds = new Set<string>(
    (myRatings?.fights ?? []).map((f: any) => f.id),
  );
  const candidates = (topRecent?.data ?? [])
    .filter((f: any) => !ratedFightIds.has(f.id))
    .sort((a: any, b: any) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
  const f = candidates[0];
  if (!f || (f.averageRating ?? 0) < 7) return null;

  const promotion = f.event?.promotion;
  const eventName = f.event?.name ?? '';
  const eventLine = promotion
    ? `Event: ${promotion}${eventName ? ` · ${eventName}` : ''}`
    : eventName;

  return (
    <div className="rounded-lg border border-primary/30 bg-gradient-to-b from-primary/[0.06] to-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        <Telescope size={11} />
        A good fight you might love
      </div>
      <Link href={`/fights/${f.id}`} className="block group">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
            {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
          </p>
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            <Star
              size={28}
              fill={getHypeHeatmapColor(f.averageRating ?? 0)}
              color={getHypeHeatmapColor(f.averageRating ?? 0)}
              strokeWidth={1.5}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
              {Math.round(f.averageRating ?? 0)}
            </span>
          </span>
        </div>
        {eventLine ? (
          <p className="mt-1 truncate text-[11px] text-text-secondary">{eventLine}</p>
        ) : null}
        <p className="mt-2 text-[10px] text-text-secondary">
          {f.totalRatings} fans agreed.
        </p>
      </Link>
    </div>
  );
}
