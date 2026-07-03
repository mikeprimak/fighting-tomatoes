/**
 * Home mirror routes — the identity dashboard above the fold
 * (identity-platform.md, Phase 1 objective #1: "the home screen is the mirror").
 *
 * GET /api/home/mirror serves the FIXED / URGENCY rail only — deterministic,
 * perishable facts that stay pinned while true (locked model, 2026-06-09):
 *   - liveEvents:   an event you care about is on RIGHT NOW
 *   - todayEvents:  an event you care about runs today
 *   - pinnedFights: fights you hyped / with a fighter you follow, next 7 days
 * "You care about" = you hyped a fight on the card OR follow someone on it.
 *
 * The ROTATING rail (taste insights, group comparisons) is served by the
 * existing GET /api/fan-dna/taste-profile — mobile composes the two.
 *
 * Spoiler-safe by construction: only UPCOMING/LIVE events are queried and no
 * result fields are selected, so there is nothing to spoil.
 *
 * Day semantics: Event.date is a UTC-hour placeholder, so "today" is the
 * event's UTC calendar day — the same convention the home feed's Event Last
 * Night section and the web WeekendEventsSection already use. Real instants
 * (mainStartTime/prelimStartTime) ride along for display when present.
 */
import { FastifyInstance } from 'fastify';

import { authenticateUser } from '../middleware/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
/** UTC day bucket of a date — matches the mobile/web home-day convention. */
const dayKey = (d: Date | string): number =>
  Math.floor(new Date(d).getTime() / DAY_MS);

// Pinned fights look this many days ahead ("stays pinned all week" — a hyped
// Saturday fight shows from the moment it's hyped, not only inside Mon–Sun).
const LOOKAHEAD_DAYS = 7;
// LIVE cards whose placeholder day has already rolled past midnight UTC still
// belong on the rail; reach slightly back for them.
const LOOKBACK_DAYS = 2;
const MAX_PINNED_FIGHTS = 10;

const mirrorFightSelect = {
  id: true,
  isTitle: true,
  orderOnCard: true,
  fighter1Id: true,
  fighter2Id: true,
  fighter1: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
  fighter2: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
  event: {
    select: {
      id: true,
      name: true,
      promotion: true,
      date: true,
      eventStatus: true,
      mainStartTime: true,
      prelimStartTime: true,
    },
  },
} as const;

interface MirrorFightRow {
  id: string;
  isTitle: boolean;
  orderOnCard: number;
  fighter1Id: string;
  fighter2Id: string;
  fighter1: { id: string; firstName: string; lastName: string; profileImage: string | null } | null;
  fighter2: { id: string; firstName: string; lastName: string; profileImage: string | null } | null;
  event: {
    id: string;
    name: string;
    promotion: string;
    date: Date;
    eventStatus: string;
    mainStartTime: Date | null;
    prelimStartTime: Date | null;
  } | null;
}

const fighterName = (f: { firstName: string; lastName: string } | null): string =>
  `${f?.firstName ?? ''} ${f?.lastName ?? ''}`.trim();

