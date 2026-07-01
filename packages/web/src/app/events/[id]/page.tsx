import { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { EventDetailClient } from './EventDetailClient';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Event' };
    const { event } = await res.json();
    return {
      title: event.name,
      description: `${event.promotion} event on ${new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. Rate and review fights on Good Fights.`,
      alternates: { canonical: `${SITE_URL}/events/${event.slug || id}` },
      // SEO index gate: keep pages that fail the backend `shouldIndex` predicate out
      // of Google's index (and the sitemap) while still rendering for users.
      ...(event.shouldIndex === false ? { robots: { index: false, follow: true } } : {}),
      openGraph: {
        title: event.name,
        description: `${event.promotion} — ${event.venue || ''} ${event.location || ''}`.trim(),
        ...(event.bannerImage ? { images: [event.bannerImage] } : {}),
      },
    };
  } catch {
    return { title: 'Event' };
  }
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
  let initialFights: any[] = [];
  try {
    const fightsRes = await fetch(`${API_BASE_URL}/fights?eventId=${realId}&limit=50`, { next: { revalidate: 60 } });
    if (fightsRes.ok) initialFights = (await fightsRes.json()).fights || [];
  } catch {
    // Will show loading state on client
  }

  return <EventDetailClient eventId={realId} initialEvent={initialEvent} initialFights={initialFights} />;
}
