/**
 * Date formatting utilities for web.
 * Ported from packages/mobile/utils/dateFormatters.ts
 * Web doesn't have Hermes issues, so we use standard APIs.
 */

const ordinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

export const formatEventDateLong = (dateString: string): string => {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = date.getUTCDate();
  return `${month} ${day}${ordinalSuffix(day)}`;
};

interface FormatDateOptions {
  weekday?: 'short' | 'long' | false;
  month?: 'short' | 'long';
  year?: boolean;
}

export const formatEventDate = (dateString: string, options?: FormatDateOptions): string => {
  const date = new Date(dateString);
  const localeOptions: Intl.DateTimeFormatOptions = {
    month: options?.month ?? 'short',
    day: 'numeric',
    timeZone: 'UTC',
  };
  if (options?.weekday === false) {
    // no weekday
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

export const formatEventTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const formatEventTimeCompact = (dateString: string): string => {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h12 = hours % 12 || 12;
  if (minutes === 0) return `${h12}${ampm}`;
  return `${h12}:${minutes.toString().padStart(2, '0')}${ampm}`;
};

export const formatTimeUntil = (eventDateString: string, startTimeString?: string): string => {
  const eventDate = new Date(eventDateString);
  const now = new Date();
  const eventLocalDate = new Date(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate());
  const todayLocalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = eventLocalDate.getTime() - todayLocalDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const startTime = startTimeString ? new Date(startTimeString) : eventDate;
    const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil <= 0) return 'TODAY';
    if (hoursUntil < 1) return 'STARTING SOON';
    const hours = Math.floor(hoursUntil);
    return hours === 1 ? 'IN 1 HOUR' : `IN ${hours} HOURS`;
  }
  if (diffDays === 1) return 'TOMORROW';
  if (diffDays < 7) {
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return dayNames[eventLocalDate.getDay()];
  }
  const weeksUntil = Math.round(diffDays / 7);
  if (weeksUntil === 1) return 'IN 1 WEEK';
  if (weeksUntil <= 7) return `IN ${weeksUntil} WEEKS`;
  const monthsUntil = Math.round(diffDays / 30);
  if (monthsUntil === 1) return 'IN 1 MONTH';
  if (monthsUntil < 12) return `IN ${monthsUntil} MONTHS`;
  const yearsUntil = Math.round(diffDays / 365);
  return yearsUntil === 1 ? 'IN 1 YEAR' : `IN ${yearsUntil} YEARS`;
};

export const formatTimeAgo = (dateString: string): string => {
  const eventDate = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - eventDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) return `${diffDays} DAYS AGO`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 WEEK AGO';
  if (diffWeeks < 4) return `${diffWeeks} WEEKS AGO`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 MONTH AGO';
  if (diffMonths < 12) return `${diffMonths} MONTHS AGO`;
  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? '1 YEAR AGO' : `${diffYears} YEARS AGO`;
};