export default async function homeMirrorRoutes(fastify: FastifyInstance) {
  fastify.get('/mirror', {
    schema: {
      description:
        'Urgency rail for the identity home dashboard: live/today events the user cares about + pinned hyped/followed fights for the next week. Read-only, spoiler-safe (UPCOMING/LIVE only, no result fields).',
      tags: ['home'],
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;

    try {
      const now = new Date();
      const todayKey = dayKey(now);
      const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
      const windowEnd = new Date(now.getTime() + (LOOKAHEAD_DAYS + 1) * DAY_MS);

      const eventWindow = {
        eventStatus: { in: ['UPCOMING', 'LIVE'] as any },
        date: { gte: windowStart, lte: windowEnd },
      };

      const follows = await fastify.prisma.userFighterFollow.findMany({
        where: { userId: user.id },
        select: { fighterId: true },
      });
      const followedIds = new Set<string>(follows.map((f: { fighterId: string }) => f.fighterId));

      const [hyped, followedFights] = await Promise.all([
        fastify.prisma.fightPrediction.findMany({
          where: {
            userId: user.id,
            predictedRating: { not: null },
            fight: {
              is: {
                fightStatus: { not: 'CANCELLED' as any },
                event: { is: eventWindow },
              },
            },
          },
          select: { predictedRating: true, fight: { select: mirrorFightSelect } },
        }),
        followedIds.size === 0
          ? Promise.resolve([] as MirrorFightRow[])
          : fastify.prisma.fight.findMany({
              where: {
                fightStatus: { not: 'CANCELLED' as any },
                event: { is: eventWindow },
                OR: [
                  { fighter1Id: { in: [...followedIds] } },
                  { fighter2Id: { in: [...followedIds] } },
                ],
              },
              select: mirrorFightSelect,
            }),
      ]);

      // Merge both signals per fight: one card per fight, hype + follows together.
      const byFight = new Map<string, { fight: MirrorFightRow; hype: number | null }>();
      for (const h of hyped as Array<{ predictedRating: number | null; fight: MirrorFightRow }>) {
        if (h.fight?.event) byFight.set(h.fight.id, { fight: h.fight, hype: h.predictedRating });
      }
      for (const f of followedFights as MirrorFightRow[]) {
        if (!f.event) continue;
        const existing = byFight.get(f.id);
        if (existing) continue; // already present via hype; follow names derive below
        byFight.set(f.id, { fight: f, hype: null });
      }

      const followedNamesIn = (f: MirrorFightRow): string[] => {
        const names: string[] = [];
        if (followedIds.has(f.fighter1Id)) names.push(fighterName(f.fighter1));
        if (followedIds.has(f.fighter2Id)) names.push(fighterName(f.fighter2));
        return names;
      };

      // Group per event for the live/today cards.
      interface EventAgg {
        event: NonNullable<MirrorFightRow['event']>;
        hypedFightCount: number;
        followedFighterNames: Set<string>;
      }
      const byEvent = new Map<string, EventAgg>();
      for (const { fight, hype } of byFight.values()) {
        const ev = fight.event!;
        let agg = byEvent.get(ev.id);
        if (!agg) {
          agg = { event: ev, hypedFightCount: 0, followedFighterNames: new Set() };
          byEvent.set(ev.id, agg);
        }
        if (hype != null) agg.hypedFightCount += 1;
        for (const n of followedNamesIn(fight)) agg.followedFighterNames.add(n);
      }

      const toEventCard = (agg: EventAgg) => ({
        eventId: agg.event.id,
        name: agg.event.name,
        promotion: agg.event.promotion,
        date: agg.event.date,
        mainStartTime: agg.event.mainStartTime,
        prelimStartTime: agg.event.prelimStartTime,
        hypedFightCount: agg.hypedFightCount,
        followedFighterNames: [...agg.followedFighterNames],
      });

      const liveEvents = [...byEvent.values()]
        .filter((a) => a.event.eventStatus === 'LIVE')
        .map(toEventCard);
      const todayEvents = [...byEvent.values()]
        .filter((a) => a.event.eventStatus === 'UPCOMING' && dayKey(a.event.date) === todayKey)
        .map(toEventCard);

      // Pinned fights: today and forward, on non-live events (a live event's
      // card supersedes its per-fight pins). Followed-fighter pins and higher
      // hype float up inside each day.
      const pinnedFights = [...byFight.values()]
        .filter(({ fight }) => {
          const ev = fight.event!;
          return ev.eventStatus === 'UPCOMING' && dayKey(ev.date) >= todayKey;
        })
        .sort((a, b) => {
          const dayDiff = dayKey(a.fight.event!.date) - dayKey(b.fight.event!.date);
          if (dayDiff !== 0) return dayDiff;
          const aFollow = followedNamesIn(a.fight).length > 0 ? 1 : 0;
          const bFollow = followedNamesIn(b.fight).length > 0 ? 1 : 0;
          if (aFollow !== bFollow) return bFollow - aFollow;
          return (b.hype ?? 0) - (a.hype ?? 0);
        })
        .slice(0, MAX_PINNED_FIGHTS)
        .map(({ fight, hype }) => ({
          fightId: fight.id,
          eventId: fight.event!.id,
          eventName: fight.event!.name,
          promotion: fight.event!.promotion,
          eventDate: fight.event!.date,
          isTitle: fight.isTitle,
          fighter1: { name: fighterName(fight.fighter1), profileImage: fight.fighter1?.profileImage ?? null },
          fighter2: { name: fighterName(fight.fighter2), profileImage: fight.fighter2?.profileImage ?? null },
          hype,
          followedFighterNames: followedNamesIn(fight),
        }));

      return reply.code(200).send({ liveEvents, todayEvents, pinnedFights });
    } catch (err: unknown) {
      request.log.error(err, '[homeMirror] /mirror handler failed');
      return reply.code(500).send({
        error: 'Failed to build home mirror',
        code: 'HOME_MIRROR_FAILED',
      });
    }
  });
}
