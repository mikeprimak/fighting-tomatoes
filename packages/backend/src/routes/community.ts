import { FastifyInstance } from 'fastify';
import { optionalAuthenticateMiddleware } from '../middleware/auth.fastify';

export default async function communityRoutes(fastify: FastifyInstance) {
  // Get all comments with sorting options
  fastify.get('/comments', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const userId = request.user?.id;
      const { sortBy = 'top-recent' } = request.query as { sortBy?: string };

      let whereClause: any = {};
      let orderByClause: any[] = [];

      if (sortBy === 'top-recent') {
        // Top upvoted from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        whereClause = {
          fight: {
            event: {
              date: { gte: sevenDaysAgo },
            },
          },
        };
        orderByClause = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
      } else if (sortBy === 'top-all-time') {
        // Top upvoted of all time
        orderByClause = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
      } else if (sortBy === 'new') {
        // Newest first
        orderByClause = [{ createdAt: 'desc' }];
      }

      const reviews = await fastify.prisma.fightReview.findMany({
        where: whereClause,
        orderBy: orderByClause,
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          fight: {
            include: {
              fighter1: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nickname: true,
                },
              },
              fighter2: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nickname: true,
                },
              },
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true,
                },
              },
            },
          },
        },
      });

      const reviewIds = reviews.map((r: any) => r.id);
      const userUpvotes = userId ? await fastify.prisma.reviewVote.findMany({
        where: {
          userId,
          reviewId: { in: reviewIds },
        },
        select: { reviewId: true },
      }) : [];

      const upvotedReviewIds = new Set(userUpvotes.map((u: any) => u.reviewId));

      return reply.send({
        data: reviews.map((review: any) => ({
          id: review.id,
          content: review.content,
          rating: review.rating,
          upvotes: review.upvotes,
          createdAt: review.createdAt,
          userHasUpvoted: upvotedReviewIds.has(review.id),
          user: {
            id: review.user.id,
            displayName: review.user.displayName || `${review.user.firstName} ${review.user.lastName}`,
          },
          fight: {
            id: review.fight.id,
            fighter1Name: `${review.fight.fighter1.firstName} ${review.fight.fighter1.lastName}`,
            fighter2Name: `${review.fight.fighter2.firstName} ${review.fight.fighter2.lastName}`,
            eventName: review.fight.event.name,
            eventDate: review.fight.event.date,
          },
        })),
      });
    } catch (error) {
      console.error('Error fetching comments:', error);
      return reply.status(500).send({
        error: 'Failed to fetch comments',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get top comments from recent events (past 10 days)
  fastify.get('/top-comments', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      // Get userId from token if authenticated
      const userId = request.user?.id;

      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      // Get top 3 upvoted reviews from fights in events within the past 10 days
      // If no reviews in past 10 days, get the most recent 3 reviews with most upvotes
      let topReviews = await fastify.prisma.fightReview.findMany({
        where: {
          fight: {
            event: {
              date: {
                gte: tenDaysAgo,
              },
            },
          },
        },
        orderBy: [
          { upvotes: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 3,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              displayName: true,
            },
          },
          fight: {
            include: {
              fighter1: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nickname: true,
                },
              },
              fighter2: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nickname: true,
                },
              },
              event: {
                select: {
                  id: true,
                  name: true,
                  date: true,
                },
              },
            },
          },
        },
      });

      // If no reviews found in past 10 days, get any 3 most upvoted reviews
      if (topReviews.length === 0) {
        topReviews = await fastify.prisma.fightReview.findMany({
          orderBy: [
            { upvotes: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 3,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                displayName: true,
              },
            },
            fight: {
              include: {
                fighter1: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    nickname: true,
                  },
                },
                fighter2: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    nickname: true,
                  },
                },
                event: {
                  select: {
                    id: true,
                    name: true,
                    date: true,
                  },
                },
              },
            },
          },
        });
      }

      // Check which reviews the user has upvoted (if authenticated)
      const reviewIds = topReviews.map((r: any) => r.id);

      const userUpvotes = userId ? await fastify.prisma.reviewVote.findMany({
        where: {
          userId,
          reviewId: { in: reviewIds },
        },
        select: { reviewId: true },
      }) : [];

      const upvotedReviewIds = new Set(userUpvotes.map((u: any) => u.reviewId));

      return reply.send({
        data: topReviews.map((review: any) => ({
          id: review.id,
          content: review.content,
          rating: review.rating,
          upvotes: review.upvotes,
          createdAt: review.createdAt,
          userHasUpvoted: upvotedReviewIds.has(review.id),
          user: {
            id: review.user.id,
            displayName: review.user.displayName || `${review.user.firstName} ${review.user.lastName}`,
          },
          fight: {
            id: review.fight.id,
            fighter1Name: `${review.fight.fighter1.firstName} ${review.fight.fighter1.lastName}`,
            fighter2Name: `${review.fight.fighter2.firstName} ${review.fight.fighter2.lastName}`,
            eventName: review.fight.event.name,
            eventDate: review.fight.event.date,
          },
        })),
      });
    } catch (error) {
      console.error('Error fetching top comments:', error);
      return reply.status(500).send({
        error: 'Failed to fetch top comments',
        code: 'FETCH_ERROR',
      });
    }
  });
}
