import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import {
  fetchScheduleEvents,
  buildScheduleJsonLd,
  eventStart,
  etDayKey,
  formatDayKey,
} from '@/lib/schedule';
import { ScheduleEventRow } from '@/components/schedule/ScheduleEventRow';

// "Tonight"-adjacent content has to stay honest — regenerate at most every 15 min.
export const revalidate = 900;

function monthYearET(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export async function generateMetadata(): Promise<Metadata> {
  const title = `MMA & Boxing Schedule (${monthYearET()}) — Upcoming Fight Cards & Start Times`;
  const description = `Every upcoming MMA, boxing, and bare-knuckle fight card in one place: UFC, BKFC, ONE, Oktagon, PFL, RIZIN and more, with dates, start times, headliners, and fan hype scores.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/schedule` },
    openGraph: { title, description, type: 'website', url: `${SITE_URL}/schedule` },
  };
}

export default async function SchedulePage() {
  const events = await fetchScheduleEvents();
  const jsonLd = buildScheduleJsonLd(events, 'Upcoming MMA & Boxing Schedule', `${SITE_URL}/schedule`);

  // Group by ET calendar day, soonest first (events arrive pre-sorted).
  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const key = etDayKey(eventStart(e));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">MMA &amp; Boxing Schedule</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every upcoming fight card we track — UFC, BKFC, ONE, Oktagon, PFL, RIZIN, Karate Combat
          and more — with local start times, headliners, and fan hype scores. Updated continuously.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Schedule views">
        <Link href="/schedule/tonight" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Fights tonight
        </Link>
        <Link href="/schedule/this-weekend" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          This weekend
        </Link>
        <Link href="/schedule/boxing" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Boxing
        </Link>
        <Link href="/events/past" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Recent results
        </Link>
        <a
          href={`${SITE_URL.replace(/^https?:/, 'webcal:')}/calendar/upcoming.ics`}
          className="rounded-full border border-primary bg-card px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
        >
          📅 Subscribe to this calendar
        </a>
      </nav>

      <p className="mb-5 text-xs text-text-secondary">
        Subscribing adds every card below to your own calendar app, and keeps it current as new
        events are announced and start times firm up.{' '}
        <a href="/calendar/upcoming.ics" className="text-primary hover:underline">
          Download the .ics
        </a>{' '}
        instead if your calendar app does not handle webcal links.
      </p>

      {events.length === 0 && (
        <p className="py-12 text-center text-sm text-text-secondary">
          No upcoming events right now — check back soon or browse{' '}
          <Link href="/events/past" className="text-primary hover:underline">recent results</Link>.
        </p>
      )}

      {[...byDay.entries()].map(([dayKey, dayEvents]) => (
        <section key={dayKey} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{formatDayKey(dayKey)}</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {dayEvents.map((e) => (
              <ScheduleEventRow key={e.id} event={e} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-8 text-sm text-text-secondary">
        Wondering what&apos;s worth watching? Fan hype scores on every card above come from real
        ratings on Good Fights — see{' '}
        <Link href="/fights/top" className="text-primary hover:underline">the best recent fights</Link>{' '}
        or{' '}
        <Link href="/download?utm_source=web&utm_medium=schedule&utm_campaign=get-the-app" className="text-primary hover:underline">
          get the app
        </Link>{' '}
        to rate them yourself.
      </p>
    </div>
  );
}
