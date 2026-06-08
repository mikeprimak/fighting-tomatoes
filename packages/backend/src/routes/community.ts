import { FastifyInstance } from 'fastify';
import { optionalAuthenticateMiddleware } from '../middleware/auth.fastify';
import { HIDDEN_PROMOTIONS } from '../config/hiddenPromotions';

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

      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const reviewInclude = {
        user: {
          select: { id: true, firstName: true, lastName: true, displayName: true },
        },
        fight: {
          include: {
            fighter1: { select: { id: true, firstName: true, lastName: true, nickname: true } },
            fighter2: { select: { id: true, firstName: true, lastName: true, nickname: true } },
            event: { select: { id: true, name: true, date: true } },
          },
        },
      } as const;

      // Daily rotation: comments cycle each day and never repeat two days in a
      // row (consecutive days draw from adjacent, non-overlapping chunks of the
      // top pool).
      const dayIndex = Math.floor(Date.now() / 86_400_000);
      const PAGE = 3;

      // Pool of recent top comments (past month, fallback to all-time).
      const RECENT_POOL = 12;
      let pool = await fastify.prisma.fightReview.findMany({
        where: { fight: { event: { date: { gte: oneMonthAgo } } } },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        take: RECENT_POOL,
        include: reviewInclude,
      });
      if (pool.length === 0) {
        pool = await fastify.prisma.fightReview.findMany({
          orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
          take: RECENT_POOL,
          include: reviewInclude,
        });
      }

      let topReviews: typeof pool;
      if (pool.length <= PAGE) {
        topReviews = pool; // too few to rotate
      } else {
        const chunks = Math.floor(pool.length / PAGE);
        const start = (dayIndex % chunks) * PAGE;
        topReviews = pool.slice(start, start + PAGE);
      }

      // Classic throwback — rotate daily through the top comments on fights from
      // over a year ago.
      const throwbackPool = await fastify.prisma.fightReview.findMany({
        where: { fight: { event: { date: { lt: oneYearAgo } } } },
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        include: reviewInclude,
      });
      const throwbackReview = throwbackPool.length > 0
        ? throwbackPool[dayIndex % throwbackPool.length]
        : null;

      // Check which reviews the user has upvoted (if authenticated)
      const reviewIds = [
        ...topReviews.map((r: any) => r.id),
        ...(throwbackReview ? [throwbackReview.id] : []),
      ];

      const userUpvotes = userId ? await fastify.prisma.reviewVote.findMany({
        where: {
          userId,
          reviewId: { in: reviewIds },
        },
        select: { reviewId: true },
      }) : [];

      const upvotedReviewIds = new Set(userUpvotes.map((u: any) => u.reviewId));

      const toComment = (review: any) => ({
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
      });

      return reply.send({
        data: topReviews.map(toComment),
        throwback: throwbackReview ? toComment(throwbackReview) : null,
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
      const userId = request.user?.id;
      const { period = 'week' } = request.query as { period?: string };
      console.log('[Top Upcoming Fights] userId:', userId, 'period:', period);

      // "Most Hyped" must only ever show genuinely hyped fights. A fight needs
      // at least this aggregate hype to qualify — zero-hype fights never leak in.
      const MIN_AGGREGATE_HYPE = 7;
      // Require a minimum number of hype predictions so a single early vote
      // can't crown a fight — the average must be backed by >= this many hypes.
      const MIN_HYPE_COUNT = 3;
      const DESIRED_COUNT = 10;

      // Calculate the initial forward-looking window based on period.
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const windowEnd = (days: number) => {
        const d = new Date(startOfToday);
        d.setDate(d.getDate() + days);
        return d;
      };

      let initialDays: number;
      switch (period) {
        case 'month':
          initialDays = 31;
          break;
        case '3months':
          initialDays = 92;
          break;
        case 'week':
        default:
          initialDays = 6;
          break;
      }

      // Score every UPCOMING fight up to `endDate`, returning fights sorted by
      // hype with the >= MIN_AGGREGATE_HYPE floor applied (zero-hype excluded).
      const fetchScored = async (endDate: Date) => {
        const fights = await fastify.prisma.fight.findMany({
          where: {
            event: {
              date: {
                gte: startOfToday,
                lte: endDate,
              },
            },
            fightStatus: 'UPCOMING',
          },
          include: {
            fighter1: true,
            fighter2: true,
            event: true,
            _count: {
              select: {
                preFightComments: true,
              },
            },
            predictions: userId ? {
              where: {
                OR: [
                  { userId },
                  { predictedRating: { not: null } }
                ]
              },
              select: {
                predictedRating: true,
                userId: true,
              },
            } : {
              where: {
                predictedRating: {
                  not: null,
                },
              },
              select: {
                predictedRating: true,
              },
            },
            ...(userId ? {
              preFightComments: {
                where: { userId },
                select: { id: true },
              },
            } : {}),
          },
        });

        // Get user's fighter follows if authenticated
        let followedFighters: any[] = [];
        if (userId) {
          const allFighterIds = fights.flatMap((f: any) => [f.fighter1Id, f.fighter2Id]);
          const uniqueFighterIds = [...new Set(allFighterIds)];

          followedFighters = await fastify.prisma.userFighterFollow.findMany({
            where: {
              userId,
              fighterId: { in: uniqueFighterIds },
            },
            select: {
              fighterId: true,
            },
          });
        }

        const followedFighterIds = new Set(followedFighters.map(ff => ff.fighterId));

        // Calculate average hype for each fight, apply the floor, sort.
        return fights
          .map((fight: any) => {
            const allHypes = fight.predictions
              .filter((p: any) => p.predictedRating != null)
              .map((p: any) => p.predictedRating);
            const averageHype = allHypes.length > 0
              ? allHypes.reduce((sum: number, h: number) => sum + h, 0) / allHypes.length
              : 0;

            const userPrediction = userId
              ? fight.predictions.find((p: any) => p.userId === userId)
              : null;
            const userHypePrediction = userPrediction?.predictedRating || null;

            const transformed: any = {
              ...fight,
              predictions: undefined,
              preFightComments: undefined,
              _count: undefined,
              averageHype,
              userHypePrediction,
              hypeCount: allHypes.length,
              commentCount: fight._count?.preFightComments || 0,
              ...(userId && fight.preFightComments ? { userCommentCount: fight.preFightComments.length } : {}),
            };

            if (userId) {
              transformed.isFollowingFighter1 = followedFighterIds.has(fight.fighter1Id) || undefined;
              transformed.isFollowingFighter2 = followedFighterIds.has(fight.fighter2Id) || undefined;
            }

            return transformed;
          })
          .filter((f: any) => f.averageHype >= MIN_AGGREGATE_HYPE && f.hypeCount >= MIN_HYPE_COUNT);
      };

      // Time bands (days from today). The section fills from the nearest band
      // first: any >= 7-hype fights in the next 6 days lead (sorted by hype),
      // then the 7-13 day band fills remaining spots (sorted by hype), and so
      // on. A far-off high-hype fight never jumps ahead of a sooner one.
      const bands = [...new Set([initialDays, 13, 20, 26, 61])].sort((a, b) => a - b);
      const maxDays = bands[bands.length - 1];

      const scored = await fetchScored(windowEnd(maxDays));

      const dayOffset = (f: any) => {
        const t = new Date(f.event?.mainStartTime || f.event?.date).getTime();
        return Math.floor((t - startOfToday.getTime()) / 86400000);
      };
      const bandIndex = (f: any) => {
        const d = dayOffset(f);
        const i = bands.findIndex((b) => d <= b);
        return i === -1 ? bands.length : i;
      };

      const fightsWithHype = scored
        .sort((a: any, b: any) =>
          bandIndex(a) - bandIndex(b) ||
          b.averageHype - a.averageHype ||
          b.hypeCount - a.hypeCount
        )
        .slice(0, DESIRED_COUNT);

      console.log('[Top Upcoming Fights] Returning', fightsWithHype.length, 'hyped fights (>=', MIN_AGGREGATE_HYPE, ')');

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
      const userId = request.user?.id;
      const { period = 'week', promotions, page = '1', limit = '25' } = request.query as {
        period?: string;
        promotions?: string;
        page?: string;
        limit?: string;
      };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
      const skip = (pageNum - 1) * limitNum;

      // Parse promotions filter (comma-separated list)
      const promotionList = promotions ? promotions.split(',').map(p => p.trim()).filter(p => p) : null;

      // Determine if this is UFC-only filtering (higher engagement = higher thresholds)
      const isUfcOnly = promotionList?.length === 1 && promotionList[0].toUpperCase() === 'UFC';

      // Two-tier minimum rating thresholds:
      // UFC (high engagement): 3, 10, 15, 20, 25
      // Other orgs (lower engagement): 3, 5, 7, 10, 10
      const thresholds = isUfcOnly
        ? { week: 3, month: 10, '3months': 15, year: 20, all: 25 }
        : { week: 3, month: 5, '3months': 7, year: 10, all: 10 };

      // Calculate time range and minimum rating count based on period
      const now = new Date();
      const startDate = new Date();
      let minRatingCount = thresholds.week; // Default minimum

      switch (period) {
        case 'week':
          startDate.setDate(now.getDate() - 7);
          minRatingCount = thresholds.week;
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          minRatingCount = thresholds.month;
          break;
        case '3months':
          startDate.setMonth(now.getMonth() - 3);
          minRatingCount = thresholds['3months'];
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          minRatingCount = thresholds.year;
          break;
        case 'all':
          // Set to a very old date to get all fights
          startDate.setFullYear(2000, 0, 1);
          minRatingCount = thresholds.all;
          break;
        default:
          // Default to week if invalid period
          startDate.setDate(now.getDate() - 7);
          minRatingCount = thresholds.week;
      }

      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: startDate,
              lte: now,
            },
            NOT: HIDDEN_PROMOTIONS.map(p => ({
              promotion: { contains: p, mode: 'insensitive' as const },
            })),
            ...(promotionList && promotionList.length > 0 ? { promotion: { in: promotionList } } : {}),
          },
          fightStatus: 'COMPLETED',
          averageRating: {
            gt: 0,
          },
          totalRatings: {
            gte: minRatingCount,
          },
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          _count: {
            select: {
              reviews: true,
              preFightComments: true,
            },
          },
          ratings: userId ? {
            where: {
              userId,
            },
            select: {
              rating: true,
            },
          } : false,
        },
        orderBy: [
          { averageRating: 'desc' },
          { id: 'asc' },
        ],
        skip,
        take: limitNum,
      });

      // Get user's fighter follows if authenticated
      let followedFighters: any[] = [];
      if (userId) {
        // Get all unique fighter IDs from both corners
        const allFighterIds = fights.flatMap((f: any) => [f.fighter1Id, f.fighter2Id]);
        const uniqueFighterIds = [...new Set(allFighterIds)];

        followedFighters = await fastify.prisma.userFighterFollow.findMany({
          where: {
            userId,
            fighterId: { in: uniqueFighterIds },
          },
          select: {
            fighterId: true,
          },
        });
      }

      // Create Set for efficient lookup
      const followedFighterIds = new Set(followedFighters.map(ff => ff.fighterId));

      // Add user rating and notification data to each fight
      const fightsWithUserData = fights.map((fight: any) => {
        const userRating = userId && fight.ratings?.length > 0
          ? fight.ratings[0].rating
          : null;

        const transformed: any = {
          ...fight,
          ratings: undefined, // Remove from response
          userRating,
          reviewCount: fight._count?.reviews || 0,
          commentCount: fight._count?.preFightComments || 0,
        };

        // Add fighter follow data if user is authenticated
        if (userId) {
          transformed.isFollowingFighter1 = followedFighterIds.has(fight.fighter1Id);
          transformed.isFollowingFighter2 = followedFighterIds.has(fight.fighter2Id);
        }

        return transformed;
      });

      const hasMore = fights.length === limitNum;
      return reply.send({
        data: fightsWithUserData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          hasMore,
        },
      });
    } catch (error) {
      console.error('Error fetching top recent fights:', error);
      return reply.status(500).send({
        error: 'Failed to fetch top recent fights',
        code: 'FETCH_ERROR',
      });
    }
  });

  // "Recent Good Fights" home rail: the best fights from the last couple weeks,
  // grouped by event. A fight qualifies when its community rating is above 7 with
  // at least 3 ratings. We surface up to 3 events (ranked by their best fight) and
  // up to 3 fights per event. Returns a flat fight list (each carrying .event) so
  // the client groups it by event exactly like the Top Upcoming Fights section.
  fastify.get('/recent-good-fights', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const MIN_RATING = 7;       // strictly above 7
      const MIN_RATING_COUNT = 3; // at least 3 user ratings
      const WINDOW_DAYS = 14;     // "last couple weeks"
      const MAX_EVENTS = 3;
      const MAX_FIGHTS_PER_EVENT = 3;

      const now = new Date();
      const startDate = new Date();
      startDate.setDate(now.getDate() - WINDOW_DAYS);

      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: { gte: startDate, lte: now },
            NOT: HIDDEN_PROMOTIONS.map(p => ({
              promotion: { contains: p, mode: 'insensitive' as const },
            })),
          },
          fightStatus: 'COMPLETED',
          averageRating: { gt: MIN_RATING },
          totalRatings: { gte: MIN_RATING_COUNT },
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          _count: { select: { reviews: true } },
        },
        // Global rating-desc order: the first time we see an event is via its
        // highest-rated qualifying fight, so event order = best-fight order.
        orderBy: [
          { averageRating: 'desc' },
          { id: 'asc' },
        ],
      });

      const byEvent = new Map<string, { event: any; fights: any[] }>();
      const order: string[] = [];
      for (const f of fights) {
        let g = byEvent.get(f.eventId);
        if (!g) {
          g = { event: f.event, fights: [] };
          byEvent.set(f.eventId, g);
          order.push(f.eventId);
        }
        if (g.fights.length < MAX_FIGHTS_PER_EVENT) {
          g.fights.push({
            ...f,
            reviewCount: f._count?.reviews || 0,
            _count: undefined,
          });
        }
      }

      const data = order
        .slice(0, MAX_EVENTS)
        .flatMap(eid => byEvent.get(eid)!.fights);

      return reply.send({ data });
    } catch (error) {
      console.error('Error fetching recent good fights:', error);
      return reply.status(500).send({
        error: 'Failed to fetch recent good fights',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get classic fights: the highest-rated fights at least 3 years old that the
  // current user hasn't rated yet. A "watch this from the vault" recommendation
  // feed. Returns the same shape as top-recent-fights so CompletedFightCard can
  // render it directly.
  fastify.get('/classic-fights', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const userId = request.user?.id;
      const { limit = '10' } = request.query as { limit?: string };
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

      // "At least 3 years old" — event date on or before this cutoff.
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      // Enough ratings to be a genuine consensus classic, not a lone 10.
      const MIN_RATINGS = 5;

      // Pull a pool of the top-rated classics, then rotate which slice we show
      // by a UTC day seed so the recommendations change every day (cycling
      // through the pool) instead of always surfacing the same top fights.
      const POOL_SIZE = 120;

      const pool = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: { lte: threeYearsAgo },
            NOT: HIDDEN_PROMOTIONS.map(p => ({
              promotion: { contains: p, mode: 'insensitive' as const },
            })),
          },
          fightStatus: 'COMPLETED',
          averageRating: { gt: 0 },
          totalRatings: { gte: MIN_RATINGS },
          // Exclude fights the user has already rated.
          ...(userId ? { ratings: { none: { userId } } } : {}),
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          _count: {
            select: {
              reviews: true,
              preFightComments: true,
            },
          },
        },
        orderBy: [
          { averageRating: 'desc' },
          { totalRatings: 'desc' },
          { id: 'asc' },
        ],
        take: POOL_SIZE,
      });

      // Rotate the pool by today's window so each day shows a different page
      // (with wrap-around). Whole days since the UTC epoch = the seed.
      const daySeed = Math.floor(Date.now() / 86_400_000);
      const start = pool.length > 0 ? (daySeed * limitNum) % pool.length : 0;
      const rotated = [...pool.slice(start), ...pool.slice(0, start)];
      const fights = rotated.slice(0, limitNum);

      const data = fights.map((fight: any) => ({
        ...fight,
        reviewCount: fight._count?.reviews || 0,
        commentCount: fight._count?.preFightComments || 0,
        userRating: null, // by definition unrated by this user
      }));

      return reply.send({ data });
    } catch (error) {
      console.error('Error fetching classic fights:', error);
      return reply.status(500).send({
        error: 'Failed to fetch classic fights',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Highlighted fighter: a single AI-enriched fighter featured big on the web +
  // mobile home, with their top-rated fight. Surfaces *relevant stars* rather
  // than anyone enriched: the pool is fighters who fought in the last month or
  // are booked in the next two months, ranked by fan engagement (career rating
  // volume), then rotated by UTC day so the spotlight changes daily within that
  // star set. Falls back to the broader enriched pool if the relevance window is
  // thin. Returns { data: { fighter, topFight } } or { data: null }.
  const FIGHTER_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    nickname: true,
    wins: true,
    losses: true,
    draws: true,
    weightClass: true,
    profileImage: true,
    actionImage: true,
    aiProfile: true,
    aiProfileSummary: true,
  } as const;

  fastify.get('/highlighted-fighter', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (_request, reply) => {
    try {
      const now = new Date();
      const monthAgo = new Date(now);
      monthAgo.setDate(now.getDate() - 31);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const twoMonthsAhead = new Date(now);
      twoMonthsAhead.setDate(now.getDate() + 62);
      const hidden = HIDDEN_PROMOTIONS.map(p => ({
        promotion: { contains: p, mode: 'insensitive' as const },
      }));

      // Relevance window: fighters who fought in the last month (engagement-
      // ranked via most-rated completed fights) or are booked in the next two
      // months. Select only fighter ids — cheap; we hydrate the chosen one later.
      const [recentWindow, upcomingWindow] = await Promise.all([
        fastify.prisma.fight.findMany({
          where: {
            fightStatus: 'COMPLETED',
            totalRatings: { gte: 1 },
            event: { date: { gte: monthAgo, lte: now }, NOT: hidden },
          },
          select: { fighter1Id: true, fighter2Id: true },
          orderBy: { totalRatings: 'desc' },
          take: 100,
        }),
        fastify.prisma.fight.findMany({
          where: {
            fightStatus: { in: ['UPCOMING', 'LIVE'] },
            event: { date: { gte: startOfToday, lte: twoMonthsAhead }, NOT: hidden },
          },
          select: { fighter1Id: true, fighter2Id: true },
          take: 200,
        }),
      ]);

      // Recent fighters first (already engagement-ordered), then upcoming, then
      // cap — keeps the cost of the engagement aggregation below bounded while
      // retaining the most-rated recent names.
      const candidateIds = ([
        ...new Set(
          [...recentWindow, ...upcomingWindow].flatMap(f => [f.fighter1Id, f.fighter2Id]),
        ),
      ].filter(Boolean) as string[]).slice(0, 300);

      // Star ranking: career rating volume (sum of Fight.totalRatings per
      // fighter). Fighter.totalRatings is unreliable ("fields that lie"), so we
      // aggregate from the fights. Bounded by the candidate set above.
      const careerRatingCounts = async (ids: string[]) => {
        const idSet = new Set(ids);
        const fights = ids.length === 0 ? [] : await fastify.prisma.fight.findMany({
          where: { OR: [{ fighter1Id: { in: ids } }, { fighter2Id: { in: ids } }] },
          select: { fighter1Id: true, fighter2Id: true, totalRatings: true },
        });
        const counts = new Map<string, number>();
        for (const f of fights) {
          if (idSet.has(f.fighter1Id)) counts.set(f.fighter1Id, (counts.get(f.fighter1Id) || 0) + (f.totalRatings || 0));
          if (idSet.has(f.fighter2Id)) counts.set(f.fighter2Id, (counts.get(f.fighter2Id) || 0) + (f.totalRatings || 0));
        }
        return counts;
      };

      // The candidates that are actually featurable: a confident bio + a
      // portrait (the 0.5 gate mirrors the render-gate used elsewhere).
      let pool = candidateIds.length === 0 ? [] : await fastify.prisma.fighter.findMany({
        where: {
          id: { in: candidateIds },
          aiProfileSummary: { not: null },
          aiProfileConfidence: { gte: 0.5 },
          profileImage: { not: null },
        },
        select: FIGHTER_SELECT,
      });

      // Rank by engagement and keep the top tier — the "stars" — so the daily
      // rotation surfaces big names rather than anyone who happened to be booked.
      if (pool.length > 0) {
        const counts = await careerRatingCounts(pool.map((f: any) => f.id));
        pool = pool
          .sort((a: any, b: any) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))
          .slice(0, 40);
      }

      // Fallback: if nobody relevant is enriched yet, use the broader enriched
      // pool so the section still renders (legacy behaviour).
      if (pool.length === 0) {
        pool = await fastify.prisma.fighter.findMany({
          where: {
            aiProfileSummary: { not: null },
            aiProfileConfidence: { gte: 0.5 },
            profileImage: { not: null },
          },
          select: FIGHTER_SELECT,
          orderBy: { id: 'asc' },
          take: 300,
        });
      }

      if (pool.length === 0) {
        return reply.send({ data: null });
      }

      // Rotate the pool by the UTC day so the featured fighter changes daily
      // (with wrap-around) instead of always surfacing the same person.
      const daySeed = Math.floor(Date.now() / 86_400_000);
      const start = daySeed % pool.length;
      const rotated = [...pool.slice(start), ...pool.slice(0, start)];

      // Walk the rotated pool until we find a fighter with a top-rated fight to
      // feature. Bounded so a thin DB doesn't scan the whole pool every request.
      let chosen: any = null;
      let topFight: any = null;
      for (const fighter of rotated.slice(0, 25)) {
        const fight = await fastify.prisma.fight.findFirst({
          where: {
            OR: [{ fighter1Id: fighter.id }, { fighter2Id: fighter.id }],
            fightStatus: 'COMPLETED',
            averageRating: { gt: 0 },
            totalRatings: { gte: 3 },
            event: {
              NOT: HIDDEN_PROMOTIONS.map(p => ({
                promotion: { contains: p, mode: 'insensitive' as const },
              })),
            },
          },
          include: {
            fighter1: true,
            fighter2: true,
            event: true,
            _count: { select: { reviews: true, preFightComments: true } },
          },
          orderBy: [
            { averageRating: 'desc' },
            { totalRatings: 'desc' },
          ],
        });
        if (fight) {
          chosen = fighter;
          topFight = {
            ...fight,
            reviewCount: fight._count?.reviews || 0,
            commentCount: fight._count?.preFightComments || 0,
            userRating: null,
          };
          break;
        }
      }

      // Fall back to the first rotated candidate even without a rated fight, so
      // the section still has a fighter + bio to show.
      if (!chosen) {
        chosen = rotated[0];
        topFight = null;
      }

      // The featured fighter's next scheduled bout (if any), shown below their
      // top-rated fight so a fan can see what's coming up for them.
      const nextFightRaw = await fastify.prisma.fight.findFirst({
        where: {
          OR: [{ fighter1Id: chosen.id }, { fighter2Id: chosen.id }],
          fightStatus: { in: ['UPCOMING', 'LIVE'] },
          event: {
            date: { gte: startOfToday },
            NOT: HIDDEN_PROMOTIONS.map(p => ({
              promotion: { contains: p, mode: 'insensitive' as const },
            })),
          },
        },
        include: { fighter1: true, fighter2: true, event: true },
        orderBy: [{ event: { date: 'asc' } }],
      });
      const nextFight = nextFightRaw
        ? { ...nextFightRaw, userHypePrediction: null }
        : null;

      return reply.send({ data: { fighter: chosen, topFight, nextFight } });
    } catch (error) {
      console.error('Error fetching highlighted fighter:', error);
      return reply.status(500).send({
        error: 'Failed to fetch highlighted fighter',
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
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(now.getDate() + 20);

      // Get all upcoming fights with predictions
      // Use startOfToday (not current time) to include fights happening later today
      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: startOfToday,
              lte: twentyDaysFromNow,
            },
          },
          fightStatus: 'UPCOMING',
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
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const twentyDaysFromNow = new Date();
      twentyDaysFromNow.setDate(now.getDate() + 20);

      // Get all upcoming fights with predictions
      // Use startOfToday (not current time) to include fights happening later today
      const fights = await fastify.prisma.fight.findMany({
        where: {
          event: {
            date: {
              gte: startOfToday,
              lte: twentyDaysFromNow,
            },
          },
          fightStatus: 'UPCOMING',
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

  // Get all pre-fight comments with sorting options
  fastify.get('/pre-fight-comments', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const userId = request.user?.id;
      const { sortBy = 'top-recent' } = request.query as { sortBy?: string };
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Use startOfToday (not current time) to include fights happening later today
      let whereClause: any = {
        fight: {
          event: {
            date: { gte: startOfToday },
          },
          fightStatus: 'UPCOMING',
        },
      };
      let orderByClause: any[] = [];

      if (sortBy === 'top-recent') {
        // Top upvoted from next 13 days
        const thirteenDaysFromNow = new Date();
        thirteenDaysFromNow.setDate(now.getDate() + 13);
        whereClause.fight.event.date.lte = thirteenDaysFromNow;
        orderByClause = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
      } else if (sortBy === 'top-all-time') {
        // Top upvoted from all upcoming fights
        orderByClause = [{ upvotes: 'desc' }, { createdAt: 'desc' }];
      } else if (sortBy === 'new') {
        // Newest first
        orderByClause = [{ createdAt: 'desc' }];
      }

      const preFightComments = await fastify.prisma.preFightComment.findMany({
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
              predictions: userId ? {
                where: {
                  userId,
                },
                select: {
                  predictedRating: true,
                },
              } : false,
            },
          },
        },
      });

      // Check which comments the user has upvoted (if authenticated)
      const commentIds = preFightComments.map((c: any) => c.id);

      const userUpvotes = userId ? await fastify.prisma.preFightCommentVote.findMany({
        where: {
          userId,
          commentId: { in: commentIds },
        },
        select: { commentId: true },
      }) : [];

      const upvotedCommentIds = new Set(userUpvotes.map((u: any) => u.commentId));

      return reply.send({
        data: preFightComments.map((comment: any) => ({
          id: comment.id,
          content: comment.content,
          upvotes: comment.upvotes,
          createdAt: comment.createdAt,
          userHasUpvoted: upvotedCommentIds.has(comment.id),
          hypeRating: userId && comment.fight.predictions?.length > 0
            ? comment.fight.predictions[0].predictedRating
            : null,
          user: {
            id: comment.user.id,
            displayName: comment.user.displayName || `${comment.user.firstName} ${comment.user.lastName}`,
          },
          fight: {
            id: comment.fight.id,
            fighter1Name: `${comment.fight.fighter1.firstName} ${comment.fight.fighter1.lastName}`,
            fighter2Name: `${comment.fight.fighter2.firstName} ${comment.fight.fighter2.lastName}`,
            eventName: comment.fight.event.name,
            eventDate: comment.fight.event.date,
          },
        })),
      });
    } catch (error) {
      console.error('Error fetching pre-fight comments:', error);
      return reply.status(500).send({
        error: 'Failed to fetch pre-fight comments',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Get top pre-fight comments (most upvoted from fights happening within next 13 days)
  fastify.get('/top-pre-fight-comments', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const userId = request.user?.id;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thirteenDaysFromNow = new Date();
      thirteenDaysFromNow.setDate(now.getDate() + 13);

      // Get top 3 upvoted pre-fight comments from upcoming fights within next 13 days
      // Use startOfToday (not current time) to include fights happening later today
      const topPreFightComments = await fastify.prisma.preFightComment.findMany({
        where: {
          fight: {
            event: {
              date: {
                gte: startOfToday,
                lte: thirteenDaysFromNow,
              },
            },
            fightStatus: 'UPCOMING',
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
              predictions: userId ? {
                where: {
                  userId,
                },
                select: {
                  predictedRating: true,
                },
              } : false,
            },
          },
        },
      });

      // Check which comments the user has upvoted (if authenticated)
      const commentIds = topPreFightComments.map((c: any) => c.id);

      const userUpvotes = userId ? await fastify.prisma.preFightCommentVote.findMany({
        where: {
          userId,
          commentId: { in: commentIds },
        },
        select: { commentId: true },
      }) : [];

      const upvotedCommentIds = new Set(userUpvotes.map((u: any) => u.commentId));

      return reply.send({
        data: topPreFightComments.map((comment: any) => ({
          id: comment.id,
          content: comment.content,
          upvotes: comment.upvotes,
          createdAt: comment.createdAt,
          userHasUpvoted: upvotedCommentIds.has(comment.id),
          hypeRating: userId && comment.fight.predictions?.length > 0
            ? comment.fight.predictions[0].predictedRating
            : null,
          user: {
            id: comment.user.id,
            displayName: comment.user.displayName || `${comment.user.firstName} ${comment.user.lastName}`,
          },
          fight: {
            id: comment.fight.id,
            fighter1Name: `${comment.fight.fighter1.firstName} ${comment.fight.fighter1.lastName}`,
            fighter2Name: `${comment.fight.fighter2.firstName} ${comment.fight.fighter2.lastName}`,
            eventName: comment.fight.event.name,
            eventDate: comment.fight.event.date,
          },
        })),
      });
    } catch (error) {
      console.error('Error fetching top pre-fight comments:', error);
      return reply.status(500).send({
        error: 'Failed to fetch top pre-fight comments',
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
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(now.getDate() - 60);
      const sixtyDaysFromNow = new Date();
      sixtyDaysFromNow.setDate(now.getDate() + 60);
      // Use startOfToday (not current time) to include fights happening later today
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Helper: a fighter's recent-form average (their last 3 rated fights).
      const lastThreeAvg = async (fighterId: string) => {
        const fighterFights = await fastify.prisma.fight.findMany({
          where: {
            OR: [{ fighter1Id: fighterId }, { fighter2Id: fighterId }],
            fightStatus: 'COMPLETED',
            averageRating: { gt: 0 },
          },
          orderBy: { event: { date: 'desc' } },
          take: 3,
          include: { event: true },
        });
        const avgRating = fighterFights.length > 0
          ? fighterFights.reduce((sum: number, f: any) => sum + (f.averageRating || 0), 0) / fighterFights.length
          : 0;
        return { avgRating, fightCount: fighterFights.length, lastFightDate: fighterFights[0]?.event.date ?? null };
      };

      // Helper: career rating volume per fighter (sum of Fight.totalRatings).
      // Fighter.totalRatings is unreliable ("fields that lie"), so we aggregate.
      // Used to pick the "star" of a fight when there's no decisive winner.
      const careerRatingCounts = async (ids: string[]) => {
        const idSet = new Set(ids);
        const fights = ids.length === 0 ? [] : await fastify.prisma.fight.findMany({
          where: { OR: [{ fighter1Id: { in: ids } }, { fighter2Id: { in: ids } }] },
          select: { fighter1Id: true, fighter2Id: true, totalRatings: true },
        });
        const counts = new Map<string, number>();
        for (const f of fights) {
          if (idSet.has(f.fighter1Id)) counts.set(f.fighter1Id, (counts.get(f.fighter1Id) || 0) + (f.totalRatings || 0));
          if (idSet.has(f.fighter2Id)) counts.set(f.fighter2Id, (counts.get(f.fighter2Id) || 0) + (f.totalRatings || 0));
        }
        return counts;
      };

      // Pick the single "star" of a fight: the winner is the breakout (a fan
      // searching the card remembers who won). When there's no decisive winner
      // (draw / no-contest / not yet fought), fall back to whoever carries more
      // career ratings. Returns [star, opponent].
      const pickStar = (fight: any, counts: Map<string, number>) => {
        const f1 = fight.fighter1, f2 = fight.fighter2;
        if (fight.winner === f1.id) return [f1, f2];
        if (fight.winner === f2.id) return [f2, f1];
        const c1 = counts.get(f1.id) || 0;
        const c2 = counts.get(f2.id) || 0;
        return c1 >= c2 ? [f1, f2] : [f2, f1];
      };

      // RECENT (past 2 months): fighters who fought and got highly rated.
      // Pull the highest-rated completed fights in the window, then take their
      // fighters in rating order.
      const recentFights = await fastify.prisma.fight.findMany({
        where: {
          event: { date: { gte: sixtyDaysAgo, lte: now } },
          fightStatus: 'COMPLETED',
          averageRating: { gt: 0 },
          totalRatings: { gte: 3 },
        },
        include: { fighter1: true, fighter2: true, event: true },
        orderBy: [{ averageRating: 'desc' }, { totalRatings: 'desc' }],
        take: 40,
      });

      const recentCounts = await careerRatingCounts(
        [...new Set(recentFights.flatMap((f: any) => [f.fighter1Id, f.fighter2Id]))] as string[]
      );

      // One fighter per fight — the star (winner) — never both sides of the bout.
      const recentFighterStats = new Map();
      for (const fight of recentFights) {
        const [star, opponent] = pickStar(fight, recentCounts);
        if (recentFighterStats.has(star.id)) continue;
        const form = await lastThreeAvg(star.id);
        recentFighterStats.set(star.id, {
          fighter: star,
          // Fall back to the triggering fight's rating if no prior rated history.
          avgRating: form.fightCount > 0 ? form.avgRating : (fight.averageRating || 0),
          fightCount: form.fightCount,
          // The rated fight that earned them a spot (what the UI describes).
          lastFightDate: fight.event.date,
          opponentName: `${opponent.firstName} ${opponent.lastName}`,
          rating: fight.averageRating || 0,
        });
        if (recentFighterStats.size >= 6) break;
      }

      // UPCOMING (next 2 months): fighters in the most-hyped upcoming fights.
      const upcomingFights = await fastify.prisma.fight.findMany({
        where: {
          event: { date: { gte: startOfToday, lte: sixtyDaysFromNow } },
          fightStatus: 'UPCOMING',
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: true,
          predictions: {
            where: { predictedRating: { not: null } },
            select: { predictedRating: true },
          },
        },
      });

      // Rank upcoming fights by average hype (fall back to soonest when no hype yet).
      const upcomingByHype = upcomingFights
        .map((fight: any) => {
          const hypes = fight.predictions
            .map((p: any) => p.predictedRating)
            .filter((r: any): r is number => r != null);
          const averageHype = hypes.length > 0
            ? hypes.reduce((sum: number, h: number) => sum + h, 0) / hypes.length
            : 0;
          return { fight, averageHype };
        })
        .sort((a: any, b: any) =>
          b.averageHype - a.averageHype ||
          new Date(a.fight.event.date).getTime() - new Date(b.fight.event.date).getTime()
        );

      const upcomingCounts = await careerRatingCounts(
        [...new Set(upcomingFights.flatMap((f: any) => [f.fighter1Id, f.fighter2Id]))] as string[]
      );

      // One fighter per fight — no winner yet, so the bigger draw (more career
      // ratings) represents the bout.
      const upcomingFighterStats = new Map();
      for (const { fight, averageHype } of upcomingByHype) {
        const [star, opponent] = pickStar(fight, upcomingCounts);
        if (upcomingFighterStats.has(star.id) || recentFighterStats.has(star.id)) continue;
        const form = await lastThreeAvg(star.id);
        upcomingFighterStats.set(star.id, {
          fighter: star,
          avgRating: form.avgRating,
          fightCount: form.fightCount,
          nextFightDate: fight.event.date,
          hype: averageHype,
          opponentName: `${opponent.firstName} ${opponent.lastName}`,
        });
        if (upcomingFighterStats.size >= 6) break;
      }

      return reply.send({
        data: {
          recent: Array.from(recentFighterStats.values()).slice(0, 6),
          upcoming: Array.from(upcomingFighterStats.values()).slice(0, 6),
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

  // Get fighters most-followed across the platform (for discovery)
  fastify.get('/top-followed-fighters', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const userId = (request as any).user?.id as string | undefined;
      const limit = Math.min(Number((request.query as any)?.limit) || 20, 50);
      // Optional pagination for the "all most-followed" infinite-scroll screen.
      // Page is 1-based; when omitted this stays a simple top-N (page 1).
      const page = Math.max(Number((request.query as any)?.page) || 1, 1);
      const skip = (page - 1) * limit;

      // Aggregate follow counts grouped by fighterId. Fetch one extra row to know
      // whether another page exists without a second count query.
      const grouped = await fastify.prisma.userFighterFollow.groupBy({
        by: ['fighterId'],
        _count: { fighterId: true },
        orderBy: { _count: { fighterId: 'desc' } },
        skip,
        take: limit + 1,
      });

      const hasMore = grouped.length > limit;
      if (hasMore) grouped.pop();

      const fighterIds = grouped.map((g) => g.fighterId);

      // Fetch fighter records in one query
      const fighters = fighterIds.length === 0
        ? []
        : await fastify.prisma.fighter.findMany({
            where: { id: { in: fighterIds } },
          });
      const fighterMap = new Map(fighters.map((f) => [f.id, f]));

      // Determine which of these the requesting user already follows
      let followedSet = new Set<string>();
      if (userId && fighterIds.length > 0) {
        const userFollows = await fastify.prisma.userFighterFollow.findMany({
          where: { userId, fighterId: { in: fighterIds } },
          select: { fighterId: true },
        });
        followedSet = new Set(userFollows.map((f) => f.fighterId));
      }

      const data = grouped
        .map((g) => {
          const fighter = fighterMap.get(g.fighterId);
          if (!fighter) return null;
          return {
            fighter,
            followerCount: g._count.fighterId,
            isFollowing: followedSet.has(g.fighterId),
          };
        })
        .filter((x): x is { fighter: any; followerCount: number; isFollowing: boolean } => x !== null);

      return reply.send({ data, pagination: { page, limit, hasMore } });
    } catch (error) {
      console.error('Error fetching top-followed fighters:', error);
      return reply.status(500).send({
        error: 'Failed to fetch top-followed fighters',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Recently booked VIP fighters — notable fighters (100+ user ratings across
  // their fights) added to an upcoming card within the past 2 weeks. Surfaces
  // newsworthy bookings on the Home feed.
  fastify.get('/recently-booked-fighters', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const VIP_MIN_RATINGS = 100;
      const now = new Date();
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(now.getDate() - 14);

      // Fights whose row was created (booked) in the last 2 weeks and that are
      // still on an upcoming card.
      const recentlyBooked = await fastify.prisma.fight.findMany({
        where: {
          createdAt: { gte: twoWeeksAgo },
          fightStatus: 'UPCOMING',
          event: { date: { gte: now } },
        },
        include: {
          fighter1: true,
          fighter2: true,
          event: { select: { id: true, name: true, date: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentlyBooked.length === 0) {
        return reply.send({ data: [] });
      }

      const fighterIds = [...new Set(
        recentlyBooked.flatMap((f: any) => [f.fighter1Id, f.fighter2Id])
      )] as string[];
      const fighterIdSet = new Set(fighterIds);

      // Real rating counts. Fighter.totalRatings is unreliable ("fields that lie"),
      // so sum the maintained Fight.totalRatings across each fighter's fights.
      const candidateFights = await fastify.prisma.fight.findMany({
        where: {
          OR: [
            { fighter1Id: { in: fighterIds } },
            { fighter2Id: { in: fighterIds } },
          ],
        },
        select: { fighter1Id: true, fighter2Id: true, totalRatings: true },
      });
      const ratingCount = new Map<string, number>();
      for (const f of candidateFights) {
        if (fighterIdSet.has(f.fighter1Id)) {
          ratingCount.set(f.fighter1Id, (ratingCount.get(f.fighter1Id) || 0) + (f.totalRatings || 0));
        }
        if (fighterIdSet.has(f.fighter2Id)) {
          ratingCount.set(f.fighter2Id, (ratingCount.get(f.fighter2Id) || 0) + (f.totalRatings || 0));
        }
      }

      // One entry per BOOKING — show only the more notable (higher-rated) VIP
      // fighter, never both sides of the same fight (e.g. don't list both
      // "Conor vs Max" and "Max vs Conor"). Also dedup a fighter across multiple
      // bookings (we iterate createdAt desc, so the first/most-recent wins).
      const seen = new Set<string>();
      const data: any[] = [];
      for (const fight of recentlyBooked) {
        const sides = [fight.fighter1, fight.fighter2]
          .map((fighter: any) => ({ fighter, ratings: ratingCount.get(fighter.id) || 0 }))
          .filter((s: any) => s.ratings >= VIP_MIN_RATINGS && !seen.has(s.fighter.id))
          .sort((a: any, b: any) => b.ratings - a.ratings);
        const top = sides[0];
        if (!top) continue;
        seen.add(top.fighter.id);
        const opponent = top.fighter.id === fight.fighter1.id ? fight.fighter2 : fight.fighter1;
        data.push({
          fighter: top.fighter,
          ratingCount: top.ratings,
          bookedAt: fight.createdAt,
          event: fight.event,
          nextFightDate: fight.event.date,
          opponentName: `${opponent.firstName} ${opponent.lastName}`,
        });
      }

      // Most notable first.
      data.sort((a, b) => b.ratingCount - a.ratingCount);

      return reply.send({ data: data.slice(0, 10) });
    } catch (error) {
      console.error('Error fetching recently booked fighters:', error);
      return reply.status(500).send({
        error: 'Failed to fetch recently booked fighters',
        code: 'FETCH_ERROR',
      });
    }
  });

  // GET /api/fighters/recommended — sidebar "Fighters you might like".
  // Personalized when authed: weight-class match against fighters the user
  // follows or has rated highly. Cold-start (anon, or no signal yet) returns
  // top-followed across the platform with a generic reason.
  fastify.get('/fighters/recommended', {
    preHandler: optionalAuthenticateMiddleware,
  }, async (request, reply) => {
    try {
      const userId = (request as any).user?.id as string | undefined;
      const limit = Math.min(Number((request.query as any)?.limit) || 8, 20);

      const coldStart = async (excludeFollowedFor?: string) => {
        const grouped = await fastify.prisma.userFighterFollow.groupBy({
          by: ['fighterId'],
          _count: { fighterId: true },
          orderBy: { _count: { fighterId: 'desc' } },
          take: limit * 2,
        });
        const ids = grouped.map((g) => g.fighterId);
        if (ids.length === 0) return [];
        let alreadyFollowed = new Set<string>();
        if (excludeFollowedFor) {
          const f = await fastify.prisma.userFighterFollow.findMany({
            where: { userId: excludeFollowedFor, fighterId: { in: ids } },
            select: { fighterId: true },
          });
          alreadyFollowed = new Set(f.map((x) => x.fighterId));
        }
        const fighters = await fastify.prisma.fighter.findMany({
          where: { id: { in: ids } },
        });
        const fighterMap = new Map(fighters.map((f) => [f.id, f]));
        return grouped
          .filter((g) => !alreadyFollowed.has(g.fighterId))
          .map((g) => ({ fighter: fighterMap.get(g.fighterId), reason: 'Popular on Good Fights' }))
          .filter((x): x is { fighter: any; reason: string } => !!x.fighter)
          .slice(0, limit);
      };

      if (!userId) {
        return reply.send({ fighters: await coldStart() });
      }

      const [follows, highRatedFights] = await Promise.all([
        fastify.prisma.userFighterFollow.findMany({
          where: { userId },
          select: { fighterId: true },
        }),
        fastify.prisma.fightRating.findMany({
          where: { userId, rating: { gte: 8 } },
          select: { fight: { select: { fighter1Id: true, fighter2Id: true } } },
          take: 500,
        }),
      ]);

      const followedIds = new Set(follows.map((f) => f.fighterId));
      const affinityIds = new Set<string>(followedIds);
      for (const r of highRatedFights) {
        if (r.fight.fighter1Id) affinityIds.add(r.fight.fighter1Id);
        if (r.fight.fighter2Id) affinityIds.add(r.fight.fighter2Id);
      }

      if (affinityIds.size === 0) {
        return reply.send({ fighters: await coldStart(userId) });
      }

      const affinityFighters = await fastify.prisma.fighter.findMany({
        where: { id: { in: [...affinityIds] } },
        select: { id: true, firstName: true, lastName: true, weightClass: true },
      });

      // For each weight class in the affinity pool, pick a representative
      // namesake — prefer a followed fighter over a merely-highly-rated one.
      const weightClassNamesake = new Map<string, string>();
      for (const f of affinityFighters) {
        if (!f.weightClass) continue;
        if (followedIds.has(f.id) && !weightClassNamesake.has(f.weightClass)) {
          weightClassNamesake.set(f.weightClass, f.lastName || f.firstName);
        }
      }
      for (const f of affinityFighters) {
        if (!f.weightClass) continue;
        if (!weightClassNamesake.has(f.weightClass)) {
          weightClassNamesake.set(f.weightClass, f.lastName || f.firstName);
        }
      }
      const weightClasses = [...weightClassNamesake.keys()] as any[];

      if (weightClasses.length === 0) {
        return reply.send({ fighters: await coldStart(userId) });
      }

      const candidates = await fastify.prisma.fighter.findMany({
        where: {
          id: { notIn: [...affinityIds] },
          weightClass: { in: weightClasses },
          isActive: true,
          totalFights: { gt: 0 },
        },
        orderBy: [
          { greatFights: 'desc' },
          { averageRating: 'desc' },
          { totalRatings: 'desc' },
        ],
        take: limit,
      });

      const fighters = candidates.map((c) => {
        const namesake = c.weightClass ? weightClassNamesake.get(c.weightClass) : undefined;
        const reason = namesake ? `Same weight as ${namesake}` : 'Highly rated fighter';
        return { fighter: c, reason };
      });

      // If personalization yielded too few, top up from cold start.
      if (fighters.length < limit) {
        const need = limit - fighters.length;
        const fillerAll = await coldStart(userId);
        const existingIds = new Set(fighters.map((f) => f.fighter.id));
        const filler = fillerAll.filter((f) => !existingIds.has(f.fighter.id)).slice(0, need);
        fighters.push(...filler);
      }

      return reply.send({ fighters });
    } catch (error) {
      console.error('Error fetching recommended fighters:', error);
      return reply.status(500).send({
        error: 'Failed to fetch recommended fighters',
        code: 'FETCH_ERROR',
      });
    }
  });
}

