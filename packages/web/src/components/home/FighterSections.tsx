'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame, CalendarPlus, ArrowRight } from 'lucide-react';
import { getHotFighters, getRecentlyBookedFighters } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { SectionHeading } from './SectionHeading';

/** "today" / "tomorrow" / "in 9 days" / "in 2 weeks" — calendar-day relative. */
function relUntil(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
}

/** "today" / "yesterday" / "9 days ago" / "2 weeks ago" — calendar-day relative. */
function relAgo(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

/** Bordered, divided list container shared by the fighter bands. */
function FighterRowList({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {children}
    </div>
  );
}

/** Compact fighter row: headshot, name (+ optional inline opponent), subtitle.
 *  Mirrors the mobile FighterCard used on the app home. */
function FighterRow({
  fighter,
  inlineOpponent,
  subtitle,
}: {
  fighter: any;
  inlineOpponent?: string;
  subtitle?: string;
}) {
  const name = `${fighter.firstName ?? ''} ${fighter.lastName ?? ''}`.trim();
  const initials = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <Link
      href={`/fighters/${fighter.id}`}
      className="flex items-center gap-3 p-3 transition-colors hover:bg-background/40"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background-secondary">
        <FighterAvatar
          src={fighter.actionImage || fighter.profileImage}
          alt={name}
          initials={initials}
          imgClassName="h-full w-full object-cover"
          initialsClassName="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {name}
          {inlineOpponent && (
            <span className="font-normal text-text-secondary"> {inlineOpponent}</span>
          )}
        </p>
        {subtitle && <p className="truncate text-xs text-text-secondary">{subtitle}</p>}
      </div>
      <ArrowRight size={15} className="shrink-0 text-text-secondary" />
    </Link>
  );
}

/** Hot Fighters: three who recently fought, then three who fight next — grouped,
 *  not interleaved (mirrors the mobile band). */
export function HotFightersSection() {
  const { data } = useQuery({
    queryKey: ['home', 'hot-fighters'],
    queryFn: getHotFighters,
    staleTime: 5 * 60 * 1000,
  });

  const recent = (data?.data.recent ?? []).slice(0, 3);
  const upcoming = (data?.data.upcoming ?? []).slice(0, 3);
  if (recent.length === 0 && upcoming.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Hot Fighters" icon={Flame} />
      <FighterRowList>
        {recent.map((r) => (
          <FighterRow
            key={`recent-${r.fighter.id}`}
            fighter={r.fighter}
            subtitle={`Fought ${r.opponentName ?? ''} ${relAgo(r.lastFightDate)}`.trim()}
          />
        ))}
        {upcoming.map((u) => (
          <FighterRow
            key={`upcoming-${u.fighter.id}`}
            fighter={u.fighter}
            subtitle={`Fights ${u.opponentName ?? ''} ${relUntil(u.nextFightDate)}`.trim()}
          />
        ))}
      </FighterRowList>
    </section>
  );
}

/** Recently Booked: fighters whose next bout was just announced. */
export function RecentlyBookedSection() {
  const { data } = useQuery({
    queryKey: ['home', 'recently-booked'],
    queryFn: getRecentlyBookedFighters,
    staleTime: 5 * 60 * 1000,
  });

  const booked = (data?.data ?? []).slice(0, 6);
  if (booked.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Recently Booked" icon={CalendarPlus} />
      <FighterRowList>
        {booked.map((b) => (
          <FighterRow
            key={b.fighter.id}
            fighter={b.fighter}
            inlineOpponent={`vs ${b.opponentName}`}
            subtitle={`${b.event?.name ?? ''} ${relUntil(b.nextFightDate)}`.trim()}
          />
        ))}
      </FighterRowList>
    </section>
  );
}
