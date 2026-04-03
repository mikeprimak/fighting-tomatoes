import { Metadata } from 'next';
import { EventDetailClient } from './EventDetailClient';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Event — Good Fights' };
    const { event } = await res.json();
    return {
      title: `${event.name} — Good Fights`,
      description: `${event.promotion} event on ${new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}. Rate and review fights on Good Fights.`,
      openGraph: {
        title: event.name,
        description: `${event.promotion} — ${event.venue || ''} ${event.location || ''}`.trim(),
        ...(event.bannerImage ? { images: [event.bannerImage] } : {}),
      },
    };
  } catch {
    return { title: 'Event — Good Fights' };
  }
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;

  let initialEvent = null;
  let initialFights: any[] = [];
  try {
    const [eventRes, fightsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/events/${id}`, { next: { revalidate: 60 } }),
      fetch(`${API_BASE_URL}/events/${id}/fights`, { next: { revalidate: 60 } }),
    ]);
    if (eventRes.ok) initialEvent = (await eventRes.json()).event;
    if (fightsRes.ok) initialFights = (await fightsRes.json()).fights || [];
  } catch {
    // Will show loading state on client
  }

  return <EventDetailClient eventId={id} initialEvent={initialEvent} initialFights={initialFights} />;
}
