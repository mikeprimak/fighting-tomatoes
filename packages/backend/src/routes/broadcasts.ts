import { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { authenticateUser } from '../middleware/auth';
import { optionalAuthenticateMiddleware } from '../middleware/auth.fastify';
import { resolveRegionFromRequest, isValidRegion, REGIONS, type Region } from '../services/region';

interface ChannelLite {
  slug: string;
  name: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  affiliateUrl: string | null;
}

interface BroadcastDTO {
  id: string;
  channel: ChannelLite;
  tier: 'FREE' | 'SUBSCRIPTION' | 'PPV';
  deepLink: string | null;
  note: string | null;
  language: string | null;
  source: 'MANUAL' | 'SCRAPED' | 'DEFAULT';
  cardSection: string | null;
}

const BACKEND_URL = process.env.BACKEND_URL || 'https://fightcrewapp-backend.onrender.com';

// Resolve the real outbound target for a broadcast, mirroring the redirect
// endpoint's logic: event-specific deep link > channel affiliate URL > homepage.
// Returns null when there's nothing to link to (so the client hides the link).
function resolveTarget(
  eventDeepLink: string | null,
  channel: { affiliateUrl: string | null; homepageUrl: string | null },
): string | null {
  return eventDeepLink ?? channel.affiliateUrl ?? channel.homepageUrl ?? null;
}

interface LinkCtx {
  channelId: string;
  eventId: string;
  region: string;
  section: string | null;
  tier: string;
  placement: string;
  broadcastId?: string;
}

// Build the tracked redirect URL the client opens. Hitting it logs a
// BroadcastClick then 302s to the resolved target. We only emit a link when a
// real target exists, so existing client behaviour (hide chevron when no link)
// is preserved. The target itself is NEVER carried in the URL — the redirect
// re-resolves it server-side from channelId, so this can't be an open redirect
// and always reflects the latest affiliate URL.
function buildTrackedLink(target: string | null, ctx: LinkCtx): string | null {
  if (!target) return null;
  const p = new URLSearchParams();
  p.set('c', ctx.channelId);
  p.set('e', ctx.eventId);
  p.set('r', ctx.region);
  if (ctx.section) p.set('s', ctx.section);
  if (ctx.tier) p.set('t', ctx.tier);
  if (ctx.placement) p.set('p', ctx.placement);
  if (ctx.broadcastId) p.set('b', ctx.broadcastId);
  return `${BACKEND_URL}/api/r/b?${p.toString()}`;
}

function clientPlatform(request: { headers: Record<string, any> }): string {
  const raw = (request.headers['x-client-platform'] as string | undefined)?.toLowerCase();
  return raw === 'web' || raw === 'mobile' ? raw : 'unknown';
}

export default async function broadcastsRoutes(fastify: FastifyInstance) {
  // GET /api/r/b — tracked broadcaster redirect (the monetization hop).
  // Resolves the real target from channelId server-side (so this can never be
  // an open redirect), logs a BroadcastClick, then 302s the user out to the
  // affiliate / homepage URL. Opened directly by the user's system browser, so
  // it is unauthenticated and must stay side-effect-light + always redirect.
  fastify.get('/r/b', async (request, reply) => {
    const q = request.query as {
      c?: string; e?: string; r?: string; s?: string; t?: string; p?: string; b?: string;
    };
    const channelId = q.c;
    if (!channelId) return reply.code(400).send({ error: 'missing channel' });

    const channel = await fastify.prisma.broadcastChannel.findUnique({
      where: { id: channelId },
      select: { id: true, affiliateUrl: true, homepageUrl: true },
    });
    if (!channel) return reply.code(404).send({ error: 'unknown channel' });

    // Event-specific deep link takes precedence over the channel default.
    let eventDeepLink: string | null = null;
    if (q.b) {
      const eb = await fastify.prisma.eventBroadcast.findUnique({
        where: { id: q.b },
        select: { eventDeepLink: true, channelId: true },
      });
      // Only honour it if the row really belongs to this channel.
      if (eb && eb.channelId === channelId) eventDeepLink = eb.eventDeepLink ?? null;
    }

    const monetized = eventDeepLink ?? channel.affiliateUrl ?? null;
    const target = monetized ?? channel.homepageUrl ?? null;
    if (!target) return reply.code(404).send({ error: 'no destination' });

    // Log the click — never let logging failure block the redirect.
    try {
      const ip = (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        || (request as any).ip
        || '';
      const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : null;
      await fastify.prisma.broadcastClick.create({
        data: {
          channelId,
          eventId: q.e || null,
          region: isValidRegion(q.r) ? (q.r as string) : (q.r || 'US'),
          cardSection: q.s || null,
          tier: q.t || null,
          placement: q.p || 'unknown',
          targetUrl: target,
          isAffiliate: !!monetized,
          ipHash,
          userAgent: (request.headers['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
          referer: (request.headers['referer'] as string | undefined)?.slice(0, 500) ?? null,
        },
      });
    } catch (err) {
      request.log.warn({ err }, 'broadcast click logging failed');
    }

    return reply.redirect(target, 302);
  });

  // GET /api/events/:id/broadcasts?region=GB
  // Public — returns the broadcasts list for the resolved region.
  fastify.get('/events/:id/broadcasts', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const userId = (request as any).user?.id as string | undefined;

    let userPref: string | null = null;
    if (userId) {
      const u = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { broadcastRegion: true },
      });
      userPref = u?.broadcastRegion ?? null;
    }

    const { region, detectedFrom } = resolveRegionFromRequest(request, userPref);
    const placement = clientPlatform(request);

    const event = await fastify.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, promotion: true },
    });
    if (!event) {
      return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }

    // 1. Per-event broadcasts for this region
    const explicit = await fastify.prisma.eventBroadcast.findMany({
      where: { eventId, region, isActive: true },
      include: { channel: true },
      orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
    });

    let broadcasts: BroadcastDTO[] = explicit.map(b => ({
      id: b.id,
      channel: {
        slug: b.channel.slug,
        name: b.channel.name,
        logoUrl: b.channel.logoUrl,
        homepageUrl: b.channel.homepageUrl,
        affiliateUrl: b.channel.affiliateUrl,
      },
      tier: b.tier,
      deepLink: buildTrackedLink(resolveTarget(b.eventDeepLink, b.channel), {
        channelId: b.channelId,
        eventId,
        region,
        section: (b as any).cardSection ?? null,
        tier: b.tier,
        placement,
        broadcastId: b.id,
      }),
      note: b.note,
      language: b.language,
      source: b.source,
      cardSection: (b as any).cardSection ?? null,
    }));

    // 2. Fall back to promotion defaults if no explicit rows
    if (broadcasts.length === 0) {
      const allDefaults = await fastify.prisma.promotionBroadcastDefault.findMany({
        where: { promotion: event.promotion, region, isActive: true },
        include: { channel: true },
        orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
      });
      // If any defaults specify a card section, drop the cardSection=null
      // ("Fallback") rows — they're legacy whole-event entries from before
      // section support existed and would otherwise render as a duplicate
      // top-level How-to-Watch card in the mobile app.
      const hasSectionSpecific = allDefaults.some(d => (d as any).cardSection !== null);
      const defaults = hasSectionSpecific
        ? allDefaults.filter(d => (d as any).cardSection !== null)
        : allDefaults;
      broadcasts = defaults.map(d => ({
        id: `default-${d.id}`,
        channel: {
          slug: d.channel.slug,
          name: d.channel.name,
          logoUrl: d.channel.logoUrl,
          homepageUrl: d.channel.homepageUrl,
          affiliateUrl: d.channel.affiliateUrl,
        },
        tier: d.tier,
        deepLink: buildTrackedLink(resolveTarget(null, d.channel), {
          channelId: d.channelId,
          eventId,
          region,
          section: (d as any).cardSection ?? null,
          tier: d.tier,
          placement,
        }),
        note: d.note,
        language: null,
        source: 'DEFAULT' as const,
        cardSection: (d as any).cardSection ?? null,
      }));
    }

    return reply.send({
      eventId,
      region,
      detectedFrom,
      availableRegions: REGIONS,
      broadcasts,
    });
  });

  // POST /api/events/:id/broadcasts/report
  // User reports an incorrect/missing broadcast.
  fastify.post('/events/:id/broadcasts/report', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const body = request.body as { region?: string; reason?: string; broadcastId?: string };
    const userId = (request as any).user?.id as string | undefined;

    if (!body?.region || !isValidRegion(body.region)) {
      return reply.code(400).send({ error: 'Invalid region', code: 'INVALID_REGION' });
    }
    const reason = (body.reason ?? '').trim();
    if (!reason || reason.length > 1000) {
      return reply.code(400).send({ error: 'reason required (≤1000 chars)', code: 'INVALID_REASON' });
    }

    const event = await fastify.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) return reply.code(404).send({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });

    const report = await fastify.prisma.broadcastReport.create({
      data: {
        eventId,
        region: body.region,
        reason,
        broadcastId: body.broadcastId ?? null,
        reportedBy: userId ?? null,
      },
      select: { id: true },
    });

    return reply.code(201).send({ reportId: report.id });
  });

  // PATCH /api/users/me/broadcast-region
  // Authenticated — sets the persistent region preference (or clears it).
  fastify.patch('/users/me/broadcast-region', {
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as { region?: Region | null };

    if (body.region !== null && body.region !== undefined && !isValidRegion(body.region)) {
      return reply.code(400).send({ error: 'Invalid region', code: 'INVALID_REGION' });
    }

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { broadcastRegion: body.region ?? null },
    });

    return reply.send({ broadcastRegion: body.region ?? null });
  });
}
