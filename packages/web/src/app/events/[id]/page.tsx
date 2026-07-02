import { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { EventDetailClient } from './EventDetailClient';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Card-level fan rating, computed from the fights (weighted by rating count).
 * `Event.averageRating`/`totalRatings` are dead fields — fan engagement lives on
 * the fights (see lesson_dataset_aggregates_dishonest) — so the event's rating
 * is always derived, never read off the event row.
 */
function cardRating(fights: any[]): { avg: number; count: number } | null {
  let sum = 0;
  let count = 0;
  for (const f of fights) {
    if (typeof f.averageRating === 'number' && f.averageRating > 0 && typeof f.totalRatings === 'number' && f.totalRatings > 0) {
      sum += f.averageRating * f.totalRatings;
      count += f.totalRatings;
    }
  }
  return count > 0 ? { avg: sum / count, count } : null;
}

async function fetchEventFights(eventId: string, revalidate: number): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/fights?eventId=${eventId}&limit=50`, { next: { revalidate } });
    if (res.ok) return (await res.json()).fights || [];
  } catch {
    // Fall through — callers treat an empty list as "no fight data".
  }
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Event' };
    const { event } = await res.json();
    const isPast = event.eventStatus === 'COMPLETED';
    const dateStr = formatDate(event.date);
    const where = [event.venue, event.location].filter(Boolean).join(', ');

    // Lifecycle title/description swap — the same URL serves both search-intent
    // waves: "how to watch X" before the event, "X results" after (see
    // docs/plans/programmatic-seo-2026-07-01.md, step 5 + evergreen strategy).
    let title: string;
    let description: string;
    if (isPast) {
      title = `${event.name} Results & Fan Ratings`;
      const rating = cardRating(await fetchEventFights(event.id, 300));
      description = rating
        ? `${event.name} results: fans rated this card ${rating.avg.toFixed(1)}/10 across ${rating.count} ratings. Fight-by-fight results and community ratings.`
        : `${event.name} results: full fight card results and fan ratings for every fight. ${event.promotion}, ${dateStr}.`;
    } else {
      title = `${event.name} — Fight Card & How to Watch`;
      description = `${event.promotion} event on ${dateStr}${where ? ` at ${where}` : ''}. Full fight card, start times, and how to watch.`;
    }

    const canonical = `${SITE_URL}/events/${event.slug || id}`;
    return {
      title,
      description,
      alternates: { canonical },
      // SEO index gate: keep pages that fail the backend `shouldIndex` predicate out
      // of Google's index (and the sitemap) while still rendering for users.
      ...(event.shouldIndex === false ? { robots: { index: false, follow: true } } : {}),
      openGraph: {
        title,
        description,
        type: 'website',
        url: canonical,
        ...(event.bannerImage ? { images: [event.bannerImage] } : {}),
      },
    };
  } catch {
    return { title: 'Event' };
  }
}

/**
 * SportsEvent structured data for the whole card. Each fight becomes a subEvent
 * carrying its own AggregateRating (our proprietary fan data — the rich-snippet
 * differentiator), and completed cards get a derived card-level AggregateRating.
 * Ratings are only emitted when real ones exist; never fabricated.
 */
function buildEventJsonLd(event: any, fights: any[], url: string) {
  const start = event.mainStartTime || event.date;
  const ld: any = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  if (start) ld.startDate = new Date(start).toISOString();
  if (event.venue || event.location) {
    ld.location = { '@type': 'Place', name: event.venue || event.location };
    if (event.venue && event.location) ld.location.address = event.location;
  }
  if (event.promotion) ld.organizer = { '@type': 'Organization', name: event.promotion };
  if (event.aiEventSummary && typeof event.aiEventConfidence === 'number' && event.aiEventConfidence >= 0.5) {
    ld.description = event.aiEventSummary;
  }
  if (event.eventStatus === 'UPCOMING' || event.eventStatus === 'LIVE') {
    ld.eventStatus = 'https://schema.org/EventScheduled';
  } else if (event.eventStatus === 'CANCELLED') {
    ld.eventStatus = 'https://schema.org/EventCancelled';
  }

  const rating = event.eventStatus === 'COMPLETED' ? cardRating(fights) : null;
  if (rating) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(rating.avg.toFixed(2)),
      ratingCount: rating.count,
      bestRating: 10,
      worstRating: 1,
    };
  }

  const subEvents = fights
    .filter((f) => f.fighter1 && f.fighter2)
    .map((f) => {
      const sub: any = {
        '@type': 'SportsEvent',
        name: `${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}`,
        competitor: [
          { '@type': 'Person', name: `${f.fighter1.firstName} ${f.fighter1.lastName}` },
          { '@type': 'Person', name: `${f.fighter2.firstName} ${f.fighter2.lastName}` },
        ],
      };
      if (f.slug) sub.url = `${SITE_URL}/fights/${f.slug}`;
      if (typeof f.averageRating === 'number' && f.averageRating > 0 && typeof f.totalRatings === 'number' && f.totalRatings > 0) {
        sub.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: Number(f.averageRating.toFixed(2)),
          ratingCount: f.totalRatings,
          bestRating: 10,
          worstRating: 1,
        };
      }
      return sub;
    });
  if (subEvents.length > 0) ld.subEvent = subEvents;

  return ld;
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;

  let initialEvent = null;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${id}`, { next: { revalidate: 60 } });
    if (res.ok) initialEvent = (await res.json()).event;
  } catch {
    // Will show loading state on client
  }

  // Canonicalize to the slug URL (see fighter page for rationale). Outside the
  // try/catch — permanentRedirect throws NEXT_REDIRECT.
  if (initialEvent?.slug && initialEvent.slug !== id) {
    permanentRedirect(`/events/${initialEvent.slug}`);
  }

  // Data fetches key off the real event UUID (the URL may carry the slug; the
  // ?eventId= filter only matches UUIDs).
  const realId = initialEvent?.id ?? id;
  const initialFights = await fetchEventFights(realId, 60);

  const canonicalUrl = `${SITE_URL}/events/${initialEvent?.slug ?? id}`;
  const jsonLd = initialEvent ? buildEventJsonLd(initialEvent, initialFights, canonicalUrl) : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <EventDetailClient eventId={realId} initialEvent={initialEvent} initialFights={initialFights} />
    </>
  );
}
