/**
 * The subscribable fight calendar: webcal://goodfights.app/calendar/upcoming.ics
 *
 * Subscribe once and every upcoming card we track shows up in your calendar,
 * refreshing on its own as new events get announced and placeholder start
 * times get resolved. This is the "merge the app with my calendar" answer —
 * a one-time add rather than a per-event download.
 *
 * `?org=<slug>` narrows the feed to one promotion (slugs from lib/orgs.ts, so
 * shelved orgs are not addressable).
 */

import { buildCalendar, buildVEvent, nowStamp } from '@/lib/ics';
import { fetchScheduleEvents, type ScheduleEvent } from '@/lib/schedule';
import { orgBySlug } from '@/lib/orgs';

// Calendar clients poll on their own schedule; 30 min of edge cache is plenty
// and keeps a popular feed off the backend.
export const revalidate = 1800;

const REFRESH_MINUTES = 720; // 12h — the hint we give clients that honor it.

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('org');
  const org = slug ? orgBySlug(slug) : undefined;
  if (slug && !org) return new Response('Unknown org', { status: 404 });

  let events: ScheduleEvent[] = await fetchScheduleEvents(revalidate);
  if (org) {
    events = events.filter((e) => e.promotion?.toLowerCase() === org.promotion.toLowerCase());
  }

  const stamp = nowStamp();
  const ics = buildCalendar(
    events.map((e) => buildVEvent(e, stamp, 'subscribe')),
    {
      name: org ? `${org.name} Fight Calendar` : 'Good Fights — Fight Calendar',
      description: org
        ? `Every upcoming ${org.name} card, from Good Fights.`
        : 'Every upcoming MMA, boxing and bare-knuckle card we track, from Good Fights.',
      refreshMinutes: REFRESH_MINUTES,
    },
  );

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="good-fights${org ? `-${org.slug}` : ''}.ics"`,
      'Cache-Control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=7200',
    },
  });
}
