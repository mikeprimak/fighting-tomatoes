import { Metadata } from 'next';
import Link from 'next/link';
import { ORGS } from '@/lib/orgs';
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

// Same promotion → logo mapping used by weekly-hype / fight-of-the-night.
function getPromoLogoUrl(promo: string): string | null {
  if (!promo) return null;
  const upper = promo.toUpperCase();
  if (upper.includes('UFC')) return '/promo-logos/ufc.png';
  if (upper.includes('PFL')) return '/promo-logos/pfl.png';
  if (upper.includes('BKFC')) return '/promo-logos/bkfc.png';
  if (upper.includes('ONE')) return '/promo-logos/one.png';
  if (upper.includes('OKTAGON')) return '/promo-logos/oktagon.png';
  if (upper.includes('RIZIN')) return '/promo-logos/rizin.png';
  if (upper.includes('KARATE COMBAT')) return '/promo-logos/karate-combat.png';
  if (upper.includes('DIRTY BOXING')) return '/promo-logos/dirtyboxing.png';
  if (upper.includes('MATCHROOM') || upper.includes('DAZN')) return '/promo-logos/matchroom.png';
  if (upper.includes('TOP RANK')) return '/promo-logos/toprank.png';
  if (upper.includes('GOLDEN BOY')) return '/promo-logos/golden-boy.png';
  if (upper.includes('ZUFFA')) return '/promo-logos/zuffa-boxing.png';
  if (upper.includes('MVP') || upper.includes('MOST VALUABLE')) return '/promo-logos/mvp.png';
  if (upper.includes('PREMIER BOXING') || upper.includes('PBC')) return '/promo-logos/pbc.png';
  return null;
}

function EventThumb({ event }: { event: any }) {
  const src = event.bannerImage || getPromoLogoUrl(event.promotion || '');
  if (src) {
    return (
      <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={`h-full w-full ${event.bannerImage ? 'object-cover' : 'object-contain p-1'}`}
        />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-background text-xs font-bold text-text-secondary">
      {(event.promotion || event.name || '?').slice(0, 3).toUpperCase()}
    </div>
  );
}

function EventRow({ event }: { event: any }) {
  return (
    <Link
      href={`/events/${event.slug || event.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-background/40"
    >
      <EventThumb event={event} />
      <div className="min-w-0 flex-1">
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

      {/* Org hub crawl entry (Own The SERPs front-load #3): the events index is
          the natural parent for the per-promotion hub pages. */}
      <nav aria-label="Browse by organization" className="mt-10 border-t border-border pt-6">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Browse by organization
        </h2>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-text-secondary">
          {ORGS.map((o) => (
            <li key={o.slug}>
              <Link href={`/orgs/${o.slug}`} className="underline-offset-2 hover:text-foreground hover:underline">
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
