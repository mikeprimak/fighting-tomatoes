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
  formatTimeET,
} from '@/lib/schedule';
import { ScheduleEventRow } from '@/components/schedule/ScheduleEventRow';

export const revalidate = 900;

function todayET(): string {
  return etDayKey(new Date());
}

function todayLabel(): string {
  return formatDayKey(todayET(), { weekday: undefined, year: 'numeric' });
}

export async function generateMetadata(): Promise<Metadata> {
  const title = `MMA & Boxing Fights Tonight (${todayLabel()}) — Cards, Start Times, How to Watch`;
  const description = `Which fights are on tonight? Every MMA, boxing, and bare-knuckle card happening today with start times in ET, headliners, US broadcasts, and fan hype scores.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/schedule/tonight` },
    openGraph: { title, description, type: 'website', url: `${SITE_URL}/schedule/tonight` },
  };
}

export default async function FightsTonightPage() {
  const events = await fetchScheduleEvents();
  const today = todayET();
  const tonight = events.filter((e) => etDayKey(eventStart(e)) === today);
  const next = events.find((e) => etDayKey(eventStart(e)) > today);

  // Broadcast lookups only for tonight's few events (that's where the
  // how-to-watch intent lives).
  const broadcasts = await Promise.all(tonight.map((e) => fetchUSBroadcastNames(e.id)));

  const jsonLd = buildScheduleJsonLd(
    tonight,
    `MMA & Boxing Fights Tonight (${todayLabel()})`,
    `${SITE_URL}/schedule/tonight`,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">Fights Tonight — {formatDayKey(today)}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {tonight.length > 0
            ? `${tonight.length === 1 ? 'One fight card is' : `${tonight.length} fight cards are`} on today. Start times in ET, with US broadcast info and fan hype scores from the Good Fights community.`
            : 'No fight cards on the schedule today.'}
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Schedule views">
        <Link href="/schedule" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Full schedule
        </Link>
        <Link href="/schedule/this-weekend" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          This weekend
        </Link>
        <Link href="/events/live" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Live now
        </Link>
      </nav>

      {tonight.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {tonight.map((e, i) => (
            <ScheduleEventRow key={e.id} event={e} broadcastNames={broadcasts[i]} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-text-secondary">Nothing on tonight.</p>
          {next && (
            <p className="mt-2 text-sm">
              Next up:{' '}
              <Link href={`/events/${next.slug || next.id}`} className="font-semibold text-primary hover:underline">
                {next.name}
              </Link>{' '}
              on {formatDayKey(etDayKey(eventStart(next)))} at {formatTimeET(eventStart(next))}.
            </p>
          )}
          <p className="mt-2 text-sm text-text-secondary">
            See the{' '}
            <Link href="/schedule" className="text-primary hover:underline">full upcoming schedule</Link>{' '}
            or catch up on{' '}
            <Link href="/events/past" className="text-primary hover:underline">recent results</Link>.
          </p>
        </div>
      )}

      <p className="mt-8 text-sm text-text-secondary">
        This page updates automatically as cards are announced and start times firm up. Hype
        scores come from fan ratings on{' '}
        <Link href="/download?utm_source=web&utm_medium=schedule-tonight&utm_campaign=get-the-app" className="text-primary hover:underline">
          the Good Fights app
        </Link>
        .
      </p>
    </div>
  );
}
