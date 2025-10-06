import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PrismaClient, WeightClass, Sport, Gender, ActivityType, PredictionMethod } from '@prisma/client';
import { authenticateUser, requireEmailVerification, optionalAuth } from '../middleware/auth';

const prisma = new PrismaClient();

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
  limit: z.string().transform(val => parseInt(val) || 20).pipe(z.number().int().min(1).max(50)).default('20'),
  eventId: z.string().uuid().optional(),
  fighterId: z.string().uuid().optional(),
  weightClass: z.nativeEnum(WeightClass).optional(),
  isTitle: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
  hasStarted: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
  isComplete: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
  minRating: z.string().transform(val => parseFloat(val)).pipe(z.number().min(0).max(10)).optional(),
  sortBy: z.enum(['event.date', 'averageRating', 'totalRatings', 'createdAt']).default('event.date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  includeUserData: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
});

const CreateRatingSchema = z.object({
  rating: z.number().int().min(1).max(10),
});

const CreateReviewSchema = z.object({
  content: z.string().min(3).max(5000),
  rating: z.number().int().min(1).max(10),
  articleUrl: z.string().url().optional(),
  articleTitle: z.string().max(200).optional(),
});

const UpdateReviewSchema = z.object({
  content: z.string().min(3).max(5000),
  rating: z.number().int().min(1).max(10),
  articleUrl: z.string().url().optional(),
  articleTitle: z.string().max(200).optional(),
});

const FightTagsSchema = z.object({
  tagNames: z.array(z.string()).min(1).max(10),
});

