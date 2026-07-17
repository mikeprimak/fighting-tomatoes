'use client';

/**
 * "Your week" — the urgency rail from the home-mirror endpoint, folded into
 * the sidebar (2026-07-17; the pivot branch's above-the-fold mirror, kept as
 * a rail instead of a hero). One query unifies the three personal signals:
 * live events you care about, events running today, and hyped/followed
 * fights over the next 7 days. Supersedes the hype-only UpcomingHypedBlock.
 *
 * Spoiler-safe: the backend only queries UPCOMING/LIVE events and selects no
 * result fields. Renders nothing when the week is empty: silence > filler.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import {
  getHomeMirror,
  type HomeMirrorEventCard,
  type HomeMirrorPinnedFight,
} from '@/lib/api';
import { CalendarDays, Flame, UserCheck } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';

const MAX_PINNED = 5;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function eventCareLine(ev: HomeMirrorEventCard): string {
  const parts: string[] = [];
  if (ev.hypedFightCount > 0) {
    parts.push(
      `${ev.hypedFightCount} ${ev.hypedFightCount === 1 ? 'fight' : 'fights'} you hyped`,
    );
  }
  if (ev.followedFighterNames.length > 0) {
    const [first, ...rest] = ev.followedFighterNames;
    parts.push(rest.length > 0 ? `${first} +${rest.length} you follow` : `${first} fights`);
  }
  return parts.join(' · ');
}

export function YourWeekBlock() {
  const { isAuthenticated, user } = useAuth();

  const { data } = useQuery({
    queryKey: ['homeMirror', user?.id ?? null],
    queryFn: getHomeMirror,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated || !data) return null;
  const { liveEvents, todayEvents, pinnedFights } = data;
  // A live event's card supersedes its per-fight pins (same rule as the API).
  const liveEventIds = new Set(liveEvents.map((e) => e.eventId));
  const pinned = pinnedFights
    .filter((f) => !liveEventIds.has(f.eventId))
    .slice(0, MAX_PINNED);
  if (liveEvents.length === 0 && todayEvents.length === 0 && pinned.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <CalendarDays size={11} className="text-primary" />
        Your week
      </h3>

      <ul className="space-y-2.5">
        {liveEvents.map((ev) => (
          <li key={ev.eventId}>
            <Link href={`/events/${ev.eventId}`} className="block group">
              <div className="flex items-center gap-2">
                <span className="flex shrink-0 items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                  Live
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground group-hover:text-primary">
                  {ev.name}
                </p>
              </div>
              {eventCareLine(ev) ? (
                <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                  {eventCareLine(ev)}
                </p>
              ) : null}
            </Link>
          </li>
        ))}

        {todayEvents.map((ev) => (
          <li key={ev.eventId}>
            <Link href={`/events/${ev.eventId}`} className="block group">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Tonight
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground group-hover:text-primary">
                  {ev.name}
                </p>
              </div>
              {eventCareLine(ev) ? (
                <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                  {eventCareLine(ev)}
                </p>
              ) : null}
            </Link>
          </li>
        ))}

        {pinned.map((f) => (
          <li key={f.fightId}>
            <Link href={`/fights/${f.fightId}`} className="block group">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {f.fighter1.name} vs {f.fighter2.name}
                </p>
                {f.hype != null ? (
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                    <Flame
                      size={28}
                      fill={getHypeHeatmapColor(f.hype)}
                      color={getHypeHeatmapColor(f.hype)}
                      strokeWidth={1.5}
                    />
                    <span className="absolute inset-0 flex translate-y-[3px] items-center justify-center text-[11px] font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
                      {Math.round(f.hype)}
                    </span>
                  </span>
                ) : f.followedFighterNames.length > 0 ? (
                  <UserCheck size={16} className="mt-1 shrink-0 text-primary" />
                ) : null}
              </div>
              <p className="-mt-[3px] truncate text-[11px] text-text-secondary">
                {shortDate(f.eventDate)} · {f.eventName}
                {f.followedFighterNames.length > 0 && f.hype != null
                  ? ` · ${f.followedFighterNames[0]}`
                  : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
