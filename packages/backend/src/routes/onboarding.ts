/**
 * Onboarding routes — the new-user "explain → rate classics → first insight →
 * follow picker" flow (identity-platform.md, Phase 1 objective #3).
 *
 * Both endpoints are READ-ONLY. Admin curation lives in SystemConfig rows
 * (this branch is migration-frozen — same pattern as blog_highlights):
 *   onboarding_rate_stack — string[] of fight IDs, served in admin order
 *   onboarding_fighters   — Array<{ fighterId: string, priority?: number }>
 *
 * Rate-stack payloads are spoiler-safe: no winner/method/round/result fields
 * ever leave this route. Rating submission reuses POST /api/fights/:id/rate.
 */
import { FastifyInstance } from 'fastify';

import { authenticateUser } from '../middleware/auth';

const RATE_STACK_KEY = 'onboarding_rate_stack';
const FIGHTERS_KEY = 'onboarding_fighters';

const DEFAULT_STACK_LIMIT = 30;
const MAX_STACK_LIMIT = 60;
// How many top-rated COMPLETED fights to consider before the character-tag
// filter + diversity pick. Big enough to survive both filters at ~30 out.
const CANDIDATE_POOL = 200;
const SUGGESTION_LIMIT = 40;
// Fallback picker over-fetches so the champion/rank boost has room to reorder.
const SUGGESTION_POOL = 120;
// Second leg of the suggestion mix (Mike, 2026-06-12): fighters whose fights
// carry the most historical fan ratings — the legends people actually know.
const RATED_POOL = 80;
// "Historically loved" fighters must still be relevant: active flag OR a
// fight inside this window.
const RECENT_FIGHT_WINDOW_MS = 3 * 365 * 24 * 60 * 60 * 1000;
// How hard deep rating history weighs against raw follower counts in the
// blended score: the most-rated fighter in the pool earns this many points.
const RATING_VOLUME_POINTS = 150;

const fightSelect = {
  id: true,
  weightClass: true,
  aiPostFightTags: true,
  fightStatus: true,
  event: { select: { name: true, date: true, promotion: true } },
  fighter1: {
    select: { firstName: true, lastName: true, profileImage: true, gender: true },
  },
  fighter2: {
    select: { firstName: true, lastName: true, profileImage: true, gender: true },
  },
} as const;

interface StackFightRow {
  id: string;
  weightClass: string | null;
  aiPostFightTags: unknown;
  event: { name: string; date: Date; promotion: string } | null;
  fighter1: { firstName: string; lastName: string; profileImage: string | null; gender: string } | null;
  fighter2: { firstName: string; lastName: string; profileImage: string | null; gender: string } | null;
}

const hasCharacterTags = (f: StackFightRow): boolean => {
  const character = (f.aiPostFightTags as any)?.character;
  return character != null && typeof character === 'object';
};

/** Spoiler-safe projection — deliberately no winner/method/round/time. */
function toStackFight(f: StackFightRow) {
  return {
    fightId: f.id,
    fighter1: {
      name: `${f.fighter1?.firstName ?? ''} ${f.fighter1?.lastName ?? ''}`.trim(),
      profileImage: f.fighter1?.profileImage ?? null,
    },
    fighter2: {
      name: `${f.fighter2?.firstName ?? ''} ${f.fighter2?.lastName ?? ''}`.trim(),
      profileImage: f.fighter2?.profileImage ?? null,
    },
    eventName: f.event?.name ?? null,
    year: f.event ? new Date(f.event.date).getUTCFullYear() : null,
    org: f.event?.promotion ?? null,
    weightClass: f.weightClass ?? null,
  };
}

/**
 * Diversity pick: round-robin across orgs, and within each org across
 * (decade, gender) groups, so the stack mixes the dimensions the taste engine
 * aggregates on instead of serving 30 straight UFC men's fights from one era.
 * Input order (most-rated first) is preserved inside each group.
 */
