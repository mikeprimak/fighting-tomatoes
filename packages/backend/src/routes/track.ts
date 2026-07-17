// packages/backend/src/routes/track.ts
//
// Relay for web conversion events → GA4 Measurement Protocol.
//
// Exists because gtag.js batches events for ~5s and silently drops the queue
// when the page unloads, so click-then-navigate conversions (app_download_click)
// sent from the browser never reach GA4. The web client fires
// navigator.sendBeacon() at this route instead — beacons survive unload — and
// the server forwards to GA4 MP with the server-held API secret.
// See packages/web/src/lib/analytics.ts (trackEventBeacon).

import { FastifyInstance } from 'fastify';

const ALLOWED_EVENTS = new Set(['rating_submitted', 'hype_submitted', 'app_download_click']);
const MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || 'G-WV5RKCMJSB';

interface BeaconBody {
  name?: string;
  clientId?: string;
  sessionId?: string;
  pageLocation?: string;
  params?: Record<string, unknown>;
}

export default async function trackRoutes(fastify: FastifyInstance) {
  // sendBeacon may only carry CORS-safelisted content types (anything else
  // requires a preflight, which can't complete during page unload), so the
  // client posts JSON with a text/plain content type. Parser is scoped to
  // this plugin's encapsulation context.
  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, null);
    }
  });

  // Always answers 204: the beaconing page is usually gone before the
  // response arrives, so no caller can act on an error anyway.
  fastify.post('/ga', async (request, reply) => {
    const secret = process.env.GA4_MP_API_SECRET;
    const body = (request.body || null) as BeaconBody | null;

    if (
      secret &&
      body &&
      typeof body.name === 'string' &&
      ALLOWED_EVENTS.has(body.name) &&
      typeof body.clientId === 'string' &&
      /^\d+\.\d+$/.test(body.clientId)
    ) {
      const params: Record<string, string | number> = {
        // Without engagement time GA4 hides the event from realtime/engagement reports.
        engagement_time_msec: 1,
      };
      if (typeof body.sessionId === 'string' && /^\d{9,11}$/.test(body.sessionId)) {
        params.session_id = body.sessionId;
      }
      if (typeof body.pageLocation === 'string') {
        params.page_location = body.pageLocation.slice(0, 420);
      }
      const extra = body.params && typeof body.params === 'object' ? body.params : {};
      for (const [key, value] of Object.entries(extra).slice(0, 10)) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || key in params) continue;
        if (typeof value === 'number' && Number.isFinite(value)) params[key] = value;
        else if (typeof value === 'string') params[key] = value.slice(0, 100);
      }

      try {
        const res = await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${secret}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: body.clientId,
              events: [{ name: body.name, params }],
            }),
            signal: AbortSignal.timeout(4000),
          }
        );
        // MP returns 2xx even for invalid payloads; non-2xx means transport-level trouble.
        if (!res.ok) {
          fastify.log.warn({ status: res.status, event: body.name }, 'GA4 MP relay non-2xx');
        }
      } catch (err) {
        fastify.log.warn({ err, event: body.name }, 'GA4 MP relay failed');
      }
    }

    return reply.code(204).send();
  });
}
