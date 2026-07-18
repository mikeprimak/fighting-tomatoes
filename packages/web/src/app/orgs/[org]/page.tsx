import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExploreLinks, type ExploreLink } from '@/components/ExploreLinks';
import { ORGS, orgBySlug } from '@/lib/orgs';
import { SITE_URL } from '@/lib/site';
import { fetchBestFacets, fetchTopOrgFights, MIN_LIST_FIGHTS } from '@/lib/bestFights';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

// Auto-updating org hub (Own The SERPs front-load #3): schedule + results +
// fan ratings per promotion, from the same DB the app runs on. 15-minute ISR
// keeps "next event" fresh without per-request backend load.
export const revalidate = 900;

type Props = { params: Promise<{ org: string }> };

export function generateStaticParams() {
  return ORGS.map((o) => ({ org: o.slug }));
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

async function fetchOrgEvents(promotion: string, type: 'upcoming' | 'past', limit: number): Promise<any[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/events?type=${type}&limit=${limit}&promotions=${encodeURIComponent(promotion)}`,
      { next: { revalidate: 900 } },
    );
    if (res.ok) return (await res.json()).events || [];
  } catch {
    // Render whatever we have.
  }
  return [];
}

/** Derived card rating — Event.averageRating/totalRatings are dead fields
 *  (lesson_dataset_aggregates_dishonest), so ratings always come from fights. */
async function fetchCardRating(eventId: string): Promise<{ avg: number; count: number } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/fights?eventId=${eventId}&limit=50`, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const fights = (await res.json()).fights || [];
    let sum = 0;
    let count = 0;
    for (const f of fights) {
      if (typeof f.averageRating === 'number' && f.averageRating > 0 && typeof f.totalRatings === 'number' && f.totalRatings > 0) {
        sum += f.averageRating * f.totalRatings;
        count += f.totalRatings;
      }
    }
    return count > 0 ? { avg: sum / count, count } : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org: slug } = await params;
  const org = orgBySlug(slug);
  if (!org) return { title: 'Organization' };
  const upcoming = await fetchOrgEvents(org.promotion, 'upcoming', 3);
  const next = upcoming[0];
  const title = `${org.name} Schedule & Results — Fan-Rated Events`;
  const description = next
    ? `${org.name} events: next up is ${next.name} on ${formatDate(next.mainStartTime || next.date)}. Full schedule, results, and fan ratings for every card.`
    : `${org.name} events: full schedule, results, and fan ratings for every card.`;
  const canonical = `${SITE_URL}/orgs/${org.slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: canonical },
  };
}

export default async function OrgHubPage({ params }: Props) {
  const { org: slug } = await params;
  const org = orgBySlug(slug);
  if (!org) notFound();

  const [upcoming, past, topFights, facets] = await Promise.all([
    fetchOrgEvents(org.promotion, 'upcoming', 20),
    fetchOrgEvents(org.promotion, 'past', 15),
    // Lowered rating floor so small-promotion hubs still get a strip; the
    // indexable /fights/best/<org> page keeps the standard floor.
    fetchTopOrgFights(org.promotion, 5, 3),
    fetchBestFacets(),
  ]);
  // Link the standalone "best <org> fights" page only when it clears the
  // indexing gate (right now that's UFC; others join as ratings accumulate).
  const bestPageIndexable =
    (facets?.orgs.find((o) => o.promotion.toLowerCase() === org.promotion.toLowerCase())?.count ?? 0) >=
    MIN_LIST_FIGHTS;

  // Fan ratings are the differentiator (P4) — derive a card rating for each
  // recent result. Parallel, ISR-cached, and skipped gracefully on failure.
  const ratings = await Promise.all(past.map((e) => fetchCardRating(e.id)));
  const results = past.map((e, i) => ({ event: e, rating: ratings[i] }));

  const canonicalUrl = `${SITE_URL}/orgs/${org.slug}`;
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
  };
  const itemListLd = upcoming.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `Upcoming ${org.name} events`,
        itemListElement: upcoming.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: e.name,
          url: `${SITE_URL}/events/${e.slug || e.id}`,
        })),
      }
    : null;

  const exploreLinks: ExploreLink[] = [
    ...(bestPageIndexable
      ? [{ href: `/fights/best/${org.slug}`, label: `Best ${org.name} fights` }]
      : []),
    { href: '/schedule', label: 'Fight schedule' },
    { href: '/events', label: 'All events' },
    { href: '/fights/best/2026', label: 'Best fights of 2026' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {itemListLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      )}
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">{org.name} Events — Schedule, Results &amp; Fan Ratings</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Every {org.name} card with real fan ratings — see the schedule, catch up on results, and find out which fights were actually worth watching.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Upcoming {org.name} events</h2>
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li key={e.id} className="rounded-lg border border-border p-3">
                <Link href={`/events/${e.slug || e.id}`} className="font-medium hover:underline">
                  {e.name}
                </Link>
                <div className="text-sm text-text-secondary">
                  {formatDate(e.mainStartTime || e.date)}
                  {e.venue ? ` — ${e.venue}` : ''}
                  {e.location ? `, ${e.location}` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No upcoming events announced yet — check the <Link href="/schedule" className="underline underline-offset-2 hover:text-foreground">full schedule</Link>.</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Recent {org.name} results &amp; fan ratings</h2>
        {results.length > 0 ? (
          <ul className="space-y-2">
            {results.map(({ event: e, rating }) => (
              <li key={e.id} className="rounded-lg border border-border p-3">
                <Link href={`/events/${e.slug || e.id}`} className="font-medium hover:underline">
                  {e.name}
                </Link>
                <div className="text-sm text-text-secondary">
                  {formatDate(e.mainStartTime || e.date)}
                  {rating ? ` — fans rated this card ${rating.avg.toFixed(1)}/10 (${rating.count} ratings)` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No completed events yet.</p>
        )}
      </section>

      {topFights.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold">Highest-rated {org.name} fights</h2>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {topFights.map((fight: any, index: number) => (
              <CompletedFightCard key={fight.id} fight={fight} showRank={index + 1} showEvent />
            ))}
          </div>
          {bestPageIndexable && (
            <p className="mt-2 text-sm">
              <Link href={`/fights/best/${org.slug}`} className="text-primary hover:underline">
                See all the best {org.name} fights →
              </Link>
            </p>
          )}
        </section>
      )}

      <ExploreLinks links={exploreLinks} className="mt-8" />
    </div>
  );
}