function diversityPick(fights: StackFightRow[], limit: number): StackFightRow[] {
  const orgBuckets = new Map<string, StackFightRow[][]>();
  for (const f of fights) {
    const org = f.event?.promotion ?? 'other';
    const decade = f.event ? Math.floor(new Date(f.event.date).getUTCFullYear() / 10) : 0;
    const subKey = `${decade}|${f.fighter1?.gender ?? ''}`;
    let subMap = orgBuckets.get(org) as any;
    if (!subMap) {
      subMap = new Map<string, StackFightRow[]>();
      orgBuckets.set(org, subMap);
    }
    if (!subMap.get(subKey)) subMap.set(subKey, []);
    subMap.get(subKey).push(f);
  }

  // Flatten each org's sub-groups by round-robin, then round-robin the orgs
  // (largest first so the dominant org leads each pass).
  const perOrg: StackFightRow[][] = [...orgBuckets.values()]
    .map((subMap: any) => {
      const groups: StackFightRow[][] = [...subMap.values()];
      const flat: StackFightRow[] = [];
      for (let i = 0; flat.length < groups.reduce((s, g) => s + g.length, 0); i++) {
        for (const g of groups) if (i < g.length) flat.push(g[i]);
      }
      return flat;
    })
    .sort((a, b) => b.length - a.length);

  const picked: StackFightRow[] = [];
  for (let i = 0; picked.length < limit; i++) {
    let advanced = false;
    for (const org of perOrg) {
      if (i < org.length) {
        picked.push(org[i]);
        advanced = true;
        if (picked.length >= limit) break;
      }
    }
    if (!advanced) break;
  }
  return picked;
}

