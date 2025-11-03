import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Search routes - unified search across fighters, fights, events, and promotions
 */
export default async function searchRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/search
   * Search across fighters, fights, events, and promotions
   * Query params:
   *   - q: search query (required, min 2 chars)
   *   - limit: max results per category (default 10, max 50)
   */
  fastify.get('/search', async (request, reply) => {
    const { q, limit = 10 } = request.query as { q?: string; limit?: number };

    // Validate query
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return reply.status(400).send({
        error: 'Search query must be at least 2 characters',
        code: 'INVALID_QUERY',
      });
    }

    const searchTerm = q.trim();
    const resultLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

    try {
      // Search fighters (first name, last name, or nickname)
      const foundFighters = await prisma.fighter.findMany({
        where: {
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { nickname: { contains: searchTerm, mode: 'insensitive' } },
          ],
          isActive: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nickname: true,
          profileImage: true,
          weightClass: true,
          rank: true,
          wins: true,
          losses: true,
          draws: true,
          isChampion: true,
          championshipTitle: true,
        },
        take: resultLimit,
        orderBy: [
          { isChampion: 'desc' },
          { totalFights: 'desc' },
          { averageRating: 'desc' },
        ],
      });

      // Calculate average rating from last 3 completed fights for each fighter
      const fighters = await Promise.all(
        foundFighters.map(async (fighter) => {
          // Get last 3 completed fights for this fighter
          const recentFights = await prisma.fight.findMany({
            where: {
              OR: [
                { fighter1Id: fighter.id },
                { fighter2Id: fighter.id },
              ],
              isComplete: true,
              averageRating: { gt: 0 },
            },
            orderBy: {
              event: { date: 'desc' },
            },
            take: 3,
            select: {
              averageRating: true,
            },
          });

          // Calculate average rating from these fights
          const avgRating = recentFights.length > 0
            ? recentFights.reduce((sum, f) => sum + f.averageRating, 0) / recentFights.length
            : 0;

          return {
            ...fighter,
            averageRating: avgRating,
            totalFights: recentFights.length,
          };
        })
      );

      // Search events (by name)
      const events = await prisma.event.findMany({
        where: {
          name: { contains: searchTerm, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          promotion: true,
          date: true,
          venue: true,
          location: true,
          bannerImage: true,
          hasStarted: true,
          isComplete: true,
          averageRating: true,
          totalRatings: true,
          greatFights: true,
        },
        take: resultLimit,
        orderBy: [
          { date: 'desc' },
        ],
      });

      // Search fights (by fighter names in the fight)
      const fights = await prisma.fight.findMany({
        where: {
          OR: [
            {
              fighter1: {
                OR: [
                  { firstName: { contains: searchTerm, mode: 'insensitive' } },
                  { lastName: { contains: searchTerm, mode: 'insensitive' } },
                  { nickname: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
            },
            {
              fighter2: {
                OR: [
                  { firstName: { contains: searchTerm, mode: 'insensitive' } },
                  { lastName: { contains: searchTerm, mode: 'insensitive' } },
                  { nickname: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
            },
          ],
        },
        select: {
          id: true,
          isTitle: true,
          titleName: true,
          weightClass: true,
          scheduledRounds: true,
          hasStarted: true,
          isComplete: true,
          winner: true,
          method: true,
          round: true,
          time: true,
          averageRating: true,
          totalRatings: true,
          fighter1: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              profileImage: true,
              weightClass: true,
              rank: true,
            },
          },
          fighter2: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              profileImage: true,
              weightClass: true,
              rank: true,
            },
          },
          event: {
            select: {
              id: true,
              name: true,
              promotion: true,
              date: true,
              location: true,
            },
          },
        },
        take: resultLimit,
        orderBy: [
          { event: { date: 'desc' } },
          { orderOnCard: 'asc' },
        ],
      });

      // Search promotions (UFC, Bellator, ONE, etc.)
      // We'll get unique promotions from events that match the search term
      const promotions = await prisma.event.findMany({
        where: {
          promotion: { contains: searchTerm, mode: 'insensitive' },
        },
        select: {
          promotion: true,
        },
        distinct: ['promotion'],
        take: resultLimit,
      });

      // Get additional stats for each promotion
      const promotionResults = await Promise.all(
        promotions.map(async (p) => {
          const stats = await prisma.event.aggregate({
            where: { promotion: p.promotion },
            _count: { id: true },
            _avg: { averageRating: true },
          });

          const upcomingCount = await prisma.event.count({
            where: {
              promotion: p.promotion,
              hasStarted: false,
              isComplete: false,
            },
          });

          return {
            name: p.promotion,
            totalEvents: stats._count.id,
            averageRating: stats._avg.averageRating || 0,
            upcomingEvents: upcomingCount,
          };
        })
      );

      return reply.send({
        data: {
          fighters: fighters.map((f) => ({
            ...f,
            record: `${f.wins}-${f.losses}${f.draws > 0 ? `-${f.draws}` : ''}`,
          })),
          fights,
          events,
          promotions: promotionResults,
        },
        meta: {
          query: searchTerm,
          totalResults:
            fighters.length + fights.length + events.length + promotionResults.length,
        },
      });
    } catch (error) {
      console.error('[Search] Error:', error);
      return reply.status(500).send({
        error: 'Failed to perform search',
        code: 'SEARCH_ERROR',
      });
    }
  });
}
