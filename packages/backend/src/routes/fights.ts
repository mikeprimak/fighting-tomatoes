import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { WeightClass, Sport, Gender, ActivityType, PredictionMethod } from '@prisma/client';
import { authenticateUser, requireEmailVerification, optionalAuth } from '../middleware/auth';

// Request/Response schemas using Zod for validation
const CreateFightSchema = z.object({
  fighter1Id: z.string().uuid(),
  fighter2Id: z.string().uuid(),
  eventId: z.string().uuid(),
  weightClass: z.nativeEnum(WeightClass).optional(),
  isTitle: z.boolean().default(false),
  titleName: z.string().optional(),
  orderOnCard: z.number().int().min(1),
  watchPlatform: z.string().optional(),
  watchUrl: z.string().url().optional(),
});

const UpdateFightSchema = z.object({
  fighter1Id: z.string().uuid().optional(),
  fighter2Id: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  weightClass: z.nativeEnum(WeightClass).optional(),
  isTitle: z.boolean().optional(),
  titleName: z.string().optional(),
  orderOnCard: z.number().int().min(1).optional(),
  winner: z.string().optional(),
  method: z.string().optional(),
  round: z.number().int().optional(),
  time: z.string().optional(),
  hasStarted: z.boolean().optional(),
  isComplete: z.boolean().optional(),
  highlightUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  watchPlatform: z.string().optional(),
  watchUrl: z.string().url().optional(),
});

const FightQuerySchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).pipe(z.number().int().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val) || 20).pipe(z.number().int().min(1).max(200)).default('20'),
  eventId: z.string().uuid().optional(),
  fighterId: z.string().uuid().optional(),
  weightClass: z.nativeEnum(WeightClass).optional(),
  isTitle: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  hasStarted: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  isComplete: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  minRating: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  sortBy: z.enum(['event.date', 'averageRating', 'totalRatings', 'createdAt']).default('event.date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  includeUserData: z.string().optional().transform(val => val === 'true'),
});

const CreateRatingSchema = z.object({
  rating: z.number().int().min(1).max(10),
});

const CreateReviewSchema = z.object({
  content: z.string().min(1).max(5000),
  rating: z.number().int().min(1).max(10),
  articleUrl: z.string().url().optional(),
  articleTitle: z.string().max(200).optional(),
});

const UpdateReviewSchema = z.object({
  content: z.string().min(1).max(5000),
  rating: z.number().int().min(1).max(10),
  articleUrl: z.string().url().optional(),
  articleTitle: z.string().max(200).optional(),
});

const FightTagsSchema = z.object({
  tagNames: z.array(z.string()).min(1).max(10),
});

const UpdateUserDataSchema = z.object({
  rating: z.number().int().min(1).max(10).nullable().optional(),
  review: z.string().min(1).max(5000).nullable().optional(),
  tags: z.array(z.string()).max(10).optional(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  page: z.string().transform(val => parseInt(val) || 1).pipe(z.number().int().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val) || 20).pipe(z.number().int().min(1).max(50)).default('20'),
});

const CreatePredictionSchema = z.object({
  predictedRating: z.number().int().min(1).max(10).optional(), // hype level (optional)
  predictedWinner: z.string().uuid().optional(), // fighter1Id or fighter2Id
  predictedMethod: z.nativeEnum(PredictionMethod).optional(),
  predictedRound: z.number().int().min(1).max(12).optional(), // up to 12 rounds for boxing
});

