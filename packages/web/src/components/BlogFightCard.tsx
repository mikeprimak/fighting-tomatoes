'use client';

import Link from 'next/link';
import { FighterAvatar } from '@/components/FighterAvatar';
import { getHypeHeatmapColor } from '@/utils/heatmap';

interface BlogFighter {
  id: string;
  firstName: string;
  lastName: string;
  profileImage?: string | null;
}

export interface BlogFightCardData {
  id: string;
  fighter1: BlogFighter;
  fighter2: BlogFighter;
  averageRating: number;
  totalRatings: number;
  event?: { name?: string | null; date?: string | null } | null;
}

function formatEventDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function FighterBlock({ fighter, side }: { fighter: BlogFighter; side: 'left' | 'right' }) {
  const placeholder = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${side === 'left' ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-card sm:h-14 sm:w-14">
        <FighterAvatar
          src={fighter.profileImage || ''}
          alt={`${fighter.firstName} ${fighter.lastName}`}
          initials={placeholder}
          imgClassName="h-full w-full object-cover"
          initialsClassName="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary"
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] font-normal leading-tight text-text-secondary">
          {fighter.firstName}
        </span>
        <span className="truncate text-sm font-bold leading-tight text-foreground">
          {fighter.lastName}
        </span>
      </div>
    </div>
  );
}

/**
 * Read-only fight card sized for blog articles. Shows both fighters (image +
 * name), the event/date, and the community's aggregate rating + rating count.
 * The whole card links to the fight on goodfights.app. Spoiler-neutral by
 * design (no winner/method) so it's safe to drop into any post.
 *
 * Hydrated into `<div class="gf-fight-card">` placeholders by BlogFightCards.
 */
export function BlogFightCard({ data, rank }: { data: BlogFightCardData; rank?: number }) {
  const avgRating = data.averageRating ?? 0;
  const totalRatings = data.totalRatings ?? 0;
  const hasRating = avgRating > 0;
  const ratingColor = hasRating ? getHypeHeatmapColor(avgRating) : undefined;

  return (
    <Link
      href={`/fights/${data.id}`}
      className="my-4 flex items-stretch gap-3 overflow-hidden rounded-xl border border-border bg-background-secondary p-3 no-underline transition-colors hover:border-text-secondary/40"
    >
      {/* Rank badge (optional) */}
      {rank ? (
        <div className="flex w-7 shrink-0 items-center justify-center">
          <span className="text-lg font-bold text-text-secondary">#{rank}</span>
        </div>
      ) : null}

      {/* Fighters + event */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex items-center gap-2">
          <FighterBlock fighter={data.fighter1} side="left" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            vs
          </span>
          <FighterBlock fighter={data.fighter2} side="right" />
        </div>
        {data.event?.name ? (
          <p className="truncate text-center text-[11px] leading-none text-text-secondary">
            {data.event.name}
            {data.event.date ? ` · ${formatEventDate(data.event.date)}` : ''}
          </p>
        ) : null}
      </div>

      {/* Aggregate rating */}
      <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-md"
          style={{
            backgroundColor: hasRating ? ratingColor : '#202020',
            border: hasRating ? 'none' : '1px solid var(--color-border, #2a2a2a)',
          }}
        >
          <span className="text-lg font-bold leading-none text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_60%)]">
            {hasRating ? (avgRating === 10 ? '10' : avgRating.toFixed(1)) : '–'}
          </span>
        </div>
        <span className="text-[10px] leading-none text-text-secondary">
          {totalRatings === 1 ? '1 rating' : `${totalRatings.toLocaleString()} ratings`}
        </span>
      </div>
    </Link>
  );
}
