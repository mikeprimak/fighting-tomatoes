interface EventLike {
  eventStatus?: string;
  date?: string;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
}

// Treat an event as live if backend has flagged it LIVE or its earliest start
// time has passed and it isn't COMPLETED. Mirrors the mobile lifecycle fallback
// so tabs don't lag the 5-minute backend tick.
export function isEventLiveNow(event: EventLike): boolean {
  if (event.eventStatus === 'LIVE') return true;
  if (event.eventStatus === 'COMPLETED') return false;
  const startStr =
    event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime || event.date;
  if (!startStr) return false;
  return Date.now() >= new Date(startStr).getTime();
}
