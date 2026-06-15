'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { getEvents } from '@/lib/api';
import { isEventLiveNow } from '@/lib/eventStatus';
import { useEventBroadcasts } from '@/components/HowToWatch';
import { SectionHeading } from './SectionHeading';

/**
 * "Events this weekend" — the upcoming cards happening between now and the end
 * of the current week, grouped into per-day sections exactly like the mobile
 * home: today through the upcoming Sunday; on a Monday it spans the full next
 * week so the band isn't empty at the top of the week. Each day renders under
 * its own "Events Today / Tomorrow / <weekday>" heading with the date as a
 * subline; compact teaser cards link into the event detail page.
 */
const DAY_MS = 86_400_000;

// Event.date is a UTC-hour placeholder, so the day a card belongs to is its UTC
// calendar day. Keying on UTC keeps web and mobile grouping identical.
function eventDayKey(dateStr: string): number {
  const dt = new Date(dateStr);
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

// "Events Today" / "Events Tomorrow" / "Events Saturday" — per-day group heading,
// derived from the event's UTC calendar day vs the user's local today.
function eventDayLabel(dateStr: string): string {
  const now = new Date();
  const todayK = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const evK = eventDayKey(dateStr);
  const days = Math.round((evK - todayK) / DAY_MS);
  if (days <= 0) return 'Events Today';
  if (days === 1) return 'Events Tomorrow';
  const weekday = new Date(evK).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `Events ${weekday}`;
}

// Date subline under a day heading, e.g. "Sat, Jun 7" (UTC, like mobile).
function formatDaySubline(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
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

/** Promotion label for display — some are stored with underscores (e.g.
 *  "TOP_RANK"); show them with spaces. */
function promotionLabel(promotion: string | null | undefined): string {
  return (promotion ?? '').replace(/_/g, ' ');
}

/** Card-wide AI "why care" blurb, gated on the same >= 0.5 confidence floor the
 *  rest of the app uses. Null when there's no confident summary yet. */
function aiSummary(event: any): string | null {
  return event.aiEventConfidence != null && event.aiEventConfidence >= 0.5 && event.aiEventSummary
    ? event.aiEventSummary
    : null;
}

export function WeekendEventsSection() {
  // Upcoming events come back soonest-first, so this weekend's cards are always
  // among the first handful. The home cards show only the event + its AI "why
  // care" summary, so we do NOT request includeFights — that made the backend
  // aggregate hype/counts for every fight on every event (the slowest part of
  // this above-the-fold band). 16 safely covers a full week of events (incl. the
  // Monday-spans-next-week window).
  const { data } = useQuery({
    queryKey: ['home', 'weekend-events'],
    queryFn: () => getEvents({ type: 'upcoming', includeFights: false, limit: 16 }),
    staleTime: 5 * 60 * 1000,
  });

  // Past events, used only to surface "Event Last Night" — the most recent UFC
  // card that ran in the last day. Past events come back most-recent-first, so a
  // small page comfortably covers the window. UFC only (by design).
  const { data: pastData } = useQuery({
    queryKey: ['home', 'last-night-ufc'],
    queryFn: () => getEvents({ type: 'past', includeFights: false, limit: 8 }),
    staleTime: 5 * 60 * 1000,
  });

  // "This weekend" window = today up to (but not including) the Monday that
  // starts next week — the rest of the current Mon–Sun week. On Monday it rolls
  // to the whole next week. UTC day keys (Event.date is a UTC-hour placeholder),
  // anchored on the user's local calendar date — identical to the mobile home.
  const now = new Date();
  const todayKey = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const localDow = now.getDay(); // 0=Sun … 6=Sat
  let daysUntilNextMonday = (1 - localDow + 7) % 7; // 0 when today is Monday
  if (daysUntilNextMonday === 0) daysUntilNextMonday = 7; // on Monday, span the full week
  const nextMondayKey = todayKey + daysUntilNextMonday * DAY_MS;

  // The home screen is org-agnostic by design: every section shows content from
  // all promotions, regardless of the user's org filter selection (which only
  // governs the Live / Upcoming / Past / Good Fights tabs). Don't filter here.
  //
  // Keep LIVE events in the band (badged "LIVE" on the card) alongside the
  // upcoming ones — mirrors the mobile home, where a card that just went live
  // shouldn't vanish. Sorted by day, then live-first within a day (happening
  // now), then soonest-start.
  const events = (data?.events ?? [])
    .filter((e: any) => {
      const k = eventDayKey(e.date);
      return k >= todayKey && k < nextMondayKey;
    })
    .sort((a: any, b: any) => {
      const dayDiff = eventDayKey(a.date) - eventDayKey(b.date);
      if (dayDiff !== 0) return dayDiff;
      const aLive = isEventLiveNow(a);
      const bLive = isEventLiveNow(b);
      if (aLive !== bLive) return aLive ? -1 : 1;
      const at = new Date(a.mainStartTime ?? a.date).getTime();
      const bt = new Date(b.mainStartTime ?? b.date).getTime();
      return at - bt;
    });

  // "Event Last Night" — UFC only (not other promotions). A UFC card belongs here
  // on the day(s) immediately after it ran: its UTC calendar day is today or
  // yesterday (UFC events start late and roll past midnight ET, so "yesterday"
  // catches the common Saturday-night → Sunday-morning case). Most-recent-first.
  const lastNightUFC = (pastData?.events ?? []).filter((e: any) => {
    if ((e.promotion ?? '').toUpperCase() !== 'UFC') return false;
    const daysSince = Math.round((todayKey - eventDayKey(e.date)) / DAY_MS);
    return daysSince >= 0 && daysSince <= 1;
  });

  if (events.length === 0 && lastNightUFC.length === 0) return null;

  // Group the sorted events into per-day buckets, first-appearance order
  // preserved (the list is already day-sorted), so each day gets its own heading.
  const eventsByDay: { key: number; label: string; subline: string; events: any[] }[] = [];
  const byKey = new Map<number, (typeof eventsByDay)[number]>();
  for (const e of events) {
    const k = eventDayKey(e.date);
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, label: eventDayLabel(e.date), subline: formatDaySubline(e.date), events: [] };
      byKey.set(k, g);
      eventsByDay.push(g);
    }
    g.events.push(e);
  }

  return (
    <div className="mb-8 flex flex-col gap-8">
      {lastNightUFC.length > 0 && (
        <section>
          <SectionHeading
            title="Event Last Night"
            subtitle={lastNightUFC.length === 1 ? formatDaySubline(lastNightUFC[0].date) : undefined}
            icon={CalendarDays}
          />
          <div className="flex flex-col gap-3">
            {lastNightUFC.map((event: any) => (
              <EventDayCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
      {eventsByDay.map((day, di) => (
        <section key={day.key}>
          <SectionHeading
            title={day.label}
            subtitle={day.subline}
            icon={CalendarDays}
            // Only the first day's heading carries the "see all" link (matches mobile).
            href={di === 0 ? '/events/upcoming' : undefined}
          />
          <div className="flex flex-col gap-3">
            {day.events.map((event: any) => (
              <EventDayCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * One compact teaser card. Its own component so each can fetch its broadcast
 * channel — shown right after the start time / LIVE pill, mirroring the mobile
 * home's EventRow.
 */
function EventDayCard({ event }: { event: any }) {
  const summary = aiSummary(event);
  const firstStart = firstFightStart(event);
  const live = isEventLiveNow(event);

  // Main-card broadcast channel for the user's region, shown beside the time.
  // Prefer the MAIN_CARD entry (matches the headline start time), then a
  // whole-event one, then whatever's first — same precedence as mobile.
  const { data: broadcastsData } = useEventBroadcasts(event.id);
  const channel = useMemo(() => {
    const bs = broadcastsData?.broadcasts ?? [];
    const entry =
      bs.find((b) => b.cardSection === 'MAIN_CARD') ||
      bs.find((b) => b.cardSection === null) ||
      bs[0];
    return entry?.channel?.name ?? null;
  }, [broadcastsData]);

  // Meta line: start time (or LIVE pill) then the broadcast channel.
  const timeText = !live && firstStart ? formatTime(firstStart) : null;
  const metaText = [timeText, channel].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex min-h-32 items-stretch overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
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
          <div className="mb-0.5 flex flex-wrap items-center gap-x-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
            {promotionLabel(event.promotion) || 'Event'}
            {live ? (
              // Live: a red LIVE pill takes the start-time slot (start time
              // dropped, just like the mobile home); channel follows it.
              <span className="inline-flex items-center gap-1 rounded bg-[#E11D2A] px-1.5 py-0.5 text-[10px] font-extrabold normal-case tracking-wide text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                LIVE
              </span>
            ) : null}
            {metaText && (
              // Date lives in the day heading; the card meta is the start time
              // and/or broadcast channel.
              <span className="text-[11px] font-normal normal-case tracking-normal text-text-secondary">
                · {metaText}
              </span>
            )}
          </div>
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground group-hover:text-primary">
            {event.name}
          </h3>
          {summary && (
            <p className="mt-1 text-[11px] leading-snug text-text-secondary">
              {summary}
            </p>
          )}
        </div>
        <ChevronRight size={16} className="shrink-0 self-center text-text-secondary group-hover:text-primary" />
      </div>
    </Link>
  );
}
