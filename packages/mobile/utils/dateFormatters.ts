/**
 * Shared date/time formatting utilities.
 * All event dates are stored as UTC in the database.
 *
 * Hermes (React Native's JS engine) has unreliable Intl/toLocaleTimeString —
 * it often defaults to UTC regardless of timeZone option. We use manual
 * getHours()/getMinutes() for time formatting, which correctly returns local
 * time on modern Hermes. A sanity check with getTimezoneOffset() catches
 * older Hermes builds where getHours() also returns UTC.
 */

/**
 * Get local hours and minutes from a Date, with fallback for broken Hermes.
 * On modern Hermes, getHours()/getMinutes() return local time.
 * On older Hermes where they return UTC, we detect this via getTimezoneOffset()
 * and manually adjust.
 */
const getLocalTime = (date: Date): { hours24: number; minutes: number } => {
  const hours = date.getHours();
  const mins = date.getMinutes();
  const offset = date.getTimezoneOffset(); // positive = west of UTC (e.g. 300 for EST)

  // If getHours() equals getUTCHours() but we're not in UTC, Hermes is broken.
  // For any non-zero offset, local hours NEVER equal UTC hours (mathematically).
  if (hours === date.getUTCHours() && mins === date.getUTCMinutes() && offset !== 0) {
    const totalMins = date.getUTCHours() * 60 + date.getUTCMinutes() - offset;
    const adjusted = ((totalMins % 1440) + 1440) % 1440;
    return { hours24: Math.floor(adjusted / 60), minutes: adjusted % 60 };
  }

  return { hours24: hours, minutes: mins };
};

/** Format 24h time as 12h with am/pm suffix. */
const to12Hour = (hours24: number, minutes: number) => {
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return { hours12, minutes, ampm };
};

interface FormatDateOptions {
  weekday?: 'short' | 'long' | false;
  month?: 'short' | 'long';
  year?: boolean;
}

const ordinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

/**
 * Format an event date as "March 28th" (full month, ordinal day, no weekday).
 * Used when the day-of-week is already shown in a status badge.
 */
export const formatEventDateLong = (dateString: string): string => {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = date.getUTCDate();
  return `${month} ${day}${ordinalSuffix(day)}`;
};

/**
 * Format an event date for display.
 * Default: "Sat, Feb 21" — pass options to customize.
 * Pass weekday: false to omit weekday (e.g. "Feb 21, 2026").
 *
 * Uses timeZone: 'UTC' because event dates are stored as UTC calendar dates
 * (e.g. 2026-02-28T12:00:00Z for a Feb 28 event). Without forcing UTC,
 * toLocaleDateString() converts to local time and can shift the day back
 * (e.g. showing Feb 27 instead of Feb 28 in US timezones).
 */
export const formatEventDate = (
  dateString: string,
  options?: FormatDateOptions,
): string => {
  const date = new Date(dateString);
  const localeOptions: Intl.DateTimeFormatOptions = {
    month: options?.month ?? 'short',
    day: 'numeric',
    timeZone: 'UTC',
  };
  if (options?.weekday === false) {
    // Don't include weekday
  } else if (options?.weekday) {
    localeOptions.weekday = options.weekday;
  } else {
    localeOptions.weekday = 'short';
  }
  if (options?.year) {
    localeOptions.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', localeOptions);
};

/**
 * Format an event time for display using the device's local timezone.
 * Returns e.g. "8:00 PM" or "7:30 PM".
 * Uses manual getHours()/getMinutes() to avoid Hermes Intl issues.
 */
export const formatEventTime = (dateString: string): string => {
  const date = new Date(dateString);
  const { hours24, minutes } = getLocalTime(date);
  const { hours12, ampm } = to12Hour(hours24, minutes);
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

/**
 * Format a compact time display (no timezone, no minutes on the hour).
 * Returns e.g. "8pm" or "7:30pm".
 * Uses manual getHours()/getMinutes() to avoid Hermes Intl issues.
 */
export const formatEventTimeCompact = (dateString: string): string => {
  const date = new Date(dateString);
  const { hours24, minutes } = getLocalTime(date);
  const { hours12, ampm } = to12Hour(hours24, minutes);
  if (minutes === 0) {
    return `${hours12}${ampm.toLowerCase()}`;
  }
  return `${hours12}:${minutes.toString().padStart(2, '0')}${ampm.toLowerCase()}`;
};

/**
 * Collapse Daylight/Standard variants to a single short form so the user
 * doesn't see DST flips (EDT → ET in summer, EST → ET in winter).
 * EDT/EST → ET, CDT/CST → CT, MDT/MST → MT, PDT/PST → PT, AKDT/AKST → AKT,
 * HDT/HST → HT, AEDT/AEST → AET, etc.
 * Leaves non-D/S-pattern abbreviations (GMT, UTC, IST, etc.) untouched.
 */
const collapseDstAbbr = (tz: string): string => {
  const m = tz.match(/^([A-Z]{1,3})[DS]T$/);
  return m ? `${m[1]}T` : tz;
};

/**
 * Get the device's timezone abbreviation (e.g. "ET", "PT") for the given date.
 * DST and Standard variants are collapsed (EDT and EST both render as "ET").
 * Falls back to a GMT offset like "GMT-4" if the platform's Intl support can't
 * produce a short name.
 */
export const getTimezoneAbbreviation = (date: Date): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      hour: 'numeric',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart?.value) {
      return collapseDstAbbr(tzPart.value);
    }
  } catch {
    // fall through
  }
  const offsetMins = date.getTimezoneOffset();
  const offsetHours = -offsetMins / 60;
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * 60);
  return frac === 0
    ? `GMT${sign}${whole}`
    : `GMT${sign}${whole}:${frac.toString().padStart(2, '0')}`;
};

