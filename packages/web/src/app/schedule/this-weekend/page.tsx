import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import {
  fetchScheduleEvents,
  fetchUSBroadcastNames,
  buildScheduleJsonLd,
  eventStart,
  etDayKey,
  formatDayKey,
  weekendDayKeys,
} from '@/lib/schedule';
import { ScheduleEventRow } from '@/components/schedule/ScheduleEventRow';

export const revalidate = 900;

function weekendLabel(keys: string[]): string {
  const fri = formatDayKey(keys[0], { weekday: undefined });
  const sun = formatDayKey(keys[2], { weekday: undefined });
  const sameMonth = keys[0].slice(0, 7) === keys[2].slice(0, 7);
  // Same month: "July 17–19". Straddling months: "July 31–August 2".
  return sameMonth ? `${fri}–${sun.replace(/^\w+ /, '')}` : `${fri}–${sun}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const keys = weekendDayKeys(new Date());
  const title = `MMA & Boxing Fights This Weekend (${weekendLabel(keys)}) — Full Schedule`;
  const description = `Every MMA, boxing, and bare-knuckle card this weekend (Friday through Sunday): local start times, headliners, US broadcasts, and fan hype scores.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/schedule/this-weekend` },
    openGraph: { title, description, type: 'website', url: `${SITE_URL}/schedule/this-weekend` },
  };
}

export default async function FightsThisWeekendPage() {
  const events = await fetchScheduleEvents();
  const keys = weekendDayKeys(new Date());
  const keySet = new Set(keys);
  const weekend = events.filter((e) => keySet.has(etDayKey(eventStart(e))));
  const next = events.find((e) => etDayKey(eventStart(e)) > keys[2]);

  const broadcasts = await Promise.all(weekend.map((e) => fetchUSBroadcastNames(e.id)));
  const broadcastByEvent = new Map(weekend.map((e, i) => [e.id, broadcasts[i]]));

  const byDay = new Map<string, typeof weekend>();
  for (const e of weekend) {
    const k = etDayKey(eventStart(e));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(e);
  }

  const jsonLd = buildScheduleJsonLd(
    weekend,
    `MMA & Boxing Fights This Weekend (${weekendLabel(keys)})`,
    `${SITE_URL}/schedule/this-weekend`,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">Fights This Weekend</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {weekend.length > 0
            ? `${weekend.length === 1 ? 'One card' : `${weekend.length} cards`} between Friday and Sunday (${weekendLabel(keys)}), with local start times, US broadcasts, and fan hype scores.`
            : `No cards scheduled for ${weekendLabel(keys)} yet.`}
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Schedule views">
        <Link href="/schedule" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Full schedule
        </Link>
        <Link href="/schedule/tonight" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Fights tonight
        </Link>
        <Link href="/events/past" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Recent results
        </Link>
      </nav>

      {weekend.length > 0 ? (
        [...byDay.entries()].map(([dayKey, dayEvents]) => (
          <section key={dayKey} className="mb-6">
            <h2 className="mb-2 text-lg font-bold">{formatDayKey(dayKey)}</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {dayEvents.map((e) => (
                <ScheduleEventRow key={e.id} event={e} broadcastNames={broadcastByEvent.get(e.id) || []} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-text-secondary">Nothing announced for this weekend yet.</p>
          {next && (
            <p className="mt-2 text-sm">
              Next card:{' '}
              <Link href={`/events/${next.slug || next.id}`} className="font-semibold text-primary hover:underline">
                {next.name}
              </Link>{' '}
              on {formatDayKey(etDayKey(eventStart(next)))}.
            </p>
          )}
          <p className="mt-2 text-sm text-text-secondary">
            Browse the{' '}
            <Link href="/schedule" className="text-primary hover:underline">full schedule</Link>.
          </p>
        </div>
      )}

      <p className="mt-8 text-sm text-text-secondary">
        Updated automatically as start times and broadcasts are confirmed. Rate the fights you
        watch with{' '}
        <Link href="/download?utm_source=web&utm_medium=schedule-weekend&utm_campaign=get-the-app" className="text-primary hover:underline">
          the Good Fights app
        </Link>
        .
      </p>
    </div>
  );
}