const UpdateUserDataSchema = z.object({
  rating: z.number().int().min(1).max(10).nullable().optional(),
  review: z.string().min(3).max(5000).nullable().optional(),
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
      const total = await prisma.fight.count({ where });

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
      const fights = await prisma.fight.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        include,
      });

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

      const fight = await prisma.fight.findUnique({
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
          transformedFight.userReview = {
            content: fightWithRelations.reviews[0].content,
            rating: fightWithRelations.reviews[0].rating,
            createdAt: fightWithRelations.reviews[0].createdAt,
          };
          console.log('Found user review:', transformedFight.userReview);
        }

        // Transform user tags (extract tag names)
        if (fightWithRelations.tags && fightWithRelations.tags.length > 0) {
          transformedFight.userTags = fightWithRelations.tags.map((fightTag: any) => fightTag.tag.name);
          console.log('Found user tags:', transformedFight.userTags);
        }

        // Remove the raw arrays to avoid confusion
        delete transformedFight.ratings;
        delete transformedFight.reviews;
        delete transformedFight.tags;
      }

      // Final response logging
      console.log('Returning fight data with user-specific info:', {
        fightId: id,
        hasUserRating: !!transformedFight.userRating,
        hasUserReview: !!transformedFight.userReview,
        hasUserTags: !!transformedFight.userTags
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
      const fight = await prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get previous rating for proper statistics update
      const previousRating = await prisma.fightRating.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      // Upsert rating (create or update)
      const fightRating = await prisma.fightRating.upsert({
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
      const ratingStats = await prisma.fightRating.aggregate({
        where: { fightId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      // Update rating distribution counters
      const ratingCounts = await prisma.fightRating.groupBy({
        by: ['rating'],
        where: { fightId },
        _count: { rating: true },
      });

      const ratingDistribution: any = {};
      for (let i = 1; i <= 10; i++) {
        const count = ratingCounts.find(r => r.rating === i)?._count.rating || 0;
        ratingDistribution[`ratings${i}`] = count;
      }

      await prisma.fight.update({
        where: { id: fightId },
        data: {
          averageRating: ratingStats._avg.rating || 0,
          totalRatings: ratingStats._count.rating || 0,
          ...ratingDistribution,
        },
      });

      // Add gamification points only for new ratings
      if (!previousRating) {
        await prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.FIGHT_RATED,
            points: 5,
            description: `Rated fight`,
            fightId,
          },
        });

        await prisma.user.update({
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
      const existingRating = await prisma.fightRating.findUnique({
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
      await prisma.fightRating.delete({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      // Also delete review and tags if they exist
      await prisma.fightReview.deleteMany({
        where: {
          userId: currentUserId,
          fightId,
        },
      });

      await prisma.fightTag.deleteMany({
        where: {
          userId: currentUserId,
          fightId,
        },
      });

      // Update fight statistics
      const ratingStats = await prisma.fightRating.aggregate({
        where: { fightId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      const reviewCount = await prisma.fightReview.count({
        where: { fightId, isHidden: false },
      });

      // Update rating distribution counters
      const ratingCounts = await prisma.fightRating.groupBy({
        by: ['rating'],
        where: { fightId },
        _count: { rating: true },
      });

      const ratingDistribution: any = {};
      for (let i = 1; i <= 10; i++) {
        const count = ratingCounts.find(r => r.rating === i)?._count.rating || 0;
        ratingDistribution[`ratings${i}`] = count;
      }

      await prisma.fight.update({
        where: { id: fightId },
        data: {
          averageRating: ratingStats._avg.rating || 0,
          totalRatings: ratingStats._count.rating || 0,
          totalReviews: reviewCount,
          ...ratingDistribution,
        },
      });

      // Remove gamification points
      await prisma.user.update({
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
      const fight = await prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Create or update rating first
      await prisma.fightRating.upsert({
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
      const review = await prisma.fightReview.upsert({
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
      const fight = await prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Update rating
      await prisma.fightRating.upsert({
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
      const review = await prisma.fightReview.upsert({
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
      const fight = await prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Remove existing tags for this user and fight
      await prisma.fightTag.deleteMany({
        where: {
          userId: currentUserId,
          fightId,
        },
      });

      // Create or find tags and associate them with the fight
      const tagRecords = [];
      for (const tagName of tagNames) {
        // Find or create the tag
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          create: {
            name: tagName,
            category: 'STYLE' // Default category
          },
          update: {},
        });

        // Create the fight-tag association
        const fightTag = await prisma.fightTag.create({
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
      const fight = await prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get user's tags for this fight
      const fightTags = await prisma.fightTag.findMany({
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

  // PUT /api/fights/:id/user-data - Update all user data atomically
  fastify.put('/fights/:id/user-data', {
    preHandler: [authenticateUser, requireEmailVerification],
  }, async (request, reply) => {
    try {
      const { id: fightId } = request.params as { id: string };
      const { rating, review, tags } = UpdateUserDataSchema.parse(request.body);
      const currentUserId = (request as any).user.id;

      // Check if fight exists
      const fight = await prisma.fight.findUnique({ where: { id: fightId } });
      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get previous data for tracking changes
      const previousRating = await prisma.fightRating.findUnique({
        where: {
          userId_fightId: {
            userId: currentUserId,
            fightId,
          },
        },
      });

      const previousReview = await prisma.fightReview.findUnique({
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
          await prisma.fightRating.deleteMany({
            where: {
              userId: currentUserId,
              fightId,
            },
          });
        } else {
          // Upsert rating
          const fightRating = await prisma.fightRating.upsert({
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
        const ratingStats = await prisma.fightRating.aggregate({
          where: { fightId },
          _avg: { rating: true },
          _count: { rating: true },
        });

        const ratingCounts = await prisma.fightRating.groupBy({
          by: ['rating'],
          where: { fightId },
          _count: { rating: true },
        });

        const ratingDistribution: any = {};
        for (let i = 1; i <= 10; i++) {
          const count = ratingCounts.find(r => r.rating === i)?._count.rating || 0;
          ratingDistribution[`ratings${i}`] = count;
        }

        await prisma.fight.update({
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
          await prisma.fightReview.deleteMany({
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
          const fightReview = await prisma.fightReview.upsert({
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
        const reviewStats = await prisma.fightReview.aggregate({
          where: { fightId },
          _count: { id: true },
        });

        await prisma.fight.update({
          where: { id: fightId },
          data: {
            totalReviews: reviewStats._count.id || 0,
          },
        });
      }

      // Handle tags
      if (tags !== undefined) {
        // Remove existing tags for this user and fight
        await prisma.fightTag.deleteMany({
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
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              create: {
                name: tagName,
                category: 'STYLE' // Default category
              },
              update: {},
            });

            // Create the fight-tag association
            const fightTag = await prisma.fightTag.create({
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
        await prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.FIGHT_RATED,
            points: 5,
            description: 'Rated fight',
            fightId,
          },
        });

        await prisma.user.update({
          where: { id: currentUserId },
          data: {
            points: { increment: 5 },
            totalRatings: { increment: 1 },
          },
        });
      }

      if (review && review.length > 0 && !previousReview) {
        await prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.REVIEW_WRITTEN,
            points: 15,
            description: 'Posted fight review',
            fightId,
          },
        });

        await prisma.user.update({
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

      // Ensure at least one prediction field is provided (check for undefined/null, not falsy)
      const hasAnyPrediction =
        predictedRating !== undefined ||
        predictedWinner !== undefined ||
        predictedMethod !== undefined ||
        predictedRound !== undefined;
      if (!hasAnyPrediction) {
        return reply.code(400).send({
          error: 'At least one prediction field must be provided',
          code: 'NO_PREDICTION_DATA',
        });
      }

      // Check if fight exists
      const fight = await prisma.fight.findUnique({
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
      const prediction = await prisma.fightPrediction.upsert({
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
      const isNewPrediction = !await prisma.fightPrediction.findFirst({
        where: {
          userId: currentUserId,
          fightId,
          createdAt: { lt: new Date(Date.now() - 1000) }, // Created more than 1 second ago
        },
      });

      if (isNewPrediction) {
        await prisma.userActivity.create({
          data: {
            userId: currentUserId,
            activityType: ActivityType.PREDICTION_MADE,
            points: 5,
            description: 'Made fight prediction',
            fightId,
            predictionId: prediction.id,
          },
        });

        await prisma.user.update({
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
      const fight = await prisma.fight.findUnique({
        where: { id: fightId },
      });

      if (!fight) {
        return reply.code(404).send({
          error: 'Fight not found',
          code: 'FIGHT_NOT_FOUND',
        });
      }

      // Get user's prediction
      const prediction = await prisma.fightPrediction.findUnique({
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
      const fight = await prisma.fight.findUnique({
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
      const predictions = await prisma.fightPrediction.findMany({
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

      return reply.send({
        fightId,
        totalPredictions,
        averageHype: Math.round(averageHype * 10) / 10, // Round to 1 decimal
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
      });

    } catch (error) {
      console.error('Aggregate predictions fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}