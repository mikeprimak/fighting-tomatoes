/**
 * Per-event "Add to Calendar" download: /events/<id>/calendar.ics
 *
 * Served from the same events API the event page reads, so the entry can never
 * disagree with what's on screen. Mobile links to this URL directly (iOS opens
 * the add-to-calendar sheet, Android hands it to the calendar app), which is
 * why this lives on the web app and needs no native calendar dependency.
 */

import { buildCalendar, buildVEvent, nowStamp, type IcsEventInput } from '@/lib/ics';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

// Start times firm up as a card approaches; 15 min matches the schedule hubs.
export const revalidate = 900;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const res = await fetch(`${API_BASE_URL}/events/${id}`, { next: { revalidate } });
  if (!res.ok) {
    return new Response('Event not found', { status: 404 });
  }

  const { event } = (await res.json()) as { event: IcsEventInput | null };
  if (!event) return new Response('Event not found', { status: 404 });

  const ics = buildCalendar([buildVEvent(event, nowStamp(), 'add-to-calendar')], {
    name: event.name,
  });

  // Filename is cosmetic but shows up in the download + some calendar UIs.
  const filename = `${event.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}.ics`;

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
