/**
 * Server-side data + date helpers for the schedule hubs
 * (/schedule, /schedule/tonight, /schedule/this-weekend).
 *
 * These pages exist for the "ufc tonight / mma fights this weekend /
 * fight schedule" query family: permanent URLs whose content auto-updates
 * from the events API. All "day" math is done in US Eastern time — the
 * canonical fight-fan clock (cards are announced and searched in ET).
 *
 * Event.date is a UTC-hour placeholder on some legacy rows; mainStartTime
 * is the real instant when present (see lesson_event_date_is_utc_hour_placeholder).
 */

import { orgByPromotion, type OrgSport } from '@/lib/orgs';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export const ET = 'America/New_York';

/** Sport bucket of an event via the org registry. Unknown promotions return
 *  undefined so sport-facet hubs fail closed (miss a card, never pollute). */
export function eventSport(e: { promotion: string }): OrgSport | undefined {
  return orgByPromotion(e.promotion)?.sport;
}

export interface ScheduleFight {
  id: string;
  slug?: string;
  weightClass?: string | null;
  isTitle?: boolean;
  titleName?: string | null;
  orderOnCard?: number | null;
  cardType?: string | null;
  averageHype?: number | null;
  hypeCount?: number | null;
  fighter1?: { firstName?: string; lastName?: string } | null;
  fighter2?: { firstName?: string; lastName?: string } | null;
}

export interface ScheduleEvent {
  id: string;
  slug?: string | null;
  name: string;
  promotion: string;
  date: string;
  venue?: string | null;
  location?: string | null;
  eventStatus: string;
  mainStartTime?: string | null;
  prelimStartTime?: string | null;
  earlyPrelimStartTime?: string | null;
  aiEventSummary?: string | null;
  aiEventConfidence?: number | null;
  fights?: ScheduleFight[];
}

/** The instant an event really starts (prefer the resolved start times). */
export function eventStart(e: ScheduleEvent): Date {
  return new Date(e.mainStartTime || e.date);
}

/** First bell — the earliest known section start, for "coverage starts" lines. */
export function eventFirstBell(e: ScheduleEvent): Date {
  return new Date(e.earlyPrelimStartTime || e.prelimStartTime || e.mainStartTime || e.date);
}

/** YYYY-MM-DD of an instant in ET. */
export function etDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 0=Sunday..6=Saturday of an instant in ET. */
export function etWeekday(d: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Add n calendar days to an ET day key. */
export function addDaysToKey(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12)); // noon avoids DST edges
  noonUtc.setUTCDate(noonUtc.getUTCDate() + n);
  return noonUtc.toISOString().slice(0, 10);
}

/** "Friday, July 17" for an ET day key. */
export function formatDayKey(dayKey: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...opts,
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "10:00 PM ET" for an instant. */
export function formatTimeET(d: Date): string {
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)} ET`;
}

/**
 * The current weekend's [Friday..Sunday] ET day keys. Monday-Thursday points
 * at the upcoming weekend; Friday-Sunday keeps pointing at the one in
 * progress (searchers on a Saturday mean *this* weekend, not next).
 */
export function weekendDayKeys(now: Date): string[] {
  const todayKey = etDayKey(now);
  const wd = etWeekday(now);
  // Fri=5. Sunday (wd=0) belongs to the weekend already in progress — its
  // Friday was two days back, not five days ahead.
  const daysToFriday = wd === 0 ? -2 : 5 - wd;
  const friday = addDaysToKey(todayKey, daysToFriday);
  return [friday, addDaysToKey(friday, 1), addDaysToKey(friday, 2)];
}

/**
 * All upcoming events with fights, soonest first. One fetch feeds all three
 * hub pages; 15-min ISR keeps "tonight" honest without hammering the API.
 */
export async function fetchScheduleEvents(revalidate = 900): Promise<ScheduleEvent[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/events?type=upcoming&limit=100&includeFights=true`,
      { next: { revalidate } },
    );
    if (!res.ok) return [];
    const events: ScheduleEvent[] = (await res.json()).events || [];
    return events.sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
  } catch {
    return [];
  }
}

/**
 * US broadcast channel names for an event ("Paramount+", "DAZN PPV"...).
 * Region is pinned to US so SSR output is deterministic (the API would
 * otherwise geo-detect from the server's IP).
 */
export async function fetchUSBroadcastNames(eventId: string, revalidate = 3600): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/broadcasts?region=US`, {
      next: { revalidate },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const names: string[] = [];
    for (const b of data.broadcasts || []) {
      const name = b?.channel?.name;
      if (name && !names.includes(name)) names.push(name);
    }
    return names.slice(0, 3);
  } catch {
    return [];
  }
}

/** Main event = lowest orderOnCard on the main card (order 1 is the headliner). */
export function mainEvent(e: ScheduleEvent): ScheduleFight | null {
  const fights = (e.fights || []).filter((f) => f.fighter1 && f.fighter2);
  if (!fights.length) return null;
  const mainCard = fights.filter((f) => {
    const c = (f.cardType || '').toLowerCase();
    return !c.includes('prelim');
  });
  const pool = mainCard.length ? mainCard : fights;
  return pool.reduce((best, f) =>
    (f.orderOnCard ?? 99) < (best.orderOnCard ?? 99) ? f : best,
  );
}

export function fightLabel(f: ScheduleFight): string {
  const n = (p?: { firstName?: string; lastName?: string } | null) =>
    [p?.firstName, p?.lastName].filter(Boolean).join(' ');
  return `${n(f.fighter1)} vs ${n(f.fighter2)}`;
}

/** Peak hype across a card, so hubs can surface "the fight to watch". */
export function peakHype(e: ScheduleEvent): { fight: ScheduleFight; hype: number } | null {
  let best: { fight: ScheduleFight; hype: number } | null = null;
  for (const f of e.fights || []) {
    const hype = f.averageHype ?? 0;
    if ((f.hypeCount ?? 0) > 0 && hype > 0 && (!best || hype > best.hype)) {
      best = { fight: f, hype };
    }
  }
  return best;
}

/** SportsEvent ItemList JSON-LD for a set of schedule events. */
export function buildScheduleJsonLd(events: ScheduleEvent[], name: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: events.length,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    itemListElement: events.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'SportsEvent',
        name: e.name,
        startDate: eventStart(e).toISOString(),
        eventStatus: 'https://schema.org/EventScheduled',
        ...(e.venue || e.location
          ? {
              location: {
                '@type': 'Place',
                name: e.venue || e.location,
                ...(e.location ? { address: e.location } : {}),
              },
            }
          : {}),
        url: `https://goodfights.app/events/${e.slug || e.id}`,
      },
    })),
  };
}
