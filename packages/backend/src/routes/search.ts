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

    // Split search term into individual words for multi-term matching
    const searchTerms = searchTerm.split(/\s+/).filter(t => t.length > 0);

    try {
      // Search fighters (first name, last name, or nickname)
      // For multi-word queries like "Jon Jones", match first + last name combinations
      const buildFighterSearchConditions = (): any => {
        const baseConditions: any[] = [
          { firstName: { contains: searchTerm, mode: 'insensitive' as const } },
          { lastName: { contains: searchTerm, mode: 'insensitive' as const } },
          { nickname: { contains: searchTerm, mode: 'insensitive' as const } },
        ];

        // Add individual word searches for multi-word queries
        if (searchTerms.length > 1) {
          for (const term of searchTerms) {
            baseConditions.push(
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } },
              { nickname: { contains: term, mode: 'insensitive' as const } }
            );
          }

          // For 2-word queries, also try "first last" combinations
          if (searchTerms.length === 2) {
            const [term1, term2] = searchTerms;
            baseConditions.push(
              {
                AND: [
                  { firstName: { contains: term1, mode: 'insensitive' as const } },
                  { lastName: { contains: term2, mode: 'insensitive' as const } },
                ],
              },
              {
                AND: [
                  { firstName: { contains: term2, mode: 'insensitive' as const } },
                  { lastName: { contains: term1, mode: 'insensitive' as const } },
                ],
              }
            );
          }
        }

        return { OR: baseConditions };
      };

      const foundFighters = await prisma.fighter.findMany({
        where: {
          AND: [
            buildFighterSearchConditions(),
            { isActive: true },
          ],
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

      // Search events (by name and promotion)
      // Build OR conditions for full term and individual words
      const buildEventSearchConditions = () => {
        const conditions: any[] = [
          { name: { contains: searchTerm, mode: 'insensitive' as const } },
          { promotion: { contains: searchTerm, mode: 'insensitive' as const } },
        ];

        // Add individual word searches for multi-word queries
        if (searchTerms.length > 1) {
          for (const term of searchTerms) {
            conditions.push(
              { name: { contains: term, mode: 'insensitive' as const } },
              { promotion: { contains: term, mode: 'insensitive' as const } }
            );
          }
        }

        return { OR: conditions };
      };

      const allEvents = await prisma.event.findMany({
        where: buildEventSearchConditions(),
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
      });

      // Sort: upcoming events first (soonest first), then past events (most recent first)
      const now = new Date();
      const upcomingEvents = allEvents
        .filter(e => new Date(e.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const pastEvents = allEvents
        .filter(e => new Date(e.date) < now)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const events = [...upcomingEvents, ...pastEvents].slice(0, resultLimit);

      // Search fights (by fighter names and event/promotion)
      // For multi-word queries like "UFC Jon", require ALL words to match across different fields
      const buildFightSearchConditions = () => {
        // Single word query - match any field
        if (searchTerms.length === 1) {
          return {
            OR: [
              {
                fighter1: {
                  OR: [
                    { firstName: { contains: searchTerm, mode: 'insensitive' as const } },
                    { lastName: { contains: searchTerm, mode: 'insensitive' as const } },
                    { nickname: { contains: searchTerm, mode: 'insensitive' as const } },
                  ],
                },
              },
              {
                fighter2: {
                  OR: [
                    { firstName: { contains: searchTerm, mode: 'insensitive' as const } },
                    { lastName: { contains: searchTerm, mode: 'insensitive' as const } },
                    { nickname: { contains: searchTerm, mode: 'insensitive' as const } },
                  ],
                },
              },
              {
                event: {
                  OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' as const } },
                    { promotion: { contains: searchTerm, mode: 'insensitive' as const } },
                  ],
                },
              },
            ],
          };
        }

        // Multi-word query - require ALL words to match
        // For "UFC Jon", we need to ensure each word appears somewhere in the fight
        const allConditions: any[] = [];

        // Build AND conditions - each word must match somewhere
        const wordMatchConditions = searchTerms.map((term) => ({
          OR: [
            {
              fighter1: {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' as const } },
                  { lastName: { contains: term, mode: 'insensitive' as const } },
                  { nickname: { contains: term, mode: 'insensitive' as const } },
                ],
              },
            },
            {
              fighter2: {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' as const } },
                  { lastName: { contains: term, mode: 'insensitive' as const } },
                  { nickname: { contains: term, mode: 'insensitive' as const } },
                ],
              },
            },
            {
              event: {
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { promotion: { contains: term, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }));

        // All words must match (AND)
        return { AND: wordMatchConditions };
      };

      const fights = await prisma.fight.findMany({
        where: buildFightSearchConditions(),
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
      // Build OR conditions for full term and individual words
      const buildPromotionSearchConditions = () => {
        const conditions: any[] = [
          { promotion: { contains: searchTerm, mode: 'insensitive' as const } },
        ];

        // Add individual word searches for multi-word queries
        if (searchTerms.length > 1) {
          for (const term of searchTerms) {
            conditions.push({ promotion: { contains: term, mode: 'insensitive' as const } });
          }
        }

        return { OR: conditions };
      };

      const promotions = await prisma.event.findMany({
        where: buildPromotionSearchConditions(),
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

          // Get a sample banner image from an event of this promotion
          const sampleEvent = await prisma.event.findFirst({
            where: {
              promotion: p.promotion,
              bannerImage: { not: null },
            },
            select: {
              bannerImage: true,
            },
            orderBy: {
              date: 'desc',
            },
          });

          return {
            name: p.promotion,
            totalEvents: stats._count.id,
            upcomingEvents: upcomingCount,
            image: sampleEvent?.bannerImage || null,
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
