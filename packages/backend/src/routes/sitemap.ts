/**
 * Bulk sitemap data for the web app (goodfights.app). Returns the whitelist of
 * indexable slugs + best-available lastModified for one entity type, filtered by
 * the shared SEO index gate (src/lib/seoIndex.ts). The Next.js sitemap routes
 * (`packages/web/src/app/{fighters,events,fights}/sitemap.ts`) consume this.
 *
 * See docs/plans/programmatic-seo-2026-07-01.md (step 3). Public + cheap (slug +
 * a timestamp only); safe to cache aggressively on the web side.
 *
 * Google's hard limit is 50,000 URLs per sitemap file. Each entity type is
 * currently well under that (~950 fighters / ~640 events / ~3.9k fights as of
 * 2026-07-01), so the web side fetches a single page. Pagination is supported so
 * that if `fight` ever crosses 50k we shard it (convert that segment to
 * generateSitemaps) without touching this endpoint.
 */
import { FastifyInstance } from 'fastify';
import { fighterIndexWhere, eventIndexWhere, fightIndexWhere } from '../lib/seoIndex';

const MAX_LIMIT = 50000;

export default async function sitemapRoutes(fastify: FastifyInstance) {
  fastify.get('/api/sitemap/:type', {
    schema: {
      description: 'Indexable slugs + lastModified for a sitemap (fighters|events|fights)',
      tags: ['system'],
      params: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['fighters', 'events', 'fights'] } },
        required: ['type'],
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: MAX_LIMIT },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  slug: { type: 'string' },
                  lastModified: { type: ['string', 'null'] },
                },
              },
            },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { type } = request.params as { type: 'fighters' | 'events' | 'fights' };
    const { page = 1, limit = MAX_LIMIT } = request.query as { page?: number; limit?: number };
    const skip = (page - 1) * limit;

    try {
      let entries: Array<{ slug: string; lastModified: string | null }> = [];
      let total = 0;

      if (type === 'fighters') {
        const where = fighterIndexWhere();
        const [rows, count] = await Promise.all([
          fastify.prisma.fighter.findMany({
            where, skip, take: limit,
            orderBy: { id: 'asc' },
            select: { slug: true, aiProfileEnrichedAt: true, updatedAt: true },
          }),
          fastify.prisma.fighter.count({ where }),
        ]);
        total = count;
        entries = rows.map((r) => ({
          slug: r.slug as string,
          lastModified: (r.aiProfileEnrichedAt ?? r.updatedAt)?.toISOString() ?? null,
        }));
      } else if (type === 'events') {
        const where = eventIndexWhere();
        const [rows, count] = await Promise.all([
          fastify.prisma.event.findMany({
            where, skip, take: limit,
            orderBy: { id: 'asc' },
            select: { slug: true, aiEventEnrichedAt: true, updatedAt: true },
          }),
          fastify.prisma.event.count({ where }),
        ]);
        total = count;
        entries = rows.map((r) => ({
          slug: r.slug as string,
          lastModified: (r.aiEventEnrichedAt ?? r.updatedAt)?.toISOString() ?? null,
        }));
      } else {
        const where = fightIndexWhere();
        const [rows, count] = await Promise.all([
          fastify.prisma.fight.findMany({
            where, skip, take: limit,
            orderBy: { id: 'asc' },
            select: { slug: true, aiPostFightEnrichedAt: true, aiEnrichedAt: true, updatedAt: true },
          }),
          fastify.prisma.fight.count({ where }),
        ]);
        total = count;
        entries = rows.map((r) => ({
          slug: r.slug as string,
          lastModified: (r.aiPostFightEnrichedAt ?? r.aiEnrichedAt ?? r.updatedAt)?.toISOString() ?? null,
        }));
      }

      if (total > MAX_LIMIT) {
        // Backstop signal: a type crossed Google's 50k/file ceiling. Shard that
        // segment on the web side (generateSitemaps) before this silently truncates.
        request.log.warn(`[sitemap] ${type} has ${total} indexable rows (> ${MAX_LIMIT}/file) — shard this sitemap.`);
      }

      return reply.code(200).send({
        entries,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error: any) {
      request.log.error(error, `Sitemap fetch error (${type}):`);
      return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });
}