/**
 * Format how long until an event starts.
 * Returns e.g. "TODAY", "TOMORROW", "IN 3 DAYS", "IN 2 WEEKS", etc.
 */
export const formatTimeUntil = (
  eventDateString: string,
  startTimeString?: string,
): string => {
  const eventDate = new Date(eventDateString);
  const now = new Date();

  // Get UTC calendar date for the event (dates are stored as UTC calendar dates)
  // and LOCAL calendar date for today, so we compare calendar days correctly.
  const eventLocalDate = new Date(
    eventDate.getUTCFullYear(),
    eventDate.getUTCMonth(),
    eventDate.getUTCDate(),
  );
  const todayLocalDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  // Calculate difference in calendar days (using local dates)
  const diffMs = eventLocalDate.getTime() - todayLocalDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // If event is TODAY, use start time for granular output
  if (diffDays === 0) {
    const startTime = startTimeString ? new Date(startTimeString) : eventDate;
    const hoursUntil =
      (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil <= 0) {
      return 'TODAY';
    }
    if (hoursUntil < 1) {
      return 'STARTING SOON';
    }
    const hours = Math.floor(hoursUntil);
    if (hours === 1) {
      return 'IN 1 HOUR';
    }
    return `IN ${hours} HOURS`;
  }

  // Future events - use calendar days
  if (diffDays === 1) {
    return 'TOMORROW';
  }

  if (diffDays < 7) {
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return dayNames[eventLocalDate.getDay()];
  }

  const weeksUntil = Math.round(diffDays / 7);
  if (weeksUntil === 1) {
    return 'IN 1 WEEK';
  }

  if (weeksUntil <= 3) {
    return `IN ${weeksUntil} WEEKS`;
  }

  if (weeksUntil >= 5 && weeksUntil <= 7) {
    return `IN ${weeksUntil} WEEKS`;
  }

  const monthsUntil = Math.round(diffDays / 30);
  if (monthsUntil === 1) {
    return 'IN 1 MONTH';
  }

  if (monthsUntil < 12) {
    return `IN ${monthsUntil} MONTHS`;
  }

  const yearsUntil = Math.round(diffDays / 365);
  if (yearsUntil === 1) {
    return 'IN 1 YEAR';
  }

  return `IN ${yearsUntil} YEARS`;
};

/**
 * Format how long ago an event was.
 * Returns e.g. "TODAY", "YESTERDAY", "3 DAYS AGO", "2 WEEKS AGO", etc.
 */
export const formatTimeAgo = (dateString: string): string => {
  const eventDate = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - eventDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'TODAY';
  }

  if (diffDays === 1) {
    return 'YESTERDAY';
  }

  if (diffDays < 7) {
    return `${diffDays} DAYS AGO`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) {
    return '1 WEEK AGO';
  }

  if (diffWeeks < 4) {
    return `${diffWeeks} WEEKS AGO`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) {
    return '1 MONTH AGO';
  }

  if (diffMonths < 12) {
    return `${diffMonths} MONTHS AGO`;
  }

  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) {
    return '1 YEAR AGO';
  }

  return `${diffYears} YEARS AGO`;
};
