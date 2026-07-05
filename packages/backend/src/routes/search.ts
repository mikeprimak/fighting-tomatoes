import { prisma } from '../lib/prisma';
import { FastifyInstance } from 'fastify';
import { optionalAuth } from '../middleware/auth';
import { notificationRuleEngine } from '../services/notificationRuleEngine';
import { getHiddenPromotions } from '../config/hiddenPromotions';

/**
 * Search routes - unified search across fighters, fights, events, and promotions
 */

interface QueryContext {
  searchTerm: string;
  searchLower: string;
  searchTerms: string[];
  searchTermsLower: string[];
}

const buildQueryContext = (raw: string): QueryContext => {
  const searchTerm = raw.trim();
  const searchTerms = searchTerm.split(/\s+/).filter((t) => t.length > 0);
  return {
    searchTerm,
    searchLower: searchTerm.toLowerCase(),
    searchTerms,
    searchTermsLower: searchTerms.map((t) => t.toLowerCase()),
  };
};

// Fighters matching: OR over name fields for the full term, plus per-word
// conditions and first/last combinations for multi-word queries.
const buildFighterSearchConditions = (ctx: QueryContext): any => {
  const { searchTerm, searchTerms } = ctx;
  const baseConditions: any[] = [
    { firstName: { contains: searchTerm, mode: 'insensitive' as const } },
    { lastName: { contains: searchTerm, mode: 'insensitive' as const } },
    { nickname: { contains: searchTerm, mode: 'insensitive' as const } },
  ];

  if (searchTerms.length > 1) {
    for (const term of searchTerms) {
      baseConditions.push(
        { firstName: { contains: term, mode: 'insensitive' as const } },
        { lastName: { contains: term, mode: 'insensitive' as const } },
        { nickname: { contains: term, mode: 'insensitive' as const } }
      );
    }

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

// Score how well a fighter's name matches the query. Exact name match must
// outrank champion/recency, so a search for the fighter's name surfaces them
// at the top even if they're retired.
const getFighterRelevanceScore = (
  ctx: QueryContext,
  f: { firstName: string | null; lastName: string | null; nickname: string | null }
): number => {
  const { searchLower, searchTermsLower } = ctx;
  const first = (f.firstName || '').toLowerCase();
  const last = (f.lastName || '').toLowerCase();
  const nick = (f.nickname || '').toLowerCase();
  const full = `${first} ${last}`.trim();

  if (full === searchLower) return 1000;

  if (searchTermsLower.length >= 2) {
    const [s1, s2] = searchTermsLower;
    if (first === s1 && last === s2) return 1000;
    if (first === s2 && last === s1) return 950;
    // Query is a prefix of the full name mid-typing (e.g. "rose nam" →
    // Rose Namajunas) — must outrank a bare exact-lastName match on the
    // last word (e.g. Tyson Nam).
    if (full.startsWith(searchLower)) return 920;
    const lastTerm = searchTermsLower[searchTermsLower.length - 1];
    if (last === lastTerm) {
      // Multi-word query where the last word is an exact lastName match
      // (e.g. "conor mcgregor" → McGregor). Also reward matching first name.
      return first === searchTermsLower[0] ? 900 : 700;
    }
  }

  // Exact match on any single name part is one tier — the prominence
  // tie-break (champion, fight count) decides between e.g. an obscure
  // "John Conor" and Conor McGregor for the query "conor".
  if (last === searchLower || nick === searchLower || first === searchLower) return 750;

  if (last.startsWith(searchLower)) return 500;
  if (nick.startsWith(searchLower)) return 450;
  if (first.startsWith(searchLower)) return 400;

  if (full.includes(searchLower)) return 250;
  if (nick.includes(searchLower)) return 200;

  // Per-word partial scoring for everything else
  let score = 0;
  for (const t of searchTermsLower) {
    if (last === t) score += 100;
    else if (first === t) score += 80;
    else if (nick === t) score += 80;
    else if (last.startsWith(t)) score += 50;
    else if (first.startsWith(t)) score += 40;
    else if (last.includes(t) || first.includes(t) || nick.includes(t)) score += 20;
  }
  return score;
};

const buildEventSearchConditions = (ctx: QueryContext) => {
  const { searchTerm, searchTerms } = ctx;
  const conditions: any[] = [
    { name: { contains: searchTerm, mode: 'insensitive' as const } },
    { promotion: { contains: searchTerm, mode: 'insensitive' as const } },
  ];

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

// Score how well an event matches the query (name primary, promotion secondary).
const getEventRelevanceScore = (
  ctx: QueryContext,
  name: string,
  promotion?: string | null
): number => {
  const { searchLower, searchTerms } = ctx;
  const nameLower = name.toLowerCase();
  const promoLower = (promotion || '').toLowerCase();

  if (nameLower === searchLower) return 1000;
  if (nameLower.startsWith(searchLower)) return 500;
  if (nameLower.includes(searchLower)) return 300;
  if (promoLower === searchLower) return 300;
  if (promoLower.includes(searchLower)) return 150;

  const matchedWords = searchTerms.filter((term) =>
    nameLower.includes(term.toLowerCase())
  ).length;

  return matchedWords * 50;
};

// Tie-break equally-relevant fighters by prominence: champion first, then by
// fight count. totalFights can be stale/zero for non-UFC fighters, so fall
// back to career bouts from the record.
const compareFighterProminence = (
  a: { isChampion: boolean; totalFights: number | null; wins?: number; losses?: number; draws?: number },
  b: { isChampion: boolean; totalFights: number | null; wins?: number; losses?: number; draws?: number }
): number => {
  if (a.isChampion !== b.isChampion) return a.isChampion ? -1 : 1;
  const bouts = (f: typeof a) =>
    Math.max(f.totalFights || 0, (f.wins || 0) + (f.losses || 0) + (f.draws || 0));
  return bouts(b) - bouts(a);
};

const hiddenPromotionsFilter = () =>
  getHiddenPromotions().map((p) => ({
    promotion: { contains: p, mode: 'insensitive' as const },
  }));

// Upcoming/live first (0), completed next (1), cancelled last (2)
const fightStatusRank = (status: string): number => {
  if (status === 'CANCELLED') return 2;
  if (status === 'COMPLETED') return 1;
  return 0;
};

export default async function searchRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/search
   * Search across fighters, fights, events, and promotions
   * Query params:
   *   - q: search query (required, min 2 chars)
   *   - limit: max results per category (default 10, max 50)
   *
   * Intent-aware behavior:
   *   - Fights are ranked by how well their fighters/event match the query,
   *     upcoming before completed, so a fighter search puts their next fight first.
   *   - When the query clearly targets one fighter (exact first/last/full name
   *     or nickname), the response includes `data.featured` with that fighter's
   *     details plus their next upcoming fight and most recent completed fight.
   */
  fastify.get('/search', { preHandler: optionalAuth }, async (request, reply) => {
    const { q, limit = 10 } = request.query as { q?: string; limit?: number };
    const currentUserId = (request as any).user?.id; // Optional auth - may or may not be present

    // Validate query
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return reply.status(400).send({
        error: 'Search query must be at least 2 characters',
        code: 'INVALID_QUERY',
      });
    }

    const ctx = buildQueryContext(q);
    const { searchTerm } = ctx;
    const resultLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

    try {
      const candidateFighters = await prisma.fighter.findMany({
        where: {
          AND: [
            buildFighterSearchConditions(ctx),
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
          noContests: true,
          isChampion: true,
          championshipTitle: true,
          totalFights: true,
        },
        take: Math.max(resultLimit * 5, 50),
        orderBy: [
          { isChampion: 'desc' },
          { totalFights: 'desc' },
          { averageRating: 'desc' },
        ],
      });

      const scoredCandidates = candidateFighters
        .map((f) => ({ fighter: f, score: getFighterRelevanceScore(ctx, f) }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return compareFighterProminence(a.fighter, b.fighter);
        });

      // Relevance + prominence by fighter id — used to rank fights by their
      // participants (prominence breaks ties between equally-matched names,
      // e.g. McGregor's fight over an obscure Conor's fight).
      const fighterScoreById = new Map<string, number>();
      const fighterBoutsById = new Map<string, number>();
      for (const { fighter, score } of scoredCandidates) {
        fighterScoreById.set(fighter.id, score);
        fighterBoutsById.set(
          fighter.id,
          Math.max(
            fighter.totalFights || 0,
            (fighter.wins || 0) + (fighter.losses || 0) + (fighter.draws || 0)
          )
        );
      }

      const scoredFighters = scoredCandidates
        .slice(0, resultLimit)
        .map(({ fighter }) => fighter);

      // Detect single-fighter intent: the top match is an exact first/last/full
      // name or nickname match (score >= 700). That fighter gets featured.
      const topCandidate = scoredCandidates[0];
      const featuredFighterBase =
        topCandidate && topCandidate.score >= 700 ? topCandidate.fighter : null;

      // Calculate average rating from last 3 completed fights for each fighter
      const fighters = await Promise.all(
        scoredFighters.map(async (fighter) => {
          // Get last 3 completed fights for this fighter
          const recentFights = await prisma.fight.findMany({
            where: {
              OR: [
                { fighter1Id: fighter.id },
                { fighter2Id: fighter.id },
              ],
              fightStatus: 'COMPLETED',
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

      const allEvents = await prisma.event.findMany({
        where: {
          ...buildEventSearchConditions(ctx),
          NOT: hiddenPromotionsFilter(),
        },
        select: {
          id: true,
          name: true,
          promotion: true,
          date: true,
          venue: true,
          location: true,
          bannerImage: true,
          eventStatus: true,
          averageRating: true,
          totalRatings: true,
          greatFights: true,
        },
      });

      // Sort: by relevance first, then upcoming events (soonest), then past events (most recent)
      const now = new Date();
      const scoredEvents = allEvents.map(e => ({
        ...e,
        relevanceScore: getEventRelevanceScore(ctx, e.name, e.promotion),
        isUpcoming: new Date(e.date) >= now,
      }));

      scoredEvents.sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        if (a.isUpcoming !== b.isUpcoming) {
          return a.isUpcoming ? -1 : 1;
        }
        // By date (upcoming: soonest first, past: most recent first)
        if (a.isUpcoming) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        } else {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
      });

      // Remove the helper fields before returning
      const events = scoredEvents.slice(0, resultLimit).map(({ relevanceScore, isUpcoming, ...event }) => event);

      // Search fights (by fighter names and event/promotion)
      // For multi-word queries like "UFC Jon", require ALL words to match across different fields
      const buildFightSearchConditions = () => {
        const { searchTerms } = ctx;
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

        // Multi-word query - require ALL words to match somewhere in the fight
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

        return { AND: wordMatchConditions };
      };

      // Build include object for user-specific data
      const include: any = {
        fighter1: {
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
            wins: true,
            losses: true,
            draws: true,
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
      };

      // Add user predictions and ratings if authenticated
      if (currentUserId) {
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
        // Add user ratings for completed fights
        include.ratings = {
          where: { userId: currentUserId },
          select: {
            id: true,
            rating: true,
            createdAt: true,
            updatedAt: true,
          },
        };
      }

      // Over-fetch fight candidates so JS-side relevance ranking has a real
      // pool to work with (DB order alone is just event-date recency).
      const rawFights = await prisma.fight.findMany({
        where: {
          ...buildFightSearchConditions(),
          event: {
            NOT: hiddenPromotionsFilter(),
          },
        },
        include,
        take: Math.max(resultLimit * 3, 30),
        orderBy: [
          { event: { date: 'desc' } },
          { orderOnCard: 'asc' },
        ],
      });

      // Guarantee the featured fighter's next fight(s) and last completed fight
      // are in the candidate pool even if the text query or date-ordered take
      // missed them.
      if (featuredFighterBase) {
        const [featuredUpcoming, featuredLast] = await Promise.all([
          prisma.fight.findMany({
            where: {
              OR: [
                { fighter1Id: featuredFighterBase.id },
                { fighter2Id: featuredFighterBase.id },
              ],
              fightStatus: { in: ['UPCOMING', 'LIVE'] },
              event: { NOT: hiddenPromotionsFilter() },
            },
            include,
            orderBy: { event: { date: 'asc' } },
            take: 2,
          }),
          prisma.fight.findMany({
            where: {
              OR: [
                { fighter1Id: featuredFighterBase.id },
                { fighter2Id: featuredFighterBase.id },
              ],
              fightStatus: 'COMPLETED',
              event: { NOT: hiddenPromotionsFilter() },
            },
            include,
            orderBy: { event: { date: 'desc' } },
            take: 1,
          }),
        ]);

        const seenIds = new Set(rawFights.map((f) => f.id));
        for (const fight of [...featuredUpcoming, ...featuredLast]) {
          if (!seenIds.has(fight.id)) {
            rawFights.push(fight);
            seenIds.add(fight.id);
          }
        }
      }

      // Rank fights: fighter-name relevance (or event relevance for event-only
      // matches), then upcoming before completed before cancelled, then date
      // (upcoming soonest-first, completed most-recent-first).
      const rankedFights = (rawFights as any[])
        .map((fight) => {
          const fighterScore = Math.max(
            fighterScoreById.get(fight.fighter1Id) || 0,
            fighterScoreById.get(fight.fighter2Id) || 0
          );
          const eventScore =
            getEventRelevanceScore(ctx, fight.event.name, fight.event.promotion) * 0.4;
          const prominence = Math.max(
            fighterBoutsById.get(fight.fighter1Id) || 0,
            fighterBoutsById.get(fight.fighter2Id) || 0
          );
          return { fight, relevance: Math.max(fighterScore, eventScore), prominence };
        })
        .sort((a, b) => {
          if (b.relevance !== a.relevance) return b.relevance - a.relevance;
          if (b.prominence !== a.prominence) return b.prominence - a.prominence;
          const ra = fightStatusRank(a.fight.fightStatus);
          const rb = fightStatusRank(b.fight.fightStatus);
          if (ra !== rb) return ra - rb;
          const da = new Date(a.fight.event.date).getTime();
          const db = new Date(b.fight.event.date).getTime();
          return ra === 0 ? da - db : db - da;
        })
        .slice(0, resultLimit)
        .map(({ fight }) => fight);

      // Calculate averageHype for each fight from predictions
      const fightIds = rankedFights.map(f => f.id);
      const allPredictions = await prisma.fightPrediction.findMany({
        where: {
          fightId: { in: fightIds },
          predictedRating: { not: null },
        },
        select: {
          fightId: true,
          predictedRating: true,
        },
      });

      // Group predictions by fight and calculate averages
      const hypeByFight = new Map<string, { total: number; count: number }>();
      for (const pred of allPredictions) {
        if (pred.predictedRating !== null) {
          const existing = hypeByFight.get(pred.fightId) || { total: 0, count: 0 };
          existing.total += pred.predictedRating;
          existing.count += 1;
          hypeByFight.set(pred.fightId, existing);
        }
      }

      // Transform fights to add averageHype (for all users) and user data (for logged-in users)
      let fights: any[] = rankedFights.map(fight => {
        const transformed: any = { ...fight };

        // Add aggregate hype from batch calculation (for all users)
        const hypeData = hypeByFight.get(fight.id);
        if (hypeData && hypeData.count > 0) {
          transformed.averageHype = Math.round((hypeData.total / hypeData.count) * 10) / 10;
        } else {
          transformed.averageHype = 0;
        }

        return transformed;
      });

      // Add user-specific data for logged-in users
      if (currentUserId && fights.length > 0) {
        // Get all unique fighter IDs from the search results
        const uniqueFighterIds = new Set<string>();
        fights.forEach((fight: any) => {
          uniqueFighterIds.add(fight.fighter1Id);
          uniqueFighterIds.add(fight.fighter2Id);
        });

        // Check which fighters the user is following
        const followedFighters = await prisma.userFighterFollow.findMany({
          where: {
            userId: currentUserId,
            fighterId: { in: Array.from(uniqueFighterIds) }
          },
          select: { fighterId: true }
        });
        const followedFighterIds = new Set(followedFighters.map(ff => ff.fighterId));

        // Add user-specific data to each fight
        fights = await Promise.all(fights.map(async (fight: any) => {
          const transformed: any = { ...fight };

          // Transform user prediction data (same pattern as /api/fights endpoint)
          if (fight.predictions && fight.predictions.length > 0) {
            const prediction: any = (fight.predictions as any)[0];
            transformed.userHypePrediction = prediction.predictedRating;
            transformed.userPredictedWinner = prediction.predictedWinner;
            transformed.userPredictedMethod = prediction.predictedMethod;
            transformed.userPredictedRound = prediction.predictedRound;
          }

          // Transform user rating (for completed fights)
          if (fight.ratings && fight.ratings.length > 0) {
            transformed.userRating = fight.ratings[0].rating;
          }

          // Add fighter follow info (for UI display)
          transformed.isFollowingFighter1 = followedFighterIds.has(fight.fighter1Id) || undefined;
          transformed.isFollowingFighter2 = followedFighterIds.has(fight.fighter2Id) || undefined;

          // Get comprehensive notification reasons using the unified rule engine
          const notificationReasons = await notificationRuleEngine.getNotificationReasonsForFight(
            currentUserId,
            fight.id
          );
          transformed.notificationReasons = notificationReasons;

          // Set isFollowing based on whether there's a manual fight follow rule
          transformed.isFollowing = notificationReasons.reasons.some(
            r => r.type === 'manual' && r.isActive
          );

          // Remove raw arrays to avoid confusion
          delete transformed.predictions;
          delete transformed.ratings;

          return transformed;
        }));
      }

      // Search promotions (UFC, Bellator, ONE, etc.)
      // We'll get unique promotions from events that match the search term
      const buildPromotionSearchConditions = () => {
        const conditions: any[] = [
          { promotion: { contains: searchTerm, mode: 'insensitive' as const } },
        ];

        if (ctx.searchTerms.length > 1) {
          for (const term of ctx.searchTerms) {
            conditions.push({ promotion: { contains: term, mode: 'insensitive' as const } });
          }
        }

        return { OR: conditions };
      };

      const promotions = await prisma.event.findMany({
        where: {
          ...buildPromotionSearchConditions(),
          NOT: hiddenPromotionsFilter(),
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
              eventStatus: 'UPCOMING',
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

      const mappedFighters = fighters.map((f) => ({
        ...f,
        record:
          f.wins + f.losses + f.draws + f.noContests > 0
            ? `${f.wins}-${f.losses}${f.draws > 0 ? `-${f.draws}` : ''}`
            : null,
      }));

      // Build the featured block from the enriched fighter + enriched fights
      let featured: any = null;
      if (featuredFighterBase) {
        const featuredFighter =
          mappedFighters.find((f) => f.id === featuredFighterBase.id) || null;
        if (featuredFighter) {
          const isTheirs = (fight: any) =>
            fight.fighter1Id === featuredFighterBase.id ||
            fight.fighter2Id === featuredFighterBase.id;
          const nextFight =
            fights.find(
              (f: any) => isTheirs(f) && fightStatusRank(f.fightStatus) === 0
            ) || null;
          const lastFight =
            fights.find((f: any) => isTheirs(f) && f.fightStatus === 'COMPLETED') || null;

          featured = {
            type: 'fighter',
            fighter: featuredFighter,
            nextFight,
            lastFight,
          };
        }
      }

      return reply.send({
        data: {
          featured,
          fighters: mappedFighters,
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

  /**
   * GET /api/search/suggest
   * Lightweight typeahead suggestions — small payload, no auth, no per-fight
   * enrichment. Meant to be called on every debounced keystroke.
   * Query params:
   *   - q: search query (required, min 2 chars)
   */
  fastify.get('/search/suggest', async (request, reply) => {
    const { q } = request.query as { q?: string };

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return reply.send({
        data: { fighters: [], events: [], promotions: [] },
        meta: { query: (q || '').trim() },
      });
    }

    const ctx = buildQueryContext(q);

    try {
      const [candidateFighters, candidateEvents, promotionRows] = await Promise.all([
        prisma.fighter.findMany({
          where: {
            AND: [buildFighterSearchConditions(ctx), { isActive: true }],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            profileImage: true,
            weightClass: true,
            wins: true,
            losses: true,
            draws: true,
            noContests: true,
            isChampion: true,
            totalFights: true,
          },
          take: 30,
          orderBy: [
            { isChampion: 'desc' },
            { totalFights: 'desc' },
            { averageRating: 'desc' },
          ],
        }),
        prisma.event.findMany({
          where: {
            ...buildEventSearchConditions(ctx),
            NOT: hiddenPromotionsFilter(),
          },
          select: {
            id: true,
            name: true,
            promotion: true,
            date: true,
            eventStatus: true,
          },
          // date desc puts future events first, then most recent past — a
          // candidate pool the relevance scorer can actually work with
          // (an unordered take can miss e.g. "UFC 329" entirely for broad
          // per-word matches like "ufc ...").
          orderBy: { date: 'desc' },
          take: 50,
        }),
        prisma.event.findMany({
          where: {
            promotion: { contains: ctx.searchTerm, mode: 'insensitive' as const },
            NOT: hiddenPromotionsFilter(),
          },
          select: { promotion: true },
          distinct: ['promotion'],
          take: 3,
        }),
      ]);

      const fighters = candidateFighters
        .map((f) => ({ fighter: f, score: getFighterRelevanceScore(ctx, f) }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return compareFighterProminence(a.fighter, b.fighter);
        })
        .slice(0, 5)
        .map(({ fighter }) => ({
          id: fighter.id,
          firstName: fighter.firstName,
          lastName: fighter.lastName,
          nickname: fighter.nickname,
          profileImage: fighter.profileImage,
          weightClass: fighter.weightClass,
          isChampion: fighter.isChampion,
          record:
            fighter.wins + fighter.losses + fighter.draws + fighter.noContests > 0
              ? `${fighter.wins}-${fighter.losses}${fighter.draws > 0 ? `-${fighter.draws}` : ''}`
              : null,
        }));

      const now = new Date();
      const events = candidateEvents
        .map((e) => ({
          ...e,
          relevanceScore: getEventRelevanceScore(ctx, e.name, e.promotion),
          isUpcoming: new Date(e.date) >= now,
        }))
        .sort((a, b) => {
          if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
          if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;
          if (a.isUpcoming) {
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          }
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .slice(0, 3)
        .map(({ relevanceScore, isUpcoming, ...e }) => e);

      return reply.send({
        data: {
          fighters,
          events,
          promotions: promotionRows.map((p) => ({ name: p.promotion })),
        },
        meta: { query: ctx.searchTerm },
      });
    } catch (error) {
      console.error('[Search Suggest] Error:', error);
      return reply.status(500).send({
        error: 'Failed to fetch suggestions',
        code: 'SEARCH_SUGGEST_ERROR',
      });
    }
  });
}
