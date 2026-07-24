'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame, Trophy, History } from 'lucide-react';
import { getTopUpcomingFights, getRecentGoodFights, getClassicFights } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { SectionHeading } from './SectionHeading';

const MAX = 6;

/** Labels over the fight cards' score columns (community left, the user's own
 *  right). Spans align with the cards' w-12 columns; the right label is pulled
 *  slightly off the edge so wide labels ("MY RATING") don't crowd it. */
export function ColumnHeaders({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between pb-1.5 pt-2 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
      <span className="ml-2 w-12 whitespace-nowrap text-center">{left}</span>
      <span className="mr-2.5 w-12 whitespace-nowrap text-center">{right}</span>
    </div>
  );
}

/** Bordered, divided list container shared by the fight bands. Pass `columns`
 *  to label the score columns above the first card. */
function FightCardList({
  columns,
  children,
}: {
  columns?: { left: string; right: string };
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {columns && <ColumnHeaders {...columns} />}
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

/** Promotion label for display — strip underscores (e.g. "TOP_RANK"). */
function promotionLabel(promotion: string | null | undefined): string {
  return (promotion ?? '').replace(/_/g, ' ');
}

/** "in 2 days" / "tomorrow" / "in 2 weeks" — relative time to an event, by
 *  calendar day so it doesn't drift with the hour of day. */
function relativeEventTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startEvent = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startEvent.getTime() - startToday.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
}

/** "Sat, Jun 28" — a past event's calendar date (UTC, since Event.date is a
 *  UTC-hour placeholder). */
function pastEventDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Group a flat, hype-sorted fight list by event, preserving first-appearance
 *  order so the soonest/most-hyped event leads. */
function groupByEvent(fights: any[]): { event: any; fights: any[] }[] {
  const groups: { event: any; fights: any[] }[] = [];
  const byId = new Map<string, { event: any; fights: any[] }>();
  for (const f of fights) {
    const id = f.event?.id ?? 'unknown';
    let g = byId.get(id);
    if (!g) {
      g = { event: f.event, fights: [] };
      byId.set(id, g);
      groups.push(g);
    }
    g.fights.push(f);
  }
  return groups;
}

/**
 * Event banner header for a fight group: the event poster (top-anchored crop —
 * faces sit near the top of fight posters) under a bottom gradient carrying the
 * event name + when it happens/happened. Mirrors the mobile HypedEventCard
 * banner; taps through to the event page.
 */
function EventBanner({ event, when }: { event: any; when: string }) {
  const inner = (
    <>
      {event?.bannerImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.bannerImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold uppercase tracking-wide text-text-secondary">
          {promotionLabel(event?.promotion) || 'Event'}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 px-3.5 py-2.5">
        <p className="truncate text-base font-extrabold text-white [text-shadow:_0_1px_3px_rgb(0_0_0_/_60%)]">
          {event?.name ?? 'Event'}
        </p>
        {when && (
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-white/90 [text-shadow:_0_1px_3px_rgb(0_0_0_/_60%)]">
            {when}
          </p>
        )}
      </div>
    </>
  );

  const className = 'group relative block aspect-[3/1] overflow-hidden bg-background-secondary';
  return event?.id ? (
    <Link href={`/events/${event.id}`} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/** A banner-headed event group: the EventBanner over that event's fight cards,
 *  in one bordered card — the same silhouette as the mobile HypedEventCard.
 *  `columns` labels the cards' score columns (community score left, the user's
 *  own score right) — e.g. HYPE / MY HYPE upcoming, RATING / MY RATING recent.
 *  The spans align with the cards' w-12 columns (left square sits at left-2). */
function EventFightGroup({
  event,
  when,
  columns,
  children,
}: {
  event: any;
  when: string;
  columns: { left: string; right: string };
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <EventBanner event={event} when={when} />
      <ColumnHeaders {...columns} />
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

/** Hyped Upcoming Fights: the most-hyped upcoming bouts (avg hype ≥ 7). */
export function HotUpcomingFightsSection() {
  // Key on auth (and wait for it to restore) so the authenticated response —
  // which carries the user's own userHypePrediction for the "My Hype" column —
  // replaces the anonymous one on login. Without this the first (tokenless)
  // fetch is cached and the user's hype never shows. Mirrors CommentSections.
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data } = useQuery({
    queryKey: ['home', 'hot-upcoming', isAuthenticated],
    queryFn: () => getTopUpcomingFights('week'),
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });

  const fights = (data?.data ?? []).slice(0, MAX);
  if (fights.length === 0) return null;

  const groups = groupByEvent(fights);

  return (
    <section className="mb-8">
      <SectionHeading title="Hyped Upcoming Fights" icon={Flame} href="/events/upcoming" />
      <div className="space-y-4">
        {groups.map((g, i) => (
          <EventFightGroup
            key={g.event?.id ?? i}
            event={g.event}
            when={relativeEventTime(g.event?.mainStartTime ?? g.event?.date)}
            columns={{ left: 'Hype', right: 'My Hype' }}
          >
            {g.fights.map((fight: any) => (
              <UpcomingFightCard key={fight.id} fight={fight} />
            ))}
          </EventFightGroup>
        ))}
      </div>
    </section>
  );
}

/** Recent Good Fights: the best fights from the last couple weeks (rating > 7,
 *  >= 3 ratings), grouped by event under banner headers — mirrors mobile. */
export function RecentGoodFightsSection() {
  // Auth-keyed so the user's own rating fills the "My Rating" column on login
  // (same reasoning as HotUpcomingFightsSection).
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data } = useQuery({
    queryKey: ['home', 'recent-good', isAuthenticated],
    queryFn: getRecentGoodFights,
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });

  const fights = data?.data ?? [];
  if (fights.length === 0) return null;

  const groups = groupByEvent(fights);

  return (
    <section className="mb-8">
      <SectionHeading title="Recent Good Fights" icon={Trophy} href="/fights/top" />
      <div className="space-y-4">
        {groups.map((g, i) => (
          <EventFightGroup
            key={g.event?.id ?? i}
            event={g.event}
            when={pastEventDate(g.event?.mainStartTime ?? g.event?.date)}
            columns={{ left: 'Rating', right: 'My Rating' }}
          >
            {g.fights.map((fight: any) => (
              <CompletedFightCard key={fight.id} fight={fight} />
            ))}
          </EventFightGroup>
        ))}
      </div>
    </section>
  );
}

/** Classic Good Fights: top-rated bouts 3+ years old — a vault recommendation. */
export function ClassicGoodFightsSection() {
  // Auth-keyed so the user's own rating fills the "My Rating" column on login.
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data } = useQuery({
    queryKey: ['home', 'classic-good', isAuthenticated],
    queryFn: () => getClassicFights(MAX),
    enabled: !authLoading,
    staleTime: 30 * 60 * 1000,
  });

  const fights = (data?.data ?? []).slice(0, MAX);
  if (fights.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Classic Good Fights" icon={History} href="/fights/top?period=all" />
      <FightCardList columns={{ left: 'Rating', right: 'My Rating' }}>
        {fights.map((fight: any) => (
          <CompletedFightCard key={fight.id} fight={fight} showEvent />
        ))}
      </FightCardList>
    </section>
  );
}
