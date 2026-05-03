/**
 * Admin CRUD for the How-to-Watch system:
 *  - Broadcast channels (the streamers/cable nets)
 *  - Per-event broadcasts (event × channel × region rows)
 *  - Promotion-level defaults (promotion × region → channel)
 *  - User reports inbox
 *
 * All endpoints require an admin JWT (same pattern as admin.ts).
 */

import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middleware/auth';
import { isValidRegion } from '../services/region';

const TIERS = ['FREE', 'SUBSCRIPTION', 'PPV'] as const;
const SOURCES = ['MANUAL', 'SCRAPED', 'DEFAULT'] as const;
const REPORT_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const;
const CARD_SECTIONS = ['EARLY_PRELIMS', 'PRELIMS', 'MAIN_CARD'] as const;

type Tier = (typeof TIERS)[number];

function isTier(v: any): v is Tier { return TIERS.includes(v); }
function isCardSection(v: any): boolean { return v == null || (CARD_SECTIONS as readonly string[]).includes(v); }

export default async function adminBroadcastsRoutes(fastify: FastifyInstance) {
  // ============== CHANNELS ==============
  fastify.get('/admin/broadcast-channels', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (_request, reply) => {
    const channels = await fastify.prisma.broadcastChannel.findMany({
      orderBy: { name: 'asc' },
    });
    return reply.send({ channels });
  });

  fastify.post('/admin/broadcast-channels', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as any;
    if (!body?.slug || !body?.name) {
      return reply.code(400).send({ error: 'slug and name required' });
    }
    try {
      const created = await fastify.prisma.broadcastChannel.create({
        data: {
          slug: body.slug,
          name: body.name,
          logoUrl: body.logoUrl ?? null,
          homepageUrl: body.homepageUrl ?? null,
          iosDeepLink: body.iosDeepLink ?? null,
          androidDeepLink: body.androidDeepLink ?? null,
          webDeepLink: body.webDeepLink ?? null,
          affiliateUrl: body.affiliateUrl ?? null,
          isActive: body.isActive ?? true,
        },
      });
      return reply.code(201).send({ channel: created });
    } catch (e: any) {
      if (e?.code === 'P2002') return reply.code(409).send({ error: 'slug already exists' });
      throw e;
    }
  });

  fastify.patch('/admin/broadcast-channels/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const data: any = {};
    for (const k of ['name','logoUrl','homepageUrl','iosDeepLink','androidDeepLink','webDeepLink','affiliateUrl','isActive']) {
      if (k in body) data[k] = body[k];
    }
    const updated = await fastify.prisma.broadcastChannel.update({ where: { id }, data });
    return reply.send({ channel: updated });
  });

  // ============== EVENT BROADCASTS ==============
  fastify.get('/admin/broadcasts', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { eventId } = request.query as { eventId?: string };
    if (!eventId) return reply.code(400).send({ error: 'eventId required' });
    const rows = await fastify.prisma.eventBroadcast.findMany({
      where: { eventId },
      include: { channel: true },
      orderBy: [{ region: 'asc' }, { tier: 'asc' }],
    });
    return reply.send({ broadcasts: rows });
  });

  fastify.post('/admin/broadcasts', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const b = request.body as any;
    if (!b?.eventId || !b?.channelId || !b?.region || !b?.tier) {
      return reply.code(400).send({ error: 'eventId, channelId, region, tier required' });
    }
    if (!isValidRegion(b.region)) return reply.code(400).send({ error: 'invalid region' });
    if (!isTier(b.tier)) return reply.code(400).send({ error: 'invalid tier' });
    if (!isCardSection(b.cardSection)) return reply.code(400).send({ error: 'invalid cardSection' });
    try {
      const row = await fastify.prisma.eventBroadcast.create({
        data: {
          eventId: b.eventId,
          channelId: b.channelId,
          region: b.region,
          tier: b.tier,
          cardSection: b.cardSection ?? null,
          eventDeepLink: b.eventDeepLink ?? null,
          language: b.language ?? null,
          note: b.note ?? null,
          source: SOURCES.includes(b.source) ? b.source : 'MANUAL',
          lastVerifiedAt: b.source === 'SCRAPED' ? new Date() : null,
          isActive: b.isActive ?? true,
        },
        include: { channel: true },
      });
      return reply.code(201).send({ broadcast: row });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'broadcast for this event/channel/region already exists' });
      }
      throw e;
    }
  });

  fastify.patch('/admin/broadcasts/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const data: any = {};
    if ('region' in body) {
      if (!isValidRegion(body.region)) return reply.code(400).send({ error: 'invalid region' });
      data.region = body.region;
    }
    if ('tier' in body) {
      if (!isTier(body.tier)) return reply.code(400).send({ error: 'invalid tier' });
      data.tier = body.tier;
    }
    if ('cardSection' in body) {
      if (!isCardSection(body.cardSection)) return reply.code(400).send({ error: 'invalid cardSection' });
      data.cardSection = body.cardSection ?? null;
    }
    for (const k of ['channelId','eventDeepLink','language','note','isActive']) {
      if (k in body) data[k] = body[k];
    }
    const updated = await fastify.prisma.eventBroadcast.update({
      where: { id }, data, include: { channel: true },
    });
    return reply.send({ broadcast: updated });
  });

  fastify.delete('/admin/broadcasts/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Soft delete via isActive=false to preserve history; hard delete on purpose if user passes ?hard=1
    const { hard } = request.query as { hard?: string };
    if (hard === '1') {
      await fastify.prisma.eventBroadcast.delete({ where: { id } });
    } else {
      await fastify.prisma.eventBroadcast.update({ where: { id }, data: { isActive: false } });
    }
    return reply.code(204).send();
  });

  // ============== PROMOTION DEFAULTS ==============
  fastify.get('/admin/broadcast-defaults', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { promotion } = request.query as { promotion?: string };
    const where: any = {};
    if (promotion) where.promotion = promotion;
    const rows = await fastify.prisma.promotionBroadcastDefault.findMany({
      where,
      include: { channel: true },
      orderBy: [{ promotion: 'asc' }, { region: 'asc' }],
    });
    return reply.send({ defaults: rows });
  });

  fastify.post('/admin/broadcast-defaults', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const b = request.body as any;
    if (!b?.promotion || !b?.channelId || !b?.region || !b?.tier) {
      return reply.code(400).send({ error: 'promotion, channelId, region, tier required' });
    }
    if (!isValidRegion(b.region)) return reply.code(400).send({ error: 'invalid region' });
    if (!isTier(b.tier)) return reply.code(400).send({ error: 'invalid tier' });
    try {
      const row = await fastify.prisma.promotionBroadcastDefault.create({
        data: {
          promotion: b.promotion,
          channelId: b.channelId,
          region: b.region,
          tier: b.tier,
          note: b.note ?? null,
          isActive: b.isActive ?? true,
        },
        include: { channel: true },
      });
      return reply.code(201).send({ default: row });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'default for this promotion/region/channel already exists' });
      }
      throw e;
    }
  });

  fastify.patch('/admin/broadcast-defaults/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const data: any = {};
    if ('region' in body) {
      if (!isValidRegion(body.region)) return reply.code(400).send({ error: 'invalid region' });
      data.region = body.region;
    }
    if ('tier' in body) {
      if (!isTier(body.tier)) return reply.code(400).send({ error: 'invalid tier' });
      data.tier = body.tier;
    }
    for (const k of ['promotion','channelId','note','isActive']) {
      if (k in body) data[k] = body[k];
    }
    const updated = await fastify.prisma.promotionBroadcastDefault.update({
      where: { id }, data, include: { channel: true },
    });
    return reply.send({ default: updated });
  });

  fastify.delete('/admin/broadcast-defaults/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.promotionBroadcastDefault.delete({ where: { id } });
    return reply.code(204).send();
  });

  // ============== REPORTS ==============
  fastify.get('/admin/broadcast-reports', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { status } = request.query as { status?: string };
    const where: any = {};
    if (status && (REPORT_STATUS as readonly string[]).includes(status)) where.status = status;
    const reports = await fastify.prisma.broadcastReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return reply.send({ reports });
  });

  fastify.patch('/admin/broadcast-reports/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; resolution?: string };
    const data: any = {};
    if (body.status) {
      if (!(REPORT_STATUS as readonly string[]).includes(body.status)) {
        return reply.code(400).send({ error: 'invalid status' });
      }
      data.status = body.status;
      if (body.status === 'RESOLVED' || body.status === 'REJECTED') {
        data.resolvedAt = new Date();
      }
    }
    if (typeof body.resolution === 'string') data.resolution = body.resolution;
    const updated = await fastify.prisma.broadcastReport.update({ where: { id }, data });
    return reply.send({ report: updated });
  });

  // ============== DISCOVERIES ==============
  // List pending findings from the discovery job (newest first).
  fastify.get('/admin/broadcast-discoveries', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { status = 'PENDING', promotion, region, limit = '100' } = request.query as {
      status?: string; promotion?: string; region?: string; limit?: string;
    };
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (promotion) where.promotion = promotion;
    if (region) where.region = region;

    const rows = await fastify.prisma.broadcastDiscovery.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(500, parseInt(limit, 10) || 100),
    });
    const counts = await fastify.prisma.broadcastDiscovery.groupBy({
      by: ['status'], _count: { _all: true },
    });
    return reply.send({
      discoveries: rows,
      counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])),
    });
  });

  // Apply a finding → upserts a PromotionBroadcastDefault row (with tier override).
  // Reject → marks REJECTED so it's suppressed for 90 days.
  // Mark duplicate → quick way to clear ones we already know about.
  fastify.patch('/admin/broadcast-discoveries/:id', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { action: 'APPLY' | 'REJECT' | 'DUPLICATE'; tier?: string; channelSlug?: string; reviewNote?: string };
    const user = (request as any).user;

    const discovery = await fastify.prisma.broadcastDiscovery.findUnique({ where: { id } });
    if (!discovery) return reply.code(404).send({ error: 'Discovery not found' });

    if (body.action === 'REJECT') {
      const updated = await fastify.prisma.broadcastDiscovery.update({
        where: { id },
        data: { status: 'REJECTED', reviewedBy: user?.id ?? null, reviewedAt: new Date(), reviewNote: body.reviewNote ?? null },
      });
      return reply.send({ discovery: updated });
    }

    if (body.action === 'DUPLICATE') {
      const updated = await fastify.prisma.broadcastDiscovery.update({
        where: { id },
        data: { status: 'DUPLICATE', reviewedBy: user?.id ?? null, reviewedAt: new Date(), reviewNote: body.reviewNote ?? null },
      });
      return reply.send({ discovery: updated });
    }

    if (body.action === 'APPLY') {
      const slug = body.channelSlug ?? discovery.channelSlug;
      if (!slug) return reply.code(400).send({ error: 'channelSlug required (the discovery has no resolved channel)' });
      const tier = (body.tier ?? discovery.tier ?? '').toUpperCase();
      if (!isTier(tier)) return reply.code(400).send({ error: 'tier required (FREE | SUBSCRIPTION | PPV)' });
      const channel = await fastify.prisma.broadcastChannel.findUnique({ where: { slug }, select: { id: true } });
      if (!channel) return reply.code(404).send({ error: `channel "${slug}" not found` });

      // Upsert default
      const existing = await fastify.prisma.promotionBroadcastDefault.findUnique({
        where: { promotion_region_channelId: { promotion: discovery.promotion, region: discovery.region, channelId: channel.id } },
      });
      if (existing) {
        await fastify.prisma.promotionBroadcastDefault.update({
          where: { id: existing.id },
          data: { tier: tier as any, isActive: true, lastDiscoveryAt: new Date() },
        });
      } else {
        await fastify.prisma.promotionBroadcastDefault.create({
          data: {
            promotion: discovery.promotion,
            region: discovery.region,
            channelId: channel.id,
            tier: tier as any,
            isActive: true,
            lastDiscoveryAt: new Date(),
            note: discovery.snippet.slice(0, 200),
          },
        });
      }

      // For CHANGED: deactivate the previous default(s) for this region/promotion (other channels)
      if (discovery.changeType === 'CHANGED') {
        await fastify.prisma.promotionBroadcastDefault.updateMany({
          where: {
            promotion: discovery.promotion,
            region: discovery.region,
            channelId: { not: channel.id },
            isActive: true,
          },
          data: { isActive: false },
        });
      }

      const updated = await fastify.prisma.broadcastDiscovery.update({
        where: { id },
        data: { status: 'APPLIED', reviewedBy: user?.id ?? null, reviewedAt: new Date(), reviewNote: body.reviewNote ?? null },
      });
      return reply.send({ discovery: updated, applied: true });
    }

    return reply.code(400).send({ error: 'invalid action — expected APPLY | REJECT | DUPLICATE' });
  });

  // Manual trigger to run the discovery job. Useful for ad-hoc checks.
  fastify.post('/admin/broadcast-discoveries/run', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const body = (request.body ?? {}) as { promotions?: string[]; regions?: string[]; skipFreshDays?: number; maxQueries?: number };
    const { runDiscovery } = await import('../services/broadcastDiscovery/run');
    // Run in background and return immediately so we don't hold the HTTP request.
    runDiscovery(fastify.prisma, body as any)
      .then((summary) => {
        console.log('[admin] discovery run summary:', summary);
      })
      .catch((err) => {
        console.error('[admin] discovery run failed:', err);
      });
    return reply.code(202).send({ status: 'started', message: 'Discovery run started — check the inbox in a few minutes.' });
  });
}
