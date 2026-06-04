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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {events.map((event: any) => {
          const fightCount = Array.isArray(event.fights) ? event.fights.length : 0;
          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="group flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background-secondary">
                {event.bannerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.bannerImage}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase tracking-wide text-text-secondary">
                    {event.promotion ?? 'TBD'}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {event.promotion ?? 'Event'}
                  <span className="font-normal normal-case tracking-normal text-text-secondary">
                    · {formatDay(event.mainStartTime ?? event.date)}
                  </span>
                </div>
                <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground group-hover:text-primary">
                  {event.name}
                </h3>
                {fightCount > 0 && (
                  <p className="mt-0.5 text-[11px] text-text-secondary">{fightCount} fights</p>
                )}
              </div>
              <ChevronRight size={16} className="shrink-0 text-text-secondary group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
