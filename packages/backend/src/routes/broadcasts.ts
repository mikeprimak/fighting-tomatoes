import { FastifyInstance } from 'fastify';
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

function pickDeepLink(eventDeepLink: string | null, channel: { affiliateUrl: string | null; homepageUrl: string | null }): string | null {
  return eventDeepLink ?? channel.affiliateUrl ?? channel.homepageUrl ?? null;
}

export default async function broadcastsRoutes(fastify: FastifyInstance) {
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
      deepLink: pickDeepLink(b.eventDeepLink, b.channel),
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
        deepLink: pickDeepLink(null, d.channel),
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
