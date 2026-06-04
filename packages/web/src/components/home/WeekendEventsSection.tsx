'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { getEvents } from '@/lib/api';
import { isEventLiveNow } from '@/lib/eventStatus';
import { SectionHeading } from './SectionHeading';

/**
 * "Events this weekend" — the upcoming cards happening between now and the end
 * of the current week. Mirrors the mobile home: today through the upcoming
 * Sunday; on a Monday it spans the full next week so the band isn't empty at the
 * top of the week. Compact teaser cards link into the event detail page.
 */
function isThisWeekend(e: any): boolean {
  const d = new Date(e.mainStartTime ?? e.date);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = startOfToday.getDay(); // 0=Sun … 6=Sat
  const daysUntilSunday = (7 - day) % 7;

  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(startOfToday.getDate() + daysUntilSunday);
  // On Monday, reach all the way to the next Sunday so the start of the week
  // still shows the weekend's cards.
  if (day === 1) endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);

  return d >= startOfToday && d <= endOfWeek;
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Always show start times in Eastern — the canonical timezone for the cards.
  const t = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return `${t} ET`;
}

/** When the card's first fight starts — earliest known bell (early prelims →
 *  prelims → main card). */
function firstFightStart(event: any): string | null {
  return event.earlyPrelimStartTime ?? event.prelimStartTime ?? event.mainStartTime ?? null;
}

/** Short display name for a fighter — last name, falling back to first. */
function fighterName(f: any): string {
  return f?.lastName || f?.firstName || 'TBD';
}

/** Promotion label for display — some are stored with underscores (e.g.
 *  "TOP_RANK"); show them with spaces. */
function promotionLabel(promotion: string | null | undefined): string {
  return (promotion ?? '').replace(/_/g, ' ');
}

/** The card's most-hyped bouts: hype > 7 with at least 3 user hype ratings,
 *  ordered by hype desc, max 3. */
function topFights(event: any): any[] {
  return (Array.isArray(event.fights) ? event.fights : [])
    .filter((f: any) => (f.averageHype ?? 0) > 7 && (f.hypeCount ?? 0) >= 3)
    .sort((a: any, b: any) => (b.averageHype ?? 0) - (a.averageHype ?? 0))
    .slice(0, 3);
}

export function WeekendEventsSection() {
  const { data } = useQuery({
    queryKey: ['home', 'weekend-events'],
    queryFn: () => getEvents({ type: 'upcoming', includeFights: true, limit: 30 }),
    staleTime: 5 * 60 * 1000,
  });

  // The home screen is org-agnostic by design: every section shows content from
  // all promotions, regardless of the user's org filter selection (which only
  // governs the Live / Upcoming / Past / Good Fights tabs). Don't filter here.
  const events = (data?.events ?? []).filter(
    (e: any) => !isEventLiveNow(e) && isThisWeekend(e),
  );

  if (events.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="This Weekend" icon={CalendarDays} href="/events/upcoming" />
      <div className="flex flex-col gap-3">
        {events.map((event: any) => {
          const hyped = topFights(event);
          const firstStart = firstFightStart(event);
          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="group flex h-32 items-stretch overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
            >
              <div className="relative w-32 shrink-0 self-stretch overflow-hidden bg-background-secondary sm:w-48">
                {event.bannerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.bannerImage}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold uppercase tracking-wide text-text-secondary">
                    {promotionLabel(event.promotion) || 'TBD'}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
                    {promotionLabel(event.promotion) || 'Event'}
                    <span className="text-[11px] font-normal normal-case tracking-normal text-text-secondary">
                      · {formatDay(event.mainStartTime ?? event.date)}
                      {firstStart ? ` · ${formatTime(firstStart)}` : ''}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground group-hover:text-primary">
                    {event.name}
                  </h3>
                  {hyped.length > 0 && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-secondary">
                      <span className="font-semibold">Top Fights: </span>
                      {hyped
                        .map((f: any) => `${fighterName(f.fighter1)} vs ${fighterName(f.fighter2)}`)
                        .join(', ')}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="shrink-0 self-center text-text-secondary group-hover:text-primary" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
