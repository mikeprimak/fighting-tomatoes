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

  // Get top upcoming fights (highest hype, next 20 days)
  fastify.get('/top-upcoming-fights', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const now = new Date();
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(now.getDate() + 20);

      // Get fights with their predictions to calculate average hype
      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: now,
              lte: twentyDaysFromNow,
            },
          },
          hasStarted: false,
          isComplete: false,
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          predictions: {
            where: {
              predictedRating: {
                not: null,
              },
            },
            select: {
              predictedRating: true,
            },
          },
        },
      });

      // Calculate average hype for each fight and sort
      const fightsWithHype = fights
        .map((fight: any) => {
          const hypes = fight.predictions
            .filter((p: any) => p.predictedRating != null)
            .map((p: any) => p.predictedRating);
          const averageHype = hypes.length > 0
            ? hypes.reduce((sum: number, h: number) => sum + h, 0) / hypes.length
            : 0;
          return {
            ...fight,
            predictions: undefined, // Remove from response
            averageHype,
          };
        })
        .sort((a: any, b: any) => b.averageHype - a.averageHype)
        .slice(0, 7);

      return reply.send({ data: fightsWithHype });
    } catch (error) {
      console.error('Error fetching top upcoming fights:', error);
      return reply.status(500).send({
        error: 'Failed to fetch top upcoming fights',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get top recent fights (highest ratings, past 20 days)
  fastify.get('/top-recent-fights', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const now = new Date();
      const twentyDaysAgo = new Date();
      twentyDaysAgo.setDate(now.getDate() - 20);

      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: twentyDaysAgo,
              lte: now,
            },
          },
          isComplete: true,
          averageRating: {
            gt: 0,
          },
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
        },
        orderBy: {
          averageRating: 'desc',
        },
        take: 7,
      });

      return reply.send({ data: fights });
    } catch (error) {
      console.error('Error fetching top recent fights:', error);
      return reply.status(500).send({
        error: 'Failed to fetch top recent fights',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get hot predictions (fights with strong prediction consensus, next 20 days)
  fastify.get('/hot-predictions', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const now = new Date();
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(now.getDate() + 20);

      // Get all upcoming fights with predictions
      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: now,
              lte: twentyDaysFromNow,
            },
          },
          hasStarted: false,
          isComplete: false,
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          predictions: {
            select: {
              predictedWinner: true,
            },
          },
        },
      });

      // Calculate prediction stats for each fight
      const fightsWithStats = fights.map((fight: any) => {
        const totalPredictions = fight.predictions.length;
        if (totalPredictions === 0) return null;


        const fighter1Predictions = fight.predictions.filter((p: any) => p.predictedWinner === fight.fighter1Id).length;
        const fighter2Predictions = fight.predictions.filter((p: any) => p.predictedWinner === fight.fighter2Id).length;

        const fighter1Percentage = (fighter1Predictions / totalPredictions) * 100;
        const fighter2Percentage = (fighter2Predictions / totalPredictions) * 100;

        // Check if either fighter has 60%+ consensus
        const hasConsensus = fighter1Percentage >= 60 || fighter2Percentage >= 60;
        const highestPercentage = Math.max(fighter1Percentage, fighter2Percentage);
        const consensusWinner = fighter1Percentage > fighter2Percentage
          ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
          : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
        const consensusLoser = fighter1Percentage > fighter2Percentage
          ? `${fight.fighter2.firstName} ${fight.fighter2.lastName}`
          : `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;

        return hasConsensus ? {
          fight,
          totalPredictions,
          consensusPercentage: highestPercentage,
          consensusWinner,
          consensusLoser,
        } : null;
      }).filter((f: any) => f !== null);

      // Sort by total predictions (most predicted with consensus)
      fightsWithStats.sort((a: any, b: any) => b.totalPredictions - a.totalPredictions);

      // Return top 7
      const topFights = fightsWithStats.slice(0, 7).map((f: any) => ({
        ...f.fight,
        predictions: undefined, // Remove raw predictions from response
        totalPredictions: f.totalPredictions,
        consensusPercentage: f.consensusPercentage,
        consensusWinner: f.consensusWinner,
        consensusLoser: f.consensusLoser,
      }));

      return reply.send({ data: topFights });
    } catch (error) {
      console.error('Error fetching hot predictions:', error);
      return reply.status(500).send({
        error: 'Failed to fetch hot predictions',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get even predictions (fights where predictions are split 42-58% or closer, next 20 days)
  fastify.get('/even-predictions', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const now = new Date();
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(now.getDate() + 20);

      // Get all upcoming fights with predictions
      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: now,
              lte: twentyDaysFromNow,
            },
          },
          hasStarted: false,
          isComplete: false,
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          predictions: {
            select: {
              predictedWinner: true,
            },
          },
        },
      });

      // Calculate prediction stats for each fight
      const fightsWithStats = fights.map((fight: any) => {
        const totalPredictions = fight.predictions.length;
        if (totalPredictions < 2) return null; // Need at least 2 predictions for a split

        const fighter1Predictions = fight.predictions.filter((p: any) => p.predictedWinner === fight.fighter1Id).length;
        const fighter2Predictions = fight.predictions.filter((p: any) => p.predictedWinner === fight.fighter2Id).length;

        const fighter1Percentage = (fighter1Predictions / totalPredictions) * 100;
        const fighter2Percentage = (fighter2Predictions / totalPredictions) * 100;

        // Check if both fighters have at least 42% (meaning it's between 42-58%)
        const isEven = fighter1Percentage >= 42 && fighter2Percentage >= 42;

        const higherPercentage = Math.max(fighter1Percentage, fighter2Percentage);
        const slightFavorite = fighter1Percentage > fighter2Percentage
          ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
          : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
        const slightUnderdog = fighter1Percentage > fighter2Percentage
          ? `${fight.fighter2.firstName} ${fight.fighter2.lastName}`
          : `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;

        return isEven ? {
          fight,
          totalPredictions,
          favoritePercentage: higherPercentage,
          slightFavorite,
          slightUnderdog,
        } : null;
      }).filter((f: any) => f !== null);

      // Sort by total predictions (most predicted with split)
      fightsWithStats.sort((a: any, b: any) => b.totalPredictions - a.totalPredictions);

      // Return top 7
      const topFights = fightsWithStats.slice(0, 7).map((f: any) => ({
        ...f.fight,
        predictions: undefined, // Remove raw predictions from response
        totalPredictions: f.totalPredictions,
        favoritePercentage: f.favoritePercentage,
        slightFavorite: f.slightFavorite,
        slightUnderdog: f.slightUnderdog,
      }));

      return reply.send({ data: topFights });
    } catch (error) {
      console.error('Error fetching even predictions:', error);
      return reply.status(500).send({
        error: 'Failed to fetch even predictions',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get hot fighters (fighters with highest average ratings from recent/upcoming fights)
  fastify.get('/hot-fighters', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const now = new Date();
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(now.getDate() - 14);
      const fourteenDaysFromNow = new Date();
      fourteenDaysFromNow.setDate(now.getDate() + 14);

      // Get all fighters from recent completed fights (past 14 days)
      const recentFights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: fourteenDaysAgo,
              lte: now,
            },
          },
          isComplete: true,
        },
        include: {
          fighter1: true,
          fighter2: true,
        },
        orderBy: {
          event: {
            date: 'desc',
          },
        },
      });

      // Get all fighters from upcoming fights (next 14 days)
      const upcomingFights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: now,
              lte: fourteenDaysFromNow,
            },
          },
          hasStarted: false,
          isComplete: false,
        },
        include: {
          fighter1: true,
          fighter2: true,
        },
      });

      // Calculate average rating for recent fighters (based on their last 3 fights)
      const recentFighterStats = new Map();
      for (const fight of recentFights) {
        for (const fighter of [fight.fighter1, fight.fighter2]) {
          if (!recentFighterStats.has(fighter.id)) {
            // Get fighter's last 3 completed fights with ratings
            const fighterFights = await fastify.prisma.fight.findMany({
              where: {
                OR: [
                  { fighter1Id: fighter.id },
                  { fighter2Id: fighter.id },
                ],
                isComplete: true,
                averageRating: {
                  gt: 0,
                },
              },
              orderBy: {
                event: {
                  date: 'desc',
                },
              },
              take: 3,
            });

            if (fighterFights.length > 0) {
              const avgRating = fighterFights.reduce((sum: number, f: any) => sum + (f.averageRating || 0), 0) / fighterFights.length;
              recentFighterStats.set(fighter.id, {
                fighter,
                avgRating,
                fightCount: fighterFights.length,
              });
            }
          }
        }
      }

      // Calculate average rating for upcoming fighters
      const upcomingFighterStats = new Map();
      for (const fight of upcomingFights) {
        for (const fighter of [fight.fighter1, fight.fighter2]) {
          if (!upcomingFighterStats.has(fighter.id)) {
            // Get fighter's last 3 completed fights with ratings
            const fighterFights = await fastify.prisma.fight.findMany({
              where: {
                OR: [
                  { fighter1Id: fighter.id },
                  { fighter2Id: fighter.id },
                ],
                isComplete: true,
                averageRating: {
                  gt: 0,
                },
              },
              orderBy: {
                event: {
                  date: 'desc',
                },
              },
              take: 3,
            });

            if (fighterFights.length > 0) {
              const avgRating = fighterFights.reduce((sum: number, f: any) => sum + (f.averageRating || 0), 0) / fighterFights.length;
              upcomingFighterStats.set(fighter.id, {
                fighter,
                avgRating,
                fightCount: fighterFights.length,
              });
            }
          }
        }
      }

      // Sort and get top fighters
      const topRecent = Array.from(recentFighterStats.values())
        .sort((a: any, b: any) => b.avgRating - a.avgRating)
        .slice(0, 3);

      const topUpcoming = Array.from(upcomingFighterStats.values())
        .filter((f: any) => !recentFighterStats.has(f.fighter.id)) // Exclude fighters already in recent
        .sort((a: any, b: any) => b.avgRating - a.avgRating)
        .slice(0, 4);

      return reply.send({
        data: {
          recent: topRecent,
          upcoming: topUpcoming,
        },
      });
    } catch (error) {
      console.error('Error fetching hot fighters:', error);
      return reply.status(500).send({
        error: 'Failed to fetch hot fighters',
        code: 'FETCH_ERROR',
      });
    }
  });
}