export async function fightRoutes(fastify: FastifyInstance) {
  // GET /api/fights - List fights with filtering and pagination
  fastify.get('/fights', {
    preHandler: [optionalAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = FightQuerySchema.parse(request.query);

      const where: any = {};

      // Apply filters
      if (query.eventId) where.eventId = query.eventId;
      if (query.weightClass) where.weightClass = query.weightClass;
      if (query.isTitle !== undefined) where.isTitle = query.isTitle;
      if (query.hasStarted !== undefined) where.hasStarted = query.hasStarted;
      if (query.isComplete !== undefined) where.isComplete = query.isComplete;
      if (query.minRating) where.averageRating = { gte: query.minRating };

      // Fighter filter (either fighter1 or fighter2)
      if (query.fighterId) {
        where.OR = [
          { fighter1Id: query.fighterId },
          { fighter2Id: query.fighterId },
        ];
      }

      const skip = (query.page - 1) * query.limit;

      // Build orderBy
      // When filtering by eventId, default to orderOnCard ascending (main event first)
      const orderBy: any = {};
      if (query.eventId) {
        // For event-specific queries, sort by card order (1 = main event at top)
        orderBy.orderOnCard = 'asc';
      } else if (query.sortBy === 'event.date') {
        orderBy.event = { date: query.sortOrder };
      } else {
        orderBy[query.sortBy] = query.sortOrder;
      }

      // Get total count for pagination
      const total = await fastify.prisma.fight.count({ where });

      // Basic include object
      const include: any = {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            venue: true,
            location: true,
            promotion: true,
          },
        },
        fighter1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            profileImage: true,
            wins: true,
            losses: true,
            draws: true,
          },
        },
        fighter2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            profileImage: true,
            wins: true,
            losses: true,
            draws: true,
          },
        },
      };

      // Add user-specific data if requested and user is authenticated
      const currentUserId = (request as any).user?.id;
      if (query.includeUserData && currentUserId) {
        console.log(`Including user data for userId: ${currentUserId}`);

        include.ratings = {
          where: { userId: currentUserId },
          select: {
            id: true,
            rating: true,
            createdAt: true,
            updatedAt: true,
          },
        };

        include.reviews = {
          where: { userId: currentUserId },
          select: {
            id: true,
            content: true,
            rating: true,
            createdAt: true,
            updatedAt: true,
          },
        };

        include.tags = {
          where: { userId: currentUserId },
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
          },
        };

        include.predictions = {
          where: { userId: currentUserId },
          select: {
            id: true,
            predictedRating: true,
            predictedWinner: true,
            predictedMethod: true,
            predictedRound: true,
            createdAt: true,
            updatedAt: true,
          },
        };
      } else {
        console.log('Skipping user data processing:', {
          includeUserData: query.includeUserData,
          hasUserId: !!currentUserId,
          userId: currentUserId
        });
      }

      // Get fights with related data
      const fights = await fastify.prisma.fight.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        include,
      });

      // Check which fights the user is following (if authenticated)
      let fightAlerts: any[] = [];
      if (currentUserId) {
        const fightIds = fights.map((f: any) => f.id);
        fightAlerts = await fastify.prisma.fightAlert.findMany({
          where: {
            userId: currentUserId,
            fightId: { in: fightIds },
          },
          select: {
            fightId: true,
          },
        });
      }

      const followedFightIds = new Set(fightAlerts.map(fa => fa.fightId));

      // Transform fights data to include user-specific data in the expected format
      const transformedFights = fights.map((fight: any) => {
        const transformed = { ...fight };

        // Transform user rating (take the first/only rating)
        if (fight.ratings && fight.ratings.length > 0) {
          transformed.userRating = fight.ratings[0].rating;
        }

        // Transform user review (take the first/only review)
        if (fight.reviews && fight.reviews.length > 0) {
          transformed.userReview = {
            content: fight.reviews[0].content,
            rating: fight.reviews[0].rating,
            createdAt: fight.reviews[0].createdAt,
            upvotes: fight.reviews[0].upvotes,
          };
        }

        // Transform user tags (extract tag names)
        if (fight.tags && fight.tags.length > 0) {
          transformed.userTags = fight.tags.map((fightTag: any) => fightTag.tag.name);
        }

        // Transform user prediction (take the first/only prediction)
        if (fight.predictions && fight.predictions.length > 0) {
          transformed.userHypePrediction = fight.predictions[0].predictedRating;
        }

        // Add isFollowing field
        if (currentUserId) {
          transformed.isFollowing = followedFightIds.has(fight.id);
        }

        // Remove the raw arrays to avoid confusion
        delete transformed.ratings;
        delete transformed.reviews;
        delete transformed.tags;
        delete transformed.predictions;

        return transformed;
      });

      const pagination = {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      };

      return reply.code(200).send({
        fights: transformedFights,
        pagination,
      });
    } catch (error) {
      console.error('Error in /fights route:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/:id - Get single fight with full details
  fastify.get('/fights/:id', { preHandler: optionalAuth }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const currentUserId = (request as any).user?.id; // Optional auth - may or may not be present

      console.log('Getting single fight with ID:', id, 'User ID:', currentUserId);

      const fight = await fastify.prisma.fight.findUnique({
        where: { id },
        include: {
          event: true,
          fighter1: true,
          fighter2: true,
          ratings: currentUserId ? {
            where: { userId: currentUserId }, // Only get current user's rating
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isMedia: true,
                  mediaOrganization: true,
                },
              },
            },
          } : false, // Don't include ratings if no user
          reviews: currentUserId ? {
            where: {
              userId: currentUserId,
              isHidden: false
            }, // Only get current user's review
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isMedia: true,
                  mediaOrganization: true,
                },
              },
              votes: {
                where: {
                  userId: currentUserId,
                },
              },
            },
          } : false, // Don't include reviews if no user
          tags: currentUserId ? {
            where: {
              userId: currentUserId // Only get current user's tags
            },
            include: {
              tag: true,
            },
          } : false, // Don't include tags if no user
          predictions: currentUserId ? {
            where: {
              userId: currentUserId // Only get current user's predictions
            },
            select: {
              id: true,
              predictedRating: true,
              predictedWinner: true,
              predictedMethod: true,
              predictedRound: true,
              createdAt: true,
              updatedAt: true,
            },
          } : false, // Don't include predictions if no user
        },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Transform the fight data to include user-specific data in the expected format (like the /fights endpoint)
      const fightWithRelations = fight as any;
      const transformedFight: any = { ...fight };

      if (currentUserId) {
        // Transform user rating (take the first/only rating)
        if (fightWithRelations.ratings && fightWithRelations.ratings.length > 0) {
          transformedFight.userRating = fightWithRelations.ratings[0].rating;
          console.log('Found user rating:', fightWithRelations.ratings[0].rating);
        }

        // Transform user review (take the first/only review)
        if (fightWithRelations.reviews && fightWithRelations.reviews.length > 0) {
          const review = fightWithRelations.reviews[0];
          transformedFight.userReview = {
            id: review.id,
            content: review.content,
            rating: review.rating,
            createdAt: review.createdAt,
            upvotes: review.upvotes,
            userHasUpvoted: review.votes?.length > 0 && review.votes[0].isUpvote,
          };
          console.log('Found user review:', transformedFight.userReview);
        }

        // Transform user tags (extract tag names)
        if (fightWithRelations.tags && fightWithRelations.tags.length > 0) {
          transformedFight.userTags = fightWithRelations.tags.map((fightTag: any) => fightTag.tag.name);
          console.log('Found user tags:', transformedFight.userTags);
        }

        // Transform user prediction (take the first/only prediction)
        if (fightWithRelations.predictions && fightWithRelations.predictions.length > 0) {
          transformedFight.userHypePrediction = fightWithRelations.predictions[0].predictedRating;
          transformedFight.userPredictedWinner = fightWithRelations.predictions[0].predictedWinner;
          transformedFight.userPredictedMethod = fightWithRelations.predictions[0].predictedMethod;
          transformedFight.userPredictedRound = fightWithRelations.predictions[0].predictedRound;
          console.log('Found user prediction:', transformedFight.userHypePrediction);
        }

        // Check if user is following this fight
        const fightAlert = await fastify.prisma.fightAlert.findUnique({
          where: {
            userId_fightId: {
              userId: currentUserId,
              fightId: id,
            },
          },
        });
        transformedFight.isFollowing = !!fightAlert;
        console.log('User is following this fight:', transformedFight.isFollowing);

        // Remove the raw arrays to avoid confusion
        delete transformedFight.ratings;
        delete transformedFight.reviews;
        delete transformedFight.tags;
        delete transformedFight.predictions;
      }

      // Final response logging
      console.log('Returning fight data with user-specific info:', {
        fightId: id,
        hasUserRating: !!transformedFight.userRating,
        hasUserReview: !!transformedFight.userReview,
        hasUserTags: !!transformedFight.userTags,
        hasUserPrediction: !!transformedFight.userHypePrediction
      });

      return reply.code(200).send({ fight: transformedFight });
    } catch (error) {
      console.error('Error in /fights/:id route:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // POST /api/fights/:id/rate - Rate a fight
  fastify.post('/fights/:id/rate', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const { rating } = CreateRatingSchema.parse(request.body);
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get previous rating for proper statistics update
      const previousRating = await fastify.prisma.fightRating.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      // Upsert rating (create or update)
      const fightRating = await fastify.prisma.fightRating.upsert({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        create: {
          userId: currentUserId,
          fightId,
          rating,
        },
        update: {
          rating,
        },
      });

      // Update fight statistics
      const ratingStats = await fastify.prisma.fightRating.aggregate({
        where: { fightId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      // Update rating distribution counters
      const ratingCounts = await fastify.prisma.fightRating.groupBy({
        by: ['rating'],
        where: { fightId },
        _count: { rating: true },
      });

      const ratingDistribution: any = {};
      for (let i = 1; i <= 10; i++) {
        const count = ratingCounts.find(r => r.rating === i)?._count.rating || 0;
        ratingDistribution[`ratings${i}`] = count;
      }

      await fastify.prisma.fight.update({
        where: { id: fightId },
        data: {
          averageRating: ratingStats._avg.rating || 0,
          totalRatings: ratingStats._count.rating || 0,
          ...ratingDistribution,
        },
      });

      // Add gamification points only for new ratings
      if (!previousRating) {
        await fastify.prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.FIGHT_RATED,
            points: 5,
            description: `Rated fight`,
            fightId,
          },
        });

        await fastify.prisma.user.update({
          where: { id: currentUserId },
          data: {
            points: { increment: 5 },
            totalRatings: { increment: 1 },
          },
        });
      }

      return reply.code(201).send({
        rating: fightRating,
        message: previousRating ? 'Rating updated successfully' : 'Fight rated successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid rating data',
          code: 'INVALID_RATING_DATA',
          details: error.errors,
        });
      }

      console.error('Rate fight error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // DELETE /api/fights/:id/rating - Remove user's rating from fight
  fastify.delete('/fights/:id/rating', {
    preHandler: [authenticateUser],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const currentUserId = (request as any).user.id;

      // Check if rating exists
      const existingRating = await fastify.prisma.fightRating.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      if (!existingRating) {
        return reply.code(404).send({
          error: 'Rating not found',
          code: 'RATING_NOT_FOUND',
        });
      }

      // Delete the rating
      await fastify.prisma.fightRating.delete({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      // Also delete review and tags if they exist
      await fastify.prisma.fightReview.deleteMany({
        where: {
          userId: currentUserId,
          fightId,
        },
      });

      await fastify.prisma.fightTag.deleteMany({
        where: {
          userId: currentUserId,
          fightId,
        },
      });

      // Update fight statistics
      const ratingStats = await fastify.prisma.fightRating.aggregate({
        where: { fightId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      const reviewCount = await fastify.prisma.fightReview.count({
        where: { fightId, isHidden: false },
      });

      // Update rating distribution counters
      const ratingCounts = await fastify.prisma.fightRating.groupBy({
        by: ['rating'],
        where: { fightId },
        _count: { rating: true },
      });

      const ratingDistribution: any = {};
      for (let i = 1; i <= 10; i++) {
        const count = ratingCounts.find(r => r.rating === i)?._count.rating || 0;
        ratingDistribution[`ratings${i}`] = count;
      }

      await fastify.prisma.fight.update({
        where: { id: fightId },
        data: {
          averageRating: ratingStats._avg.rating || 0,
          totalRatings: ratingStats._count.rating || 0,
          totalReviews: reviewCount,
          ...ratingDistribution,
        },
      });

      // Remove gamification points
      await fastify.prisma.user.update({
        where: { id: currentUserId },
        data: {
          points: { decrement: 5 },
          totalRatings: { decrement: 1 },
        },
      });

      return reply.code(200).send({
        message: 'Rating and associated data removed successfully',
      });
    } catch (error) {
      console.error('Delete rating error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // POST /api/fights/:id/review - Create or update a review
  fastify.post('/fights/:id/review', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const { content, rating, articleUrl, articleTitle } = CreateReviewSchema.parse(request.body);
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Create or update rating first
      await fastify.prisma.fightRating.upsert({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        create: {
          userId: currentUserId,
          fightId,
          rating,
        },
        update: {
          rating,
        },
      });

      // Create or update review
      const review = await fastify.prisma.fightReview.upsert({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        create: {
          userId: currentUserId,
          fightId,
          content,
          rating,
          articleUrl,
          articleTitle,
        },
        update: {
          content,
          rating,
          articleUrl,
          articleTitle,
        },
      });

      return reply.code(201).send({
        review,
        message: 'Review submitted successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid review data',
          code: 'INVALID_REVIEW_DATA',
          details: error.errors,
        });
      }

      console.error('Review error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // PUT /api/fights/:id/review - Update existing review
  fastify.put('/fights/:id/review', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const { content, rating, articleUrl, articleTitle } = UpdateReviewSchema.parse(request.body);
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Check if review already exists
      const existingReview = await fastify.prisma.fightReview.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      // Update rating
      await fastify.prisma.fightRating.upsert({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        create: {
          userId: currentUserId,
          fightId,
          rating,
        },
        update: {
          rating,
        },
      });

      // Update review
      const review = await fastify.prisma.fightReview.upsert({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        create: {
          userId: currentUserId,
          fightId,
          content,
          rating,
          articleUrl,
          articleTitle,
          upvotes: 1, // Auto-upvote on creation
        },
        update: {
          content,
          rating,
          articleUrl,
          articleTitle,
        },
      });

      // If this is a new review, create an auto-upvote
      if (!existingReview) {
        await fastify.prisma.reviewVote.create({
          data: {
            userId: currentUserId,
            reviewId: review.id,
            isUpvote: true,
          },
        });
      }

      return reply.code(200).send({
        review,
        message: 'Review updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid review data',
          code: 'INVALID_REVIEW_DATA',
          details: error.errors,
        });
      }

      console.error('Update review error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // POST /api/fights/:id/tags - Apply tags to a fight
  fastify.post('/fights/:id/tags', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const { tagNames } = FightTagsSchema.parse(request.body);
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Remove existing tags for this user and fight
      await fastify.prisma.fightTag.deleteMany({
        where: {
          userId: currentUserId,
          fightId,
        },
      });

      // Create or find tags and associate them with the fight
      const tagRecords = [];
      for (const tagName of tagNames) {
        // Find or create the tag
        const tag = await fastify.prisma.tag.upsert({
          where: { name: tagName },
          create: {
            name: tagName,
            category: 'STYLE' // Default category
          },
          update: {},
        });

        // Create the fight-tag association
        const fightTag = await fastify.prisma.fightTag.create({
          data: {
            userId: currentUserId,
            fightId,
            tagId: tag.id,
          },
          include: {
            tag: true,
          },
        });

        tagRecords.push(fightTag);
      }

      return reply.code(201).send({
        tags: tagRecords,
        message: 'Tags applied successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid tag data',
          code: 'INVALID_TAG_DATA',
          details: error.errors,
        });
      }

      console.error('Apply tags error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/:id/tags - Get tags for a fight
  fastify.get('/fights/:id/tags', {
    preHandler: [authenticateUser],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get user's tags for this fight
      const fightTags = await fastify.prisma.fightTag.findMany({
        where: {
          userId: currentUserId,
          fightId,
        },
        include: {
          tag: true,
        },
      });

      return reply.code(200).send({
        tags: fightTags,
      });
    } catch (error) {
      console.error('Get fight tags error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/:id/reviews - Get paginated reviews for a fight
  fastify.get('/fights/:id/reviews', { preHandler: optionalAuth }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const queryParams = request.query as { page?: string | number; limit?: string | number };
      const page = Number(queryParams.page) || 1;
      const limit = Number(queryParams.limit) || 10;
      const currentUserId = (request as any).user?.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get total count
      const total = await fastify.prisma.fightReview.count({
        where: {
          fightId,
          isHidden: false,
        },
      });

      // Get reviews with pagination
      const reviews = await fastify.prisma.fightReview.findMany({
        where: {
          fightId,
          isHidden: false,
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              isMedia: true,
              mediaOrganization: true,
            },
          },
          votes: currentUserId ? {
            where: {
              userId: currentUserId,
            },
          } : false,
          reports: currentUserId ? {
            where: {
              reporterId: currentUserId,
            },
          } : false,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Transform reviews to include userHasUpvoted and userHasFlagged flags
      const transformedReviews = reviews.map((review: any) => ({
        ...review,
        userHasUpvoted: currentUserId && review.votes?.length > 0 && review.votes[0].isUpvote,
        userHasFlagged: currentUserId && review.reports?.length > 0,
        votes: undefined, // Remove votes array from response
        reports: undefined, // Remove reports array from response
      }));

      return reply.code(200).send({
        reviews: transformedReviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Get fight reviews error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // POST /api/fights/:fightId/reviews/:reviewId/upvote - Toggle upvote on a review
  fastify.post('/fights/:fightId/reviews/:reviewId/upvote', {
    preHandler: [authenticateUser],
  }, async (request, reply) => {
    try {
      const { fightId, reviewId } = request.params as { fightId: string; reviewId: string };
      const currentUserId = (request as any).user.id;

      // Check if review exists
      const review = await fastify.prisma.fightReview.findUnique({
        where: { id: reviewId },
        include: { user: true },
      });

      if (!review) {
        return reply.code(404).send({
          error: 'Review not found',
          code: 'REVIEW_NOT_FOUND',
        });
      }

      // Check if user already voted
      const existingVote = await fastify.prisma.reviewVote.findUnique({
        where: {
          userId_reviewId: {
            userId: currentUserId,
            reviewId,
          },
        },
      });

      let isUpvoted = false;
      let upvotesCount = review.upvotes;

      if (existingVote) {
        if (existingVote.isUpvote) {
          // Remove upvote
          await fastify.prisma.$transaction([
            fastify.prisma.reviewVote.delete({
              where: { id: existingVote.id },
            }),
            fastify.prisma.fightReview.update({
              where: { id: reviewId },
              data: { upvotes: { decrement: 1 } },
            }),
            fastify.prisma.user.update({
              where: { id: review.userId },
              data: { upvotesReceived: { decrement: 1 } },
            }),
          ]);
          upvotesCount = review.upvotes - 1;
          isUpvoted = false;
        } else {
          // Change downvote to upvote
          await fastify.prisma.$transaction([
            fastify.prisma.reviewVote.update({
              where: { id: existingVote.id },
              data: { isUpvote: true },
            }),
            fastify.prisma.fightReview.update({
              where: { id: reviewId },
              data: {
                upvotes: { increment: 1 },
                downvotes: { decrement: 1 },
              },
            }),
            fastify.prisma.user.update({
              where: { id: review.userId },
              data: { upvotesReceived: { increment: 1 } },
            }),
          ]);
          upvotesCount = review.upvotes + 1;
          isUpvoted = true;
        }
      } else {
        // Create new upvote
        await fastify.prisma.$transaction([
          fastify.prisma.reviewVote.create({
            data: {
              userId: currentUserId,
              reviewId,
              isUpvote: true,
            },
          }),
          fastify.prisma.fightReview.update({
            where: { id: reviewId },
            data: { upvotes: { increment: 1 } },
          }),
          fastify.prisma.user.update({
            where: { id: review.userId },
            data: { upvotesReceived: { increment: 1 } },
          }),
        ]);
        upvotesCount = review.upvotes + 1;
        isUpvoted = true;

        // Create activity for the review author (only if not self-upvoting)
        if (review.userId !== currentUserId) {
          await fastify.prisma.userActivity.create({
            data: {
              userId: review.userId,
              activityType: 'REVIEW_UPVOTED',
              points: 2,
              reviewId,
            },
          });
        }
      }

      return reply.code(200).send({
        message: isUpvoted ? 'Review upvoted' : 'Upvote removed',
        isUpvoted,
        upvotesCount,
      });
    } catch (error) {
      console.error('Toggle review upvote error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // PUT /api/fights/:id/user-data - Update all user data atomically
  fastify.put('/fights/:id/user-data', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const { rating, review, tags } = UpdateUserDataSchema.parse(request.body);
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get previous data for tracking changes
      const previousRating = await fastify.prisma.fightRating.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      const previousReview = await fastify.prisma.fightReview.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      const resultData: any = {};

      // Handle rating
      if (rating !== undefined) {
        if (rating === null) {
          // Remove rating
          await fastify.prisma.fightRating.deleteMany({
            where: {
              userId: currentUserId,
              fightId,
            },
          });
        } else {
          // Upsert rating
          const fightRating = await fastify.prisma.fightRating.upsert({
            where: {
              userId_fightId: {
                userId: currentUserId,
                fightId,
              },
            },
            create: {
              userId: currentUserId,
              fightId,
              rating,
            },
            update: {
              rating,
            },
          });
          resultData.rating = rating;
        }

        // Update fight statistics
        const ratingStats = await fastify.prisma.fightRating.aggregate({
          where: { fightId },
          _avg: { rating: true },
          _count: { rating: true },
        });

        const ratingCounts = await fastify.prisma.fightRating.groupBy({
          by: ['rating'],
          where: { fightId },
          _count: { rating: true },
        });

        const ratingDistribution: any = {};
        for (let i = 1; i <= 10; i++) {
          const count = ratingCounts.find(r => r.rating === i)?._count.rating || 0;
          ratingDistribution[`ratings${i}`] = count;
        }

        await fastify.prisma.fight.update({
          where: { id: fightId },
          data: {
            averageRating: ratingStats._avg.rating || 0,
            totalRatings: ratingStats._count.rating || 0,
            ...ratingDistribution,
          },
        });
      }

      // Handle review
      if (review !== undefined) {
        if (review === null) {
          // Remove review
          await fastify.prisma.fightReview.deleteMany({
            where: {
              userId: currentUserId,
              fightId,
            },
          });
        } else {
          // Review requires a rating - use existing rating or provided rating
          const effectiveRating = rating !== undefined && rating !== null
            ? rating
            : previousRating?.rating;

          if (!effectiveRating) {
            return reply.code(400).send({
              error: 'Reviews require a rating. Please provide a rating with your review.',
              code: 'REVIEW_REQUIRES_RATING',
            });
          }

          // Upsert review
          const fightReview = await fastify.prisma.fightReview.upsert({
            where: {
              userId_fightId: {
                userId: currentUserId,
                fightId,
              },
            },
            create: {
              userId: currentUserId,
              fightId,
              content: review,
              rating: effectiveRating,
            },
            update: {
              content: review,
              rating: effectiveRating,
            },
          });
          resultData.review = review;
        }

        // Update fight review statistics
        const reviewStats = await fastify.prisma.fightReview.aggregate({
          where: { fightId },
          _count: { id: true },
        });

        await fastify.prisma.fight.update({
          where: { id: fightId },
          data: {
            totalReviews: reviewStats._count.id || 0,
          },
        });
      }

      // Handle tags
      if (tags !== undefined) {
        // Remove existing tags for this user and fight
        await fastify.prisma.fightTag.deleteMany({
          where: {
            userId: currentUserId,
            fightId,
          },
        });

        // Add new tags
        if (tags.length > 0) {
          const tagRecords = [];
          for (const tagName of tags) {
            // Find or create the tag
            const tag = await fastify.prisma.tag.upsert({
              where: { name: tagName },
              create: {
                name: tagName,
                category: 'STYLE' // Default category
              },
              update: {},
            });

            // Create the fight-tag association
            const fightTag = await fastify.prisma.fightTag.create({
              data: {
                userId: currentUserId,
                fightId,
                tagId: tag.id,
              },
              include: {
                tag: true,
              },
            });

            tagRecords.push(fightTag);
          }
          resultData.tags = tags;
        } else {
          resultData.tags = [];
        }
      }

      // Add gamification points only for new ratings/reviews
      if (rating && rating > 0 && !previousRating) {
        await fastify.prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.FIGHT_RATED,
            points: 5,
            description: 'Rated fight',
            fightId,
          },
        });

        await fastify.prisma.user.update({
          where: { id: currentUserId },
          data: {
            points: { increment: 5 },
            totalRatings: { increment: 1 },
          },
        });
      }

      if (review && review.length > 0 && !previousReview) {
        await fastify.prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.REVIEW_WRITTEN,
            points: 15,
            description: 'Posted fight review',
            fightId,
          },
        });

        await fastify.prisma.user.update({
          where: { id: currentUserId },
          data: {
            points: { increment: 15 },
            totalReviews: { increment: 1 },
          },
        });
      }

      return reply.code(200).send({
        message: 'User data updated successfully',
        data: resultData,
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Invalid request data',
          code: 'INVALID_REQUEST_DATA',
          details: error.errors,
        });
      }

      console.error('Update user data error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // POST /api/fights/:id/prediction - Create or update a fight prediction
  fastify.post<{
    Params: { id: string };
    Body: unknown;
  }>('/fights/:id/prediction', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request: any, reply: any) => {
    try {
      const fightId = request.params.id;
      const currentUserId = (request as any).user.id;

      // Validate request body
      const validation = CreatePredictionSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          error: 'Invalid prediction data',
          code: 'INVALID_PREDICTION_DATA',
          details: validation.error.errors,
        });
      }

      const { predictedRating, predictedWinner, predictedMethod, predictedRound } = validation.data;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({
        where: { id: fightId },
        include: {
          fighter1: true,
          fighter2: true,
        },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Check if fight has started (can't predict after it starts)
      if (fight.hasStarted) {
        return reply.code(400).send({
          error: 'Cannot make predictions after fight has started',
          code: 'FIGHT_ALREADY_STARTED',
        });
      }

      // Validate predicted winner is one of the fighters
      if (predictedWinner && predictedWinner !== fight.fighter1Id && predictedWinner !== fight.fighter2Id) {
        return reply.code(400).send({
          error: 'Predicted winner must be one of the fight participants',
          code: 'INVALID_PREDICTED_WINNER',
        });
      }

      // Create or update prediction
      const prediction = await fastify.prisma.fightPrediction.upsert({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        create: {
          userId: currentUserId,
          fightId,
          predictedRating: predictedRating || null,
          predictedWinner: predictedWinner || null,
          predictedMethod: predictedMethod || null,
          predictedRound: predictedRound || null,
        },
        update: {
          predictedRating: predictedRating || null,
          predictedWinner: predictedWinner || null,
          predictedMethod: predictedMethod || null,
          predictedRound: predictedRound || null,
          updatedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Add activity log for new predictions
      const isNewPrediction = !await fastify.prisma.fightPrediction.findFirst({
        where: {
          userId: currentUserId,
          fightId,
          createdAt: { lt: new Date(Date.now() - 1000) }, // Created more than 1 second ago
        },
      });

      if (isNewPrediction) {
        await fastify.prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.PREDICTION_MADE,
            points: 5,
            description: 'Made fight prediction',
            fightId,
            predictionId: prediction.id,
          },
        });

        await fastify.prisma.user.update({
          where: { id: currentUserId },
          data: {
            points: { increment: 5 },
          },
        });
      }

      return reply.send({
        prediction: {
          id: prediction.id,
          predictedRating: prediction.predictedRating,
          predictedWinner: (prediction as any).predictedWinner,
          predictedMethod: (prediction as any).predictedMethod,
          predictedRound: (prediction as any).predictedRound,
          createdAt: prediction.createdAt,
          updatedAt: prediction.updatedAt,
          user: {
            id: (prediction as any).user.id,
            name: (prediction as any).user.displayName || `${(prediction as any).user.firstName} ${(prediction as any).user.lastName}`,
          },
        },
        message: 'Prediction saved successfully',
      });

    } catch (error) {
      console.error('Prediction creation error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/:id/prediction - Get user's prediction for a fight
  fastify.get<{
    Params: { id: string };
  }>('/fights/:id/prediction', {
    preHandler: [authenticateUser],
  }, async (request: any, reply: any) => {
    try {
      const fightId = request.params.id;
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({
        where: { id: fightId },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get user's prediction
      const prediction = await fastify.prisma.fightPrediction.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!prediction) {
        return reply.code(404).send({
          error: 'No prediction found for this fight',
          code: 'PREDICTION_NOT_FOUND',
        });
      }

      return reply.send({
        prediction: {
          id: prediction.id,
          predictedRating: prediction.predictedRating,
          predictedWinner: (prediction as any).predictedWinner,
          predictedMethod: (prediction as any).predictedMethod,
          predictedRound: (prediction as any).predictedRound,
          createdAt: prediction.createdAt,
          updatedAt: prediction.updatedAt,
          user: {
            id: (prediction as any).user.id,
            name: (prediction as any).user.displayName || `${(prediction as any).user.firstName} ${(prediction as any).user.lastName}`,
          },
        },
      });

    } catch (error) {
      console.error('Prediction fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/:id/predictions - Get aggregate prediction stats for a fight
  fastify.get('/fights/:id/predictions', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    try {
      const fightId = request.params.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({
        where: { id: fightId },
        include: {
          fighter1: true,
          fighter2: true,
        },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get aggregate prediction stats
      const predictions = await fastify.prisma.fightPrediction.findMany({
        where: { fightId },
      });

      const totalPredictions = predictions.length;
      const predictionsWithRating = predictions.filter(p => p.predictedRating !== null);
      const averageHype = predictionsWithRating.length > 0
        ? predictionsWithRating.reduce((sum, p) => sum + (p.predictedRating as number), 0) / predictionsWithRating.length
        : 0;

      const fighter1Predictions = predictions.filter(p => (p as any).predictedWinner === fight.fighter1Id).length;
      const fighter2Predictions = predictions.filter(p => (p as any).predictedWinner === fight.fighter2Id).length;

      const methodBreakdown = {
        DECISION: predictions.filter(p => (p as any).predictedMethod === 'DECISION').length,
        KO_TKO: predictions.filter(p => (p as any).predictedMethod === 'KO_TKO').length,
        SUBMISSION: predictions.filter(p => (p as any).predictedMethod === 'SUBMISSION').length,
      };

      // Round prediction breakdown (rounds 1-5 are most common, but support up to 12 for boxing)
      const roundBreakdown: Record<number, number> = {};
      for (let round = 1; round <= 12; round++) {
        roundBreakdown[round] = predictions.filter(p => (p as any).predictedRound === round).length;
      }

      // Hype distribution (1-10 scale)
      const hypeDistribution: Record<number, number> = {};
      for (let hype = 1; hype <= 10; hype++) {
        hypeDistribution[hype] = predictions.filter(p => p.predictedRating === hype).length;
      }

      // Per-fighter method predictions
      const fighter1MethodPredictions = predictions.filter(p => (p as any).predictedWinner === fight.fighter1Id);
      const fighter2MethodPredictions = predictions.filter(p => (p as any).predictedWinner === fight.fighter2Id);

      const fighter1Methods = {
        DECISION: fighter1MethodPredictions.filter(p => (p as any).predictedMethod === 'DECISION').length,
        KO_TKO: fighter1MethodPredictions.filter(p => (p as any).predictedMethod === 'KO_TKO').length,
        SUBMISSION: fighter1MethodPredictions.filter(p => (p as any).predictedMethod === 'SUBMISSION').length,
      };

      const fighter2Methods = {
        DECISION: fighter2MethodPredictions.filter(p => (p as any).predictedMethod === 'DECISION').length,
        KO_TKO: fighter2MethodPredictions.filter(p => (p as any).predictedMethod === 'KO_TKO').length,
        SUBMISSION: fighter2MethodPredictions.filter(p => (p as any).predictedMethod === 'SUBMISSION').length,
      };

      // Per-fighter round predictions
      const fighter1Rounds: Record<number, number> = {};
      const fighter2Rounds: Record<number, number> = {};
      for (let round = 1; round <= 12; round++) {
        fighter1Rounds[round] = fighter1MethodPredictions.filter(p => (p as any).predictedRound === round).length;
        fighter2Rounds[round] = fighter2MethodPredictions.filter(p => (p as any).predictedRound === round).length;
      }

      return reply.send({
        fightId,
        totalPredictions,
        averageHype: Math.round(averageHype * 10) / 10, // Round to 1 decimal
        distribution: hypeDistribution, // Add distribution for frontend
        winnerPredictions: {
          fighter1: {
            id: fight.fighter1Id,
            name: `${fight.fighter1.firstName} ${fight.fighter1.lastName}`,
            predictions: fighter1Predictions,
            percentage: totalPredictions > 0 ? Math.round((fighter1Predictions / totalPredictions) * 100) : 0,
          },
          fighter2: {
            id: fight.fighter2Id,
            name: `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
            predictions: fighter2Predictions,
            percentage: totalPredictions > 0 ? Math.round((fighter2Predictions / totalPredictions) * 100) : 0,
          },
        },
        methodPredictions: methodBreakdown,
        roundPredictions: roundBreakdown,
        fighter1MethodPredictions: fighter1Methods,
        fighter1RoundPredictions: fighter1Rounds,
        fighter2MethodPredictions: fighter2Methods,
        fighter2RoundPredictions: fighter2Rounds,
      });

    } catch (error) {
      console.error('Aggregate predictions fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/:id/aggregate-stats - Get aggregate stats for completed fights (reviews count, top tags, community predictions)
  fastify.get('/fights/:id/aggregate-stats', { preHandler: optionalAuth }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const currentUserId = (request as any).user?.id;

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({
        where: { id: fightId },
        include: {
          fighter1: true,
          fighter2: true,
        },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // 1. Get review/comment count
      const reviewCount = await fastify.prisma.fightReview.count({
        where: {
          fightId,
          isHidden: false,
        },
      });

      // 2. Get user's prediction (if authenticated)
      let userPrediction = null;
      if (currentUserId) {
        const prediction = await fastify.prisma.fightPrediction.findUnique({
          where: {
            userId_fightId: {
              userId: currentUserId,
              fightId,
            },
          },
        });

        if (prediction) {
          let winnerName = null;
          if (prediction.predictedWinner === fight.fighter1Id) {
            winnerName = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
          } else if (prediction.predictedWinner === fight.fighter2Id) {
            winnerName = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
          }

          userPrediction = {
            winner: winnerName,
            method: (prediction as any).predictedMethod,
            round: (prediction as any).predictedRound,
          };
        }
      }

      // 3. Get community's most common prediction
      const predictions = await fastify.prisma.fightPrediction.findMany({
        where: { fightId },
      });

      let communityPrediction = null;
      if (predictions.length > 0) {
        // Most predicted winner
        const fighter1Predictions = predictions.filter(p => (p as any).predictedWinner === fight.fighter1Id).length;
        const fighter2Predictions = predictions.filter(p => (p as any).predictedWinner === fight.fighter2Id).length;

        let mostPredictedWinner = null;
        if (fighter1Predictions > fighter2Predictions) {
          mostPredictedWinner = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
        } else if (fighter2Predictions > fighter1Predictions) {
          mostPredictedWinner = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
        }

        // Most predicted method
        const methodCounts: Record<string, number> = {
          DECISION: predictions.filter(p => (p as any).predictedMethod === 'DECISION').length,
          KO_TKO: predictions.filter(p => (p as any).predictedMethod === 'KO_TKO').length,
          SUBMISSION: predictions.filter(p => (p as any).predictedMethod === 'SUBMISSION').length,
        };
        const mostPredictedMethod = Object.entries(methodCounts).reduce((a, b) => (methodCounts[a[0]] || 0) > (methodCounts[b[0]] || 0) ? a : b)[0];

        // Most predicted round
        const roundCounts: Record<number, number> = {};
        for (let round = 1; round <= 12; round++) {
          roundCounts[round] = predictions.filter(p => (p as any).predictedRound === round).length;
        }
        const mostPredictedRound = Object.entries(roundCounts).reduce((a, b) => (roundCounts[Number(a[0])] > roundCounts[Number(b[0])] ? a : b), ['1', 0])[0];

        communityPrediction = {
          winner: mostPredictedWinner,
          method: mostPredictedMethod === 'KO_TKO' ? 'KO/TKO' : mostPredictedMethod,
          round: mostPredictedRound !== '0' && roundCounts[Number(mostPredictedRound)] > 0 ? Number(mostPredictedRound) : null,
        };
      }

      // 4. Get number of people who rated the fight
      const totalRatings = fight.totalRatings;

      // 5. Get top 5 most common tags for this fight
      const tagStats = await fastify.prisma.fightTag.groupBy({
        by: ['tagId'],
        where: { fightId },
        _count: {
          tagId: true,
        },
        orderBy: {
          _count: {
            tagId: 'desc',
          },
        },
        take: 5,
      });

      // Get tag names for the top tags
      const topTagIds = tagStats.map(t => t.tagId);
      const tags = await fastify.prisma.tag.findMany({
        where: {
          id: { in: topTagIds },
        },
        select: {
          id: true,
          name: true,
        },
      });

      const topTags = tagStats.map(stat => {
        const tag = tags.find(t => t.id === stat.tagId);
        return {
          name: tag?.name || 'Unknown',
          count: stat._count.tagId,
        };
      });

      return reply.send({
        fightId,
        reviewCount,
        totalRatings,
        userPrediction,
        communityPrediction,
        topTags,
      });

    } catch (error) {
      console.error('Aggregate stats fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // GET /api/fights/my-ratings - Get user's rated/reviewed/tagged fights
  const MyRatingsQuerySchema = z.object({
    page: z.string().transform(val => parseInt(val) || 1).pipe(z.number().int().min(1)).default('1'),
    limit: z.string().transform(val => parseInt(val) || 20).pipe(z.number().int().min(1).max(50)).default('20'),
    sortBy: z.enum(['newest', 'rating', 'aggregate', 'upvotes']).default('newest'),
    tagFilter: z.string().optional(),
  });

  fastify.get('/fights/my-ratings', {
    preHandler: [authenticateUser],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = MyRatingsQuerySchema.parse(request.query);
      const currentUserId = (request as any).user.id;

      // Get all fight IDs where user has ratings, reviews, or tags
      const [ratedFightIds, reviewedFightIds, taggedFightIds] = await Promise.all([
        fastify.prisma.fightRating.findMany({
          where: { userId: currentUserId },
          select: { fightId: true },
        }),
        fastify.prisma.fightReview.findMany({
          where: { userId: currentUserId },
          select: { fightId: true },
        }),
        fastify.prisma.fightTag.findMany({
          where: { userId: currentUserId },
          select: { fightId: true },
        }),
      ]);

      // Combine unique fight IDs
      const allFightIds = Array.from(new Set([
        ...ratedFightIds.map(r => r.fightId),
        ...reviewedFightIds.map(r => r.fightId),
        ...taggedFightIds.map(t => t.fightId),
      ]));

      if (allFightIds.length === 0) {
        return reply.send({
          fights: [],
          pagination: {
            page: query.page,
            limit: query.limit,
            total: 0,
            totalPages: 0,
          },
        });
      }

      // Build where clause
      const where: any = {
        id: { in: allFightIds },
      };

      // Apply tag filter if provided
      if (query.tagFilter) {
        const tag = await fastify.prisma.tag.findUnique({
          where: { name: query.tagFilter },
        });

        if (tag) {
          const fightsWithTag = await fastify.prisma.fightTag.findMany({
            where: {
              userId: currentUserId,
              tagId: tag.id,
            },
            select: { fightId: true },
          });

          const taggedIds = fightsWithTag.map(ft => ft.fightId);
          where.id = { in: taggedIds };
        } else {
          // Tag doesn't exist, return empty
          return reply.send({
            fights: [],
            pagination: {
              page: query.page,
              limit: query.limit,
              total: 0,
              totalPages: 0,
            },
          });
        }
      }

      // Get fights with user data
      const fights = await fastify.prisma.fight.findMany({
        where,
        include: {
          event: {
            select: {
              id: true,
              name: true,
              date: true,
              venue: true,
              location: true,
              promotion: true,
            },
          },
          fighter1: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              profileImage: true,
              wins: true,
              losses: true,
              draws: true,
            },
          },
          fighter2: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              nickname: true,
              profileImage: true,
              wins: true,
              losses: true,
              draws: true,
            },
          },
          ratings: {
            where: { userId: currentUserId },
            select: {
              id: true,
              rating: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          reviews: {
            where: { userId: currentUserId },
            select: {
              id: true,
              content: true,
              rating: true,
              upvotes: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          tags: {
            where: { userId: currentUserId },
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
          },
        },
      });

      // Transform fights data
      const transformedFights = fights.map((fight: any) => {
        const transformed = { ...fight };

        // Transform user rating
        if (fight.ratings && fight.ratings.length > 0) {
          transformed.userRating = fight.ratings[0].rating;
          transformed.userRatingCreatedAt = fight.ratings[0].createdAt;
        }

        // Transform user review
        if (fight.reviews && fight.reviews.length > 0) {
          transformed.userReview = {
            content: fight.reviews[0].content,
            rating: fight.reviews[0].rating,
            upvotes: fight.reviews[0].upvotes,
            createdAt: fight.reviews[0].createdAt,
          };
        }

        // Transform user tags
        if (fight.tags && fight.tags.length > 0) {
          transformed.userTags = fight.tags.map((fightTag: any) => fightTag.tag.name);
        }

        // Remove raw arrays
        delete transformed.ratings;
        delete transformed.reviews;
        delete transformed.tags;

        return transformed;
      });

      // Sort fights based on sortBy parameter
      transformedFights.sort((a, b) => {
        switch (query.sortBy) {
          case 'newest':
            const aDate = a.userRatingCreatedAt || a.userReview?.createdAt || new Date(0);
            const bDate = b.userRatingCreatedAt || b.userReview?.createdAt || new Date(0);
            return new Date(bDate).getTime() - new Date(aDate).getTime();
          case 'rating':
            return (b.userRating || 0) - (a.userRating || 0);
          case 'aggregate':
            return (b.averageRating || 0) - (a.averageRating || 0);
          case 'upvotes':
            return (b.userReview?.upvotes || 0) - (a.userReview?.upvotes || 0);
          default:
            return 0;
        }
      });

      // Apply pagination
      const skip = (query.page - 1) * query.limit;
      const paginatedFights = transformedFights.slice(skip, skip + query.limit);

      const pagination = {
        page: query.page,
        limit: query.limit,
        total: transformedFights.length,
        totalPages: Math.ceil(transformedFights.length / query.limit),
      };

      return reply.send({
        fights: paginatedFights,
        pagination,
      });

    } catch (error) {
      console.error('Error in /fights/my-ratings route:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // POST /api/fights/:fightId/reviews/:reviewId/flag - Flag a review as inappropriate
  fastify.post<{
    Params: { fightId: string; reviewId: string };
    Body: { reason: string };
  }>('/fights/:fightId/reviews/:reviewId/flag', {
    preHandler: [authenticateUser],
  }, async (request: FastifyRequest<{
    Params: { fightId: string; reviewId: string };
    Body: { reason: string };
  }>, reply: FastifyReply) => {
    try {
      const { fightId, reviewId } = request.params;
      const { reason } = request.body;
      const userId = request.user!.id;

      // Validate reason
      const validReasons = ['SPAM', 'HARASSMENT', 'PRIVACY', 'INAPPROPRIATE_CONTENT', 'MISINFORMATION', 'OTHER'];
      if (!reason || !validReasons.includes(reason)) {
        return reply.code(400).send({
          error: 'Invalid or missing report reason',
          code: 'INVALID_REASON',
        });
      }

      // Check if fight exists
      const fight = await fastify.prisma.fight.findUnique({
        where: { id: fightId },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Check if review exists
      const review = await fastify.prisma.fightReview.findUnique({
        where: { id: reviewId },
      });

      if (!review) {
        return reply.code(404).send({
          error: 'Review not found',
          code: 'REVIEW_NOT_FOUND',
        });
      }

      // Upsert report (create or update if exists)
      await fastify.prisma.reviewReport.upsert({
        where: {
          reporterId_reviewId: {
            reporterId: userId,
            reviewId,
          },
        },
        update: {
          reason: reason as any,
        },
        create: {
          reporterId: userId,
          reviewId,
          reason: reason as any,
        },
      });

      return reply.send({
        message: 'Review has been flagged for moderation',
      });

    } catch (error) {
      console.error('Error flagging review:', error);
      return reply.code(500).send({
        error: 'Failed to flag review',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}