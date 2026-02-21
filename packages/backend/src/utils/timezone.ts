/**
 * Timezone-aware date utility for converting local event times to UTC.
 *
 * Combat sports websites display times in local timezones (e.g., "5:00 PM EDT").
 * The database stores everything in UTC. This utility bridges the gap using
 * Intl.DateTimeFormat, which handles DST transitions automatically.
 */

/**
 * Convert a local date+time in a given IANA timezone to a UTC Date.
 *
 * Example: localTimeToUTC(2026, 1, 21, 17, 0, 'America/New_York')
 *   → 2026-02-21T22:00:00.000Z  (5pm ET = 10pm UTC)
 *
 * @param year   - Full year (e.g., 2026)
 * @param month  - 0-indexed month (0 = January, 1 = February, ...)
 * @param day    - Day of month (1-31)
 * @param hour24 - Hour in 24-hour format (0-23)
 * @param minute - Minute (0-59)
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns Date object in UTC
 */
export function localTimeToUTC(
  year: number,
  month: number,
  day: number,
  hour24: number,
  minute: number,
  timezone: string
): Date {
  // Start with an initial guess: treat the local time as if it were UTC
  const guess = new Date(Date.UTC(year, month, day, hour24, minute, 0, 0));

  // Format that UTC instant in the target timezone to see what local time it maps to
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(guess);
  const get = (type: string) => {
    const val = parts.find(p => p.type === type)?.value || '0';
    return parseInt(val, 10);
  };

  const localHour = get('hour') === 24 ? 0 : get('hour');
  const localDay = get('day');
  const localMonth = get('month') - 1; // formatToParts returns 1-indexed month
  const localMinute = get('minute');

  // Calculate how far off the guess is from our target local time
  const guessLocalMs = Date.UTC(year, localMonth, localDay, localHour, localMinute, 0, 0);
  const targetLocalMs = Date.UTC(year, month, day, hour24, minute, 0, 0);
  const offsetMs = guessLocalMs - targetLocalMs;

  // Adjust: subtract the offset to get the UTC time that maps to our target local time
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Parse a 12-hour time string (e.g., "5:00 PM") into 24-hour components.
 * Returns null if the string can't be parsed.
 */
export function parseTime12h(timeStr: string): { hour24: number; minute: number } | null {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let hour24 = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const isPM = match[3].toUpperCase() === 'PM';

  if (isPM && hour24 !== 12) {
    hour24 += 12;
  } else if (!isPM && hour24 === 12) {
    hour24 = 0;
  }

  return { hour24, minute };
}

/**
 * Combine an event date (UTC Date) with a local time string in a specific timezone.
 * This is the main function scrapers should use.
 *
 * @param eventDate - The event's calendar date (as a UTC Date, e.g., from an ISO string)
 * @param timeStr   - Time string like "7:00 PM" or "10:00 PM"
 * @param timezone  - IANA timezone (e.g., 'America/New_York', 'Europe/London')
 * @returns UTC Date, or null if timeStr can't be parsed
 */
export function eventTimeToUTC(
  eventDate: Date,
  timeStr: string | null | undefined,
  timezone: string
): Date | null {
  if (!timeStr) return null;

  const parsed = parseTime12h(timeStr);
  if (!parsed) return null;

  const year = eventDate.getUTCFullYear();
  const month = eventDate.getUTCMonth();
  const day = eventDate.getUTCDate();

  return localTimeToUTC(year, month, day, parsed.hour24, parsed.minute, timezone);
}
