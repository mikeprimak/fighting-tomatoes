'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getTopRecentFights } from '@/lib/api';
import { Telescope } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';

function fighterLast(
  f: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!f) return '';
  return f.lastName || f.firstName || '';
}

export function SpotlightBlock() {
  const { user, isAuthenticated } = useAuth();

  // The endpoint is auth-aware: each fight carries userRating for the current
  // user, so keying on the user id refetches after login/logout.
  const { data: topRecent, isFetched: queriesSettled } = useQuery({
    queryKey: ['topRecentFights', 'month', user?.id ?? null],
    queryFn: () => getTopRecentFights('month'),
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
  });

  if (!isAuthenticated || !user) return null;
  if (!queriesSettled) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="h-16 animate-pulse rounded bg-background-secondary" />
      </div>
    );
  }

  // Pick the highest community-rated fight in the last month the user hasn't
  // rated (userRating comes from the backend, covering the user's FULL rating
  // history — a recent-ratings-page check here misses old ratings). Need >= 7
  // avg to feel worth recommending.
  const candidates = (topRecent?.data ?? [])
    .filter((f: any) => f.userRating == null)
    .sort((a: any, b: any) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
  const f = candidates[0];
  if (!f || (f.averageRating ?? 0) < 7) return null;

  // Drop the promotion when the event name already starts with it, so e.g.
  // promotion "UFC" + event "UFC 328: ..." doesn't show "UFC" twice.
  const promotion = (f.event?.promotion ?? '').trim();
  const eventName = (f.event?.name ?? '').trim();
  const redundantPromo =
    !!promotion && eventName.toLowerCase().startsWith(promotion.toLowerCase());
  const eventLine = promotion && !redundantPromo
    ? `Event: ${promotion}${eventName ? ` · ${eventName}` : ''}`
    : eventName
      ? `Event: ${eventName}`
      : promotion
        ? `Event: ${promotion}`
        : '';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Telescope size={11} className="text-primary" />
        You missed one
      </div>
      <Link href={`/fights/${f.id}`} className="block group">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
            {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
          </p>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: getHypeHeatmapColor(f.averageRating ?? 0) }}
          >
            <span className="text-sm font-bold leading-none text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_60%)]">
              {(f.averageRating ?? 0) === 10 ? '10' : (f.averageRating ?? 0).toFixed(1)}
            </span>
          </div>
        </div>
        {eventLine ? (
          <p className="-mt-[3px] truncate text-[11px] text-text-secondary">{eventLine}</p>
        ) : null}
        <p className="mt-2 text-[10px] text-text-secondary">
          Rate it and see where you land.
        </p>
      </Link>
    </div>
  );
}
