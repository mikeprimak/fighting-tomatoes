/**
 * iCalendar (RFC 5545) generation for fight cards.
 *
 * Two consumers:
 *  - `/events/[id]/calendar.ics` — a single VEVENT the user adds once.
 *  - `/calendar/upcoming.ics` — the subscribable feed (webcal://), which the
 *    user's calendar app re-fetches on its own as cards get announced and
 *    start times firm up.
 *
 * Time handling: every DTSTART we emit is a UTC instant (`...Z`), so calendar
 * apps localize it for the viewer with no timezone work on our side. The one
 * exception is an event whose start times haven't been resolved yet — there we
 * emit an all-day VEVENT on the ET calendar day rather than inventing a clock
 * time, because `Event.date` is a UTC-hour placeholder on many rows
 * (see lesson_event_date_is_utc_hour_placeholder). Null > guess.
 */

import { SITE_URL } from './site';
import { ET, formatTimeET } from './schedule';

export interface IcsEventInput {
  id: string;
  name: string;
  promotion?: string | null;
  date: string;
  venue?: string | null;
  location?: string | null;
  mainStartTime?: string | null;
  prelimStartTime?: string | null;
  earlyPrelimStartTime?: string | null;
}

/** Fight cards run long; 5h covers prelims-through-main for all but the outliers. */
const EVENT_DURATION_MS = 5 * 60 * 60 * 1000;

/** RFC 5545 §3.3.11 — escape the text-value specials. Order matters (backslash first). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1 — fold content lines at 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

/** UTC instant → `20260815T230000Z`. */
function toUtcStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** Instant → `20260815` in ET (all-day fallback when no start time is known). */
function toEtDateStamp(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/-/g, '');
}

/** Next ET calendar day, for an all-day VEVENT's exclusive DTEND. */
function nextEtDateStamp(d: Date): string {
  return toEtDateStamp(new Date(d.getTime() + 24 * 60 * 60 * 1000));
}

function eventUrl(id: string, campaign: string): string {
  return `${SITE_URL}/events/${id}?utm_source=calendar&utm_medium=ics&utm_campaign=${campaign}`;
}

/**
 * The instant to put on the calendar: first bell if we know it, else main card.
 * Subscribers want the block that covers the whole card, so the earliest
 * resolved section start wins.
 */
function resolvedStart(e: IcsEventInput): Date | null {
  const iso = e.earlyPrelimStartTime || e.prelimStartTime || e.mainStartTime;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDescription(e: IcsEventInput, campaign: string): string {
  const lines: string[] = [];
  const start = resolvedStart(e);
  // The block starts at first bell, so name the main-card time when it differs.
  if (e.mainStartTime && start && new Date(e.mainStartTime).getTime() !== start.getTime()) {
    lines.push(`Main card: ${formatTimeET(new Date(e.mainStartTime))}`);
  }
  if (!start) {
    lines.push('Start time not announced yet — this entry updates when it is.');
  }
  lines.push(`Card, fan hype scores and ratings: ${eventUrl(e.id, campaign)}`);
  return lines.join('\n');
}

/**
 * One VEVENT. `dtstamp` is passed in so a whole feed shares a single stamp
 * (and so callers can keep output deterministic).
 */
export function buildVEvent(e: IcsEventInput, dtstamp: string, campaign: string): string[] {
  const start = resolvedStart(e);
  const summary = e.promotion && !e.name.toLowerCase().startsWith(e.promotion.toLowerCase())
    ? `${e.promotion}: ${e.name}`
    : e.name;
  const where = [e.venue, e.location].filter(Boolean).join(', ');

  const lines = ['BEGIN:VEVENT', `UID:event-${e.id}@goodfights.app`, `DTSTAMP:${dtstamp}`];

  if (start) {
    lines.push(`DTSTART:${toUtcStamp(start)}`);
    lines.push(`DTEND:${toUtcStamp(new Date(start.getTime() + EVENT_DURATION_MS))}`);
  } else {
    // Date known, clock unknown — an all-day block is the honest representation.
    const day = new Date(e.date);
    lines.push(`DTSTART;VALUE=DATE:${toEtDateStamp(day)}`);
    lines.push(`DTEND;VALUE=DATE:${nextEtDateStamp(day)}`);
  }

  lines.push(`SUMMARY:${escapeText(summary)}`);
  if (where) lines.push(`LOCATION:${escapeText(where)}`);
  lines.push(`DESCRIPTION:${escapeText(buildDescription(e, campaign))}`);
  lines.push(`URL:${eventUrl(e.id, campaign)}`);
  lines.push('END:VEVENT');
  return lines;
}

/** Wrap VEVENT blocks in a VCALENDAR and serialize with CRLF + line folding. */
export function buildCalendar(
  vevents: string[][],
  opts: { name: string; description?: string; refreshMinutes?: number },
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Good Fights//goodfights.app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
  ];
  if (opts.description) lines.push(`X-WR-CALDESC:${escapeText(opts.description)}`);
  if (opts.refreshMinutes) {
    // Both spellings: REFRESH-INTERVAL is the RFC 7986 one, X-PUBLISHED-TTL is
    // what Outlook and several older clients actually read.
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${opts.refreshMinutes}M`);
    lines.push(`X-PUBLISHED-TTL:PT${opts.refreshMinutes}M`);
  }
  for (const ve of vevents) lines.push(...ve);
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** A single dtstamp for a whole response. */
export function nowStamp(): string {
  return toUtcStamp(new Date());
}
