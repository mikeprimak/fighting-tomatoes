import { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Upcoming and recent MMA, boxing, and combat sports events — fight cards, start times, results, and fan ratings on Good Fights.',
  alternates: { canonical: `${SITE_URL}/events` },
};

async function fetchEvents(type: 'upcoming' | 'past', limit: number): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/events?type=${type}&limit=${limit}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) return (await res.json()).events || [];
  } catch {
    // Section renders empty on failure; the client tabs still work.
  }
  return [];
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function EventRow({ event }: { event: any }) {
  return (
    <Link
      href={`/events/${event.slug || event.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-background/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{event.name}</p>
        <p className="mt-0.5 truncate text-xs text-text-secondary">
          {[event.promotion, [event.venue, event.location].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join(' — ')}
        </p>
      </div>
      <span className="shrink-0 text-xs text-text-secondary">{formatDate(event.date)}</span>
    </Link>
  );
}

/**
 * SSR events hub (programmatic-SEO step 6). The live/upcoming/past tab pages
 * are client-rendered (their SSR HTML is a spinner), so this page is the
 * crawlable internal-link entry into the ~640 indexable event deep pages.
 */
export default async function EventsIndexPage() {
  const [upcoming, past] = await Promise.all([
    fetchEvents('upcoming', 30),
    fetchEvents('past', 30),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Events</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Combat sports fight cards — how to watch upcoming events, plus results and fan ratings
          for recent ones.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Event views">
        <Link href="/events/live" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          Live now
        </Link>
        <Link href="/events/upcoming" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          All upcoming
        </Link>
        <Link href="/events/past" className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
          All past
        </Link>
      </nav>

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Upcoming events
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {upcoming.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Recent results
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {past.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <p className="py-8 text-center text-sm text-text-secondary">No events found.</p>
      )}
    </div>
  );
}
