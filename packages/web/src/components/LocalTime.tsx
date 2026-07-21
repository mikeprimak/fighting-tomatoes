'use client';

import { useEffect, useState } from 'react';
import { formatEventTime, formatEventTimeCompact, getTimezoneAbbreviation } from '@/utils/dateFormatters';

const ET = 'America/New_York';

/**
 * True after hydration. Time-of-day strings depend on the runtime timezone, so
 * the server HTML and the first client render must agree on a fixed zone —
 * Eastern, the sport's canonical clock — and only swap to the viewer's local
 * timezone once mounted. Rendering local time straight away would hydrate
 * against server-UTC HTML (mismatch + a flash of the wrong clock).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** "8:00 PM ET" (long) / "8pm ET" (compact) pre-mount; viewer-local time with
 *  a matching label (e.g. "5:00 PM PT") once mounted. */
export function localTimeString(iso: string, variant: 'long' | 'compact', mounted: boolean): string {
  const format = variant === 'compact' ? formatEventTimeCompact : formatEventTime;
  if (!mounted) return `${format(iso, ET)} ET`;
  return `${format(iso)} ${getTimezoneAbbreviation(new Date(iso))}`;
}

export function LocalTime({ iso, variant = 'long' }: { iso: string; variant?: 'long' | 'compact' }) {
  const mounted = useMounted();
  return <>{localTimeString(iso, variant, mounted)}</>;
}
