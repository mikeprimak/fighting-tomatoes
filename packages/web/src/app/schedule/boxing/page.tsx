import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { ORGS } from '@/lib/orgs';
import {
  fetchScheduleEvents,
  fetchUSBroadcastNames,
  buildScheduleJsonLd,
  eventStart,
  eventSport,
  etDayKey,
  formatDayKey,
} from '@/lib/schedule';
import { ScheduleEventRow } from '@/components/schedule/ScheduleEventRow';

// Sport-facet schedule hub (Own The SERPs P2). Born from the 2026-07-20 GSC
// report: "boxing tonight / boxing match today / boxing fight today" already
// ranked positions 2.5-5.4 on the combined MMA pages with ~0 clicks — Google
// wants a boxing-specific answer from us and this is that page.
export const revalidate = 900;

function todayET(): string {
  return etDayKey(new Date());
}

function monthYearET(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export async function generateMetadata(): Promise<Metadata> {
  const title = `Boxing Tonight & Upcoming Boxing Schedule (${monthYearET()})`;
  const description = `Is there a boxing match tonight? Every upcoming boxing card — Matchroom, Golden Boy, Top Rank, Zuffa Boxing, MVP — with dates, local start times, headliners, US broadcasts, and fan hype scores.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/schedule/boxing` },
    openGraph: { title, description, type: 'website', url: `${SITE_URL}/schedule/boxing` },
  };
}

export default async function BoxingSchedulePage() {
  const events = await fetchScheduleEvents();
  const boxing = events.filter((e) => eventSport(e) === 'boxing');
  const today = todayET();
  const tonight = boxing.filter((e) => etDayKey(eventStart(e)) === today);
  const upcoming = boxing.filter((e) => etDayKey(eventStart(e)) > today);
  const next = upcoming[0];

  // How-to-watch intent lives on this whole page, not just tonight — boxing
  // cards are few, so broadcast lookups for all of them stay cheap.
  const broadcasts = await Promise.all(boxing.map((e) => fetchUSBroadcastNames(e.id)));
  const broadcastByEvent = new Map(boxing.map((e, i) => [e.id, broadcasts[i]]));

  const byDay = new Map<string, typeof upcoming>();
  for (const e of upcoming) {
    const k = etDayKey(eventStart(e));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(e);
  }

  const boxingOrgs = ORGS.filter((o) => o.sport === 'boxing');
  const jsonLd = buildScheduleJsonLd(
    boxing,
    `Boxing Schedule — Tonight & Upcoming Cards`,
    `${SITE_URL}/schedule/boxing`,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">Boxing Schedule — Tonight &amp; Upcoming Cards</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every upcoming boxing card we track — Matchroom, Golden Boy, Top Rank, Zuffa Boxing, MVP
          and more — with local start times, headliners, US broadcasts, and fan hype scores.
          Updated continuously.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Schedule views">
        <Link href="/schedule" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Full schedule
        </Link>
        <Link href="/schedule/tonight" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Fights tonight
        </Link>
        <Link href="/schedule/this-weekend" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          This weekend
        </Link>
      </nav>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">Boxing tonight — {formatDayKey(today)}</h2>
        {tonight.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {tonight.map((e) => (
              <ScheduleEventRow key={e.id} event={e} broadcastNames={broadcastByEvent.get(e.id) || []} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-text-secondary">No boxing tonight.</p>
            {next && (
              <p className="mt-1 text-sm">
                The next boxing card is{' '}
                <Link href={`/events/${next.slug || next.id}`} className="font-semibold text-primary hover:underline">
                  {next.name}
                </Link>{' '}
                on {formatDayKey(etDayKey(eventStart(next)))}.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">Upcoming boxing schedule</h2>
        {upcoming.length > 0 ? (
          [...byDay.entries()].map(([dayKey, dayEvents]) => (
            <section key={dayKey} className="mb-4">
              <h3 className="mb-2 text-lg font-bold">{formatDayKey(dayKey)}</h3>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {dayEvents.map((e) => (
                  <ScheduleEventRow key={e.id} event={e} broadcastNames={broadcastByEvent.get(e.id) || []} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="text-sm text-text-secondary">
            No upcoming boxing cards announced yet — see the{' '}
            <Link href="/schedule" className="text-primary hover:underline">full fight schedule</Link>.
          </p>
        )}
      </section>

      <p className="mb-8 text-sm text-text-secondary">
        Looking for bare-knuckle? See the{' '}
        <Link href="/orgs/bkfc" className="text-primary hover:underline">BKFC schedule &amp; results</Link>.
        Boxing promotion pages:{' '}
        {boxingOrgs.map((o, i) => (
          <span key={o.slug}>
            {i > 0 && ', '}
            <Link href={`/orgs/${o.slug}`} className="text-primary hover:underline">{o.name}</Link>
          </span>
        ))}
        .
      </p>

      <p className="mt-8 text-sm text-text-secondary">
        This page updates automatically as cards are announced and start times firm up. Hype
        scores come from fan ratings on{' '}
        <Link href="/download?utm_source=web&utm_medium=schedule-boxing&utm_campaign=get-the-app" className="text-primary hover:underline">
          the Good Fights app
        </Link>
        .
      </p>
    </div>
  );
}
