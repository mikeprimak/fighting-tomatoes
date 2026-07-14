import Link from 'next/link';
import {
  type ScheduleEvent,
  eventStart,
  eventFirstBell,
  formatTimeET,
  mainEvent,
  fightLabel,
  peakHype,
} from '@/lib/schedule';

/**
 * One event on a schedule hub. Server-rendered, link-rich, and data-forward:
 * start times, headliner, hype (the thing only Good Fights has), broadcast.
 */
export function ScheduleEventRow({
  event,
  broadcastNames = [],
  showDate = false,
}: {
  event: ScheduleEvent;
  broadcastNames?: string[];
  showDate?: boolean;
}) {
  const start = eventStart(event);
  const firstBell = eventFirstBell(event);
  const main = mainEvent(event);
  const hype = peakHype(event);
  const href = `/events/${event.slug || event.id}`;
  const summary =
    event.aiEventSummary && (event.aiEventConfidence ?? 0) >= 0.5 ? event.aiEventSummary : null;

  return (
    <article className="border-b border-border p-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
          {event.promotion}
        </span>
        <h3 className="text-base font-bold">
          <Link href={href} className="hover:text-primary hover:underline">
            {event.name}
          </Link>
        </h3>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        {showDate && (
          <>
            {new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            }).format(start)}
            {' · '}
          </>
        )}
        Main card {formatTimeET(start)}
        {firstBell.getTime() < start.getTime() && <> · first fight {formatTimeET(firstBell)}</>}
        {(event.venue || event.location) && (
          <> · {[event.venue, event.location].filter(Boolean).join(', ')}</>
        )}
      </p>

      {main && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">{fightLabel(main)}</span>
          {main.weightClass && (
            <span className="text-text-secondary"> · {main.weightClass.toLowerCase().replace(/_/g, ' ')}</span>
          )}
          {main.isTitle && <span className="text-primary"> · title fight</span>}
        </p>
      )}

      {hype && hype.hype >= 5 && (
        <p className="mt-1 text-sm text-text-secondary">
          Most hyped: {fightLabel(hype.fight)} — fans rate the anticipation{' '}
          <span className="font-semibold text-foreground">{hype.hype.toFixed(1)}/10</span>
        </p>
      )}

      {broadcastNames.length > 0 && (
        <p className="mt-1 text-sm text-text-secondary">Watch on: {broadcastNames.join(', ')} (US)</p>
      )}

      {summary && <p className="mt-2 text-sm leading-relaxed text-text-secondary">{summary}</p>}

      <p className="mt-2 text-sm">
        <Link href={href} className="text-primary hover:underline">
          Full card, start times &amp; fan hype →
        </Link>
      </p>
    </article>
  );
}