export default async function onboardingRoutes(fastify: FastifyInstance) {
  fastify.get('/rate-stack', {
    schema: {
      description:
        'The onboarding classics stack: ~30 heavily character-tagged COMPLETED fights for fast first ratings. Spoiler-safe (no results). Admin override via SystemConfig onboarding_rate_stack; auto-fallback = most-rated classics, diversity-picked.',
      tags: ['onboarding'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: MAX_STACK_LIMIT },
        },
      },
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;
    const limit =
      (request.query as { limit?: number }).limit ?? DEFAULT_STACK_LIMIT;

    try {
      const rated = await fastify.prisma.fightRating.findMany({
        where: { userId: user.id },
        select: { fightId: true },
      });
      const ratedIds = new Set(rated.map((r) => r.fightId));

      // Admin-curated stack, served in the admin's order.
      let curatedIds: string[] = [];
      try {
        const cfg = await fastify.prisma.systemConfig.findUnique({
          where: { key: RATE_STACK_KEY },
        });
        if (cfg && Array.isArray(cfg.value)) {
          curatedIds = (cfg.value as unknown[]).filter(
            (s): s is string => typeof s === 'string',
          );
        }
      } catch {
        // SystemConfig unreadable — fall through to the auto stack.
      }

      if (curatedIds.length > 0) {
        const rows = await fastify.prisma.fight.findMany({
          where: { id: { in: curatedIds }, fightStatus: 'COMPLETED' },
          select: fightSelect,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const fights = curatedIds
          .map((id) => byId.get(id))
          .filter((f): f is NonNullable<typeof f> => !!f && !ratedIds.has(f.id))
          .slice(0, limit)
          .map((f) => toStackFight(f as StackFightRow));
        return reply.code(200).send({ fights, source: 'curated' });
      }

      // Auto-fallback: most-rated completed fights that carry the character
      // taxonomy (the dims the taste engine feeds on), diversity-picked.
      const pool = await fastify.prisma.fight.findMany({
        where: { fightStatus: 'COMPLETED' },
        orderBy: { ratings: { _count: 'desc' } },
        take: CANDIDATE_POOL,
        select: fightSelect,
      });
      const candidates = pool.filter(
        (f) => !ratedIds.has(f.id) && hasCharacterTags(f as StackFightRow),
      ) as StackFightRow[];
      const fights = diversityPick(candidates, limit).map(toStackFight);
      return reply.code(200).send({ fights, source: 'auto' });
    } catch (err: unknown) {
      request.log.error(err, '[onboarding] /rate-stack handler failed');
      return reply.code(500).send({
        error: 'Failed to load rate stack',
        code: 'ONBOARDING_RATE_STACK_FAILED',
      });
    }
  });

  fastify.get('/follow-suggestions', {
    schema: {
      description:
        'Fighter suggestions for the onboarding follow picker. Admin override via SystemConfig onboarding_fighters ({fighterId, priority}[]); auto-fallback = most-followed active fighters with headshots, champion/rank boosted. Flat list (Fighter has no org column); the picker search covers everyone else.',
      tags: ['onboarding'],
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    try {
      const fighterSelect = {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        profileImage: true,
        weightClass: true,
        rank: true,
        isChampion: true,
        wins: true,
        losses: true,
        draws: true,
        _count: { select: { followers: true } },
      } as const;

      const toSuggestion = (f: any) => ({
        fighterId: f.id,
        name: `${f.firstName} ${f.lastName}`.trim(),
        nickname: f.nickname ?? null,
        profileImage: f.profileImage ?? null,
        weightClass: f.weightClass ?? null,
        rank: f.rank ?? null,
        isChampion: f.isChampion,
        wins: f.wins,
        losses: f.losses,
        draws: f.draws,
        followerCount: f._count.followers,
      });

      // Admin-curated picker (priority asc = first).
      let curated: Array<{ fighterId: string; priority?: number }> = [];
      try {
        const cfg = await fastify.prisma.systemConfig.findUnique({
          where: { key: FIGHTERS_KEY },
        });
        if (cfg && Array.isArray(cfg.value)) {
          curated = (cfg.value as unknown[]).filter(
            (v): v is { fighterId: string; priority?: number } =>
              !!v && typeof v === 'object' && typeof (v as any).fighterId === 'string',
          );
        }
      } catch {
        // SystemConfig unreadable — fall through to the auto picker.
      }

      if (curated.length > 0) {
        const rows = await fastify.prisma.fighter.findMany({
          where: { id: { in: curated.map((c) => c.fighterId) } },
          select: fighterSelect,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        const fighters = [...curated]
          .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9))
          .map((c) => byId.get(c.fighterId))
          .filter((f): f is NonNullable<typeof f> => !!f)
          .map(toSuggestion);
        return reply.code(200).send({ fighters, source: 'curated' });
      }

      // Auto-fallback until Mike curates: a MIX (Mike, 2026-06-12 round 4) of
      // (a) most-followed active fighters and (b) fighters whose fights carry
      // the most historical fan ratings — but only when they're still active
      // or fought within the last 3 years. Headshot required for everyone.
      const recencyCutoff = new Date(Date.now() - RECENT_FIGHT_WINDOW_MS);
      const [followedPool, ratedPool] = await Promise.all([
        fastify.prisma.fighter.findMany({
          where: { isActive: true, profileImage: { not: null } },
          orderBy: { followers: { _count: 'desc' } },
          take: SUGGESTION_POOL,
          select: fighterSelect,
        }),
        fastify.prisma.$queryRaw<
          Array<{ id: string; rating_count: number; last_fight: Date | null }>
        >`
          SELECT f.id,
                 COUNT(fr.id)::int AS rating_count,
                 MAX(e.date)       AS last_fight
          FROM fighters f
          JOIN fights ft ON ft."fighter1Id" = f.id OR ft."fighter2Id" = f.id
          JOIN fight_ratings fr ON fr."fightId" = ft.id
          JOIN events e ON e.id = ft."eventId"
          WHERE f."profileImage" IS NOT NULL
          GROUP BY f.id
          ORDER BY rating_count DESC
          LIMIT ${RATED_POOL}
        `,
      ]);

      const ratedInfo = new Map(ratedPool.map((r) => [r.id, r]));
      const followedIds = new Set(followedPool.map((f) => f.id));
      const missingIds = ratedPool
        .map((r) => r.id)
        .filter((id) => !followedIds.has(id));
      // Rated-pool fighters outside the followed pool may be inactive
      // (retired legends) — load them with the flag so the recency gate can
      // decide.
      const extraRows = missingIds.length
        ? await fastify.prisma.fighter.findMany({
            where: { id: { in: missingIds } },
            select: { ...fighterSelect, isActive: true },
          })
        : [];
      const stillRelevant = (f: { isActive?: boolean; id: string }) => {
        if (f.isActive !== false) return true;
        const last = ratedInfo.get(f.id)?.last_fight;
        return last != null && new Date(last) >= recencyCutoff;
      };

      const maxRatingCount = Math.max(
        1,
        ...ratedPool.map((r) => r.rating_count),
      );
      const fighters = [...followedPool, ...extraRows]
        .filter(stillRelevant)
        .map((f) => ({
          f,
          score:
            f._count.followers +
            (f.isChampion ? 100 : 0) +
            (f.rank ? 30 : 0) +
            ((ratedInfo.get(f.id)?.rating_count ?? 0) / maxRatingCount) *
              RATING_VOLUME_POINTS,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, SUGGESTION_LIMIT)
        .map(({ f }) => toSuggestion(f));
      return reply.code(200).send({ fighters, source: 'auto' });
    } catch (err: unknown) {
      request.log.error(err, '[onboarding] /follow-suggestions handler failed');
      return reply.code(500).send({
        error: 'Failed to load follow suggestions',
        code: 'ONBOARDING_FOLLOW_SUGGESTIONS_FAILED',
      });
    }
  });
}
