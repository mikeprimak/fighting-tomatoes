/**
 * Post-scrape duplicate-event merge.
 *
 * Co-promoted boxing cards (e.g. Top Rank + Golden Boy + Matchroom) appear on
 * both promoters' Tapology pages. Each scraper creates its own Event row
 * because the parsers dedupe on `ufcUrl` OR `name + date`, and the names get
 * a per-promo prefix at scrape time. Result: two Event rows for one card.
 *
 * This pass finds Events that share a fight (by sorted fighter pair) within a
 * tight date window and merges the smaller one into the larger one. All child
 * records (ratings, reviews, predictions, comments, tags, follow matches,
 * crew data) are re-pointed; on unique-constraint conflicts the duplicate is
 * dropped so the canonical wins.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DATE_WINDOW_HOURS = 36;

export interface MergeResult {
  candidatePairs: number;
  merged: number;
  skipped: number;
  details: Array<{
    canonicalId: string;
    canonicalName: string;
    duplicateId: string;
    duplicateName: string;
    fightsReparented: number;
    fightsCollapsed: number;
    ratingsMoved: number;
    ratingsDropped: number;
    action: 'merged' | 'dry-run' | 'skipped';
    skipReason?: string;
  }>;
}

interface EventRow {
  id: string;
  name: string;
  promotion: string;
  date: Date;
  scraperType: string | null;
  bannerImage: string | null;
  venue: string | null;
  location: string | null;
  eventStatus: string;
  createdAt: Date;
  fights: Array<{
    id: string;
    fighter1Id: string;
    fighter2Id: string;
    orderOnCard: number;
    totalRatings: number;
    fightStatus: string;
  }>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pickCanonical(a: EventRow, b: EventRow): { canonical: EventRow; duplicate: EventRow } {
  const aRatings = a.fights.reduce((s, f) => s + f.totalRatings, 0);
  const bRatings = b.fights.reduce((s, f) => s + f.totalRatings, 0);

  // More fights wins (more complete card data)
  if (a.fights.length !== b.fights.length) {
    return a.fights.length > b.fights.length
      ? { canonical: a, duplicate: b }
      : { canonical: b, duplicate: a };
  }
  // Tie → more user data
  if (aRatings !== bRatings) {
    return aRatings > bRatings
      ? { canonical: a, duplicate: b }
      : { canonical: b, duplicate: a };
  }
  // Tie → earlier createdAt (stable choice)
  return a.createdAt <= b.createdAt
    ? { canonical: a, duplicate: b }
    : { canonical: b, duplicate: a };
}

async function loadCandidateEvents(): Promise<EventRow[]> {
  const now = new Date();
  const horizonPast = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const horizonFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      date: { gte: horizonPast, lte: horizonFuture },
      eventStatus: { not: 'CANCELLED' },
      scraperType: { not: null },
    },
    select: {
      id: true,
      name: true,
      promotion: true,
      date: true,
      scraperType: true,
      bannerImage: true,
      venue: true,
      location: true,
      eventStatus: true,
      createdAt: true,
      fights: {
        select: {
          id: true,
          fighter1Id: true,
          fighter2Id: true,
          orderOnCard: true,
          totalRatings: true,
          fightStatus: true,
        },
      },
    },
  });

  return events.filter(e => e.fights.length > 0) as EventRow[];
}

function mainEventPairKey(e: EventRow): string | null {
  // Use only non-cancelled fights — parsers auto-cancel rows that disappear
  // from the source, so the live roster is just the non-CANCELLED ones.
  // If multiple DISTINCT fighter pairs share the lowest orderOnCard, the
  // card has co-main events or the data is too messy to identify a single
  // main; refuse to match.
  const live = e.fights.filter(f => f.fightStatus !== 'CANCELLED');
  if (live.length === 0) return null;
  const minOrder = Math.min(...live.map(f => f.orderOnCard));
  const topFights = live.filter(f => f.orderOnCard === minOrder);
  const keys = new Set(topFights.map(f => pairKey(f.fighter1Id, f.fighter2Id)));
  if (keys.size !== 1) return null;
  return [...keys][0];
}

function findDuplicatePairs(events: EventRow[]): Array<[EventRow, EventRow]> {
  const pairs: Array<[EventRow, EventRow]> = [];
  const windowMs = DATE_WINDOW_HOURS * 60 * 60 * 1000;
  const seenPair = new Set<string>();

  // Co-promoted events get separate Event rows because parsers prefix the name
  // with their promo and dedupe on (name, date). The signal that two rows are
  // actually one card is matching MAIN EVENTS — not just any shared fighter
  // pair (which can fire on polluted/over-scraped events sharing undercards).
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      if (Math.abs(a.date.getTime() - b.date.getTime()) > windowMs) continue;
      if (a.promotion === b.promotion) continue;

      const aMain = mainEventPairKey(a);
      const bMain = mainEventPairKey(b);
      if (!aMain || !bMain) continue;
      if (aMain !== bMain) continue;

      const key = [a.id, b.id].sort().join(':');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * Re-point all child records for a fight so that fightId moves from
 * `fromFightId` to `toFightId`. For tables with a unique constraint that
 * includes fightId, drop the source row first when the destination already
 * has a row for the same scope (canonical wins).
 *
 * Returns counts of rows moved vs dropped (only for ratings — for other
 * tables we don't surface counts, but we still log on drops).
 */
async function repointFightChildren(
  tx: Prisma.TransactionClient,
  fromFightId: string,
  toFightId: string,
): Promise<{ ratingsMoved: number; ratingsDropped: number }> {
  // fight_ratings: unique (userId, fightId)
  const ratingsDropped = await tx.$executeRaw`
    DELETE FROM fight_ratings
    WHERE "fightId" = ${fromFightId}
      AND "userId" IN (SELECT "userId" FROM fight_ratings WHERE "fightId" = ${toFightId})
  `;
  const ratingsMoved = await tx.$executeRaw`
    UPDATE fight_ratings SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // fight_predictions: unique (userId, fightId)
  await tx.$executeRaw`
    DELETE FROM fight_predictions
    WHERE "fightId" = ${fromFightId}
      AND "userId" IN (SELECT "userId" FROM fight_predictions WHERE "fightId" = ${toFightId})
  `;
  await tx.$executeRaw`
    UPDATE fight_predictions SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // fight_tags: unique (userId, fightId, tagId)
  await tx.$executeRaw`
    DELETE FROM fight_tags
    WHERE "fightId" = ${fromFightId}
      AND ("userId", "tagId") IN (SELECT "userId", "tagId" FROM fight_tags WHERE "fightId" = ${toFightId})
  `;
  await tx.$executeRaw`
    UPDATE fight_tags SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // user_recommendations: unique (userId, fightId)
  await tx.$executeRaw`
    DELETE FROM user_recommendations
    WHERE "fightId" = ${fromFightId}
      AND "userId" IN (SELECT "userId" FROM user_recommendations WHERE "fightId" = ${toFightId})
  `;
  await tx.$executeRaw`
    UPDATE user_recommendations SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // fight_notification_matches: unique (userId, fightId, ruleId)
  await tx.$executeRaw`
    DELETE FROM fight_notification_matches
    WHERE "fightId" = ${fromFightId}
      AND ("userId", "ruleId") IN (SELECT "userId", "ruleId" FROM fight_notification_matches WHERE "fightId" = ${toFightId})
  `;
  await tx.$executeRaw`
    UPDATE fight_notification_matches SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // crew_predictions: unique (crewId, userId, fightId)
  await tx.$executeRaw`
    DELETE FROM crew_predictions
    WHERE "fightId" = ${fromFightId}
      AND ("crewId", "userId") IN (SELECT "crewId", "userId" FROM crew_predictions WHERE "fightId" = ${toFightId})
  `;
  await tx.$executeRaw`
    UPDATE crew_predictions SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // crew_round_votes: unique (crewId, userId, fightId, roundNumber)
  await tx.$executeRaw`
    DELETE FROM crew_round_votes
    WHERE "fightId" = ${fromFightId}
      AND ("crewId", "userId", "roundNumber") IN
        (SELECT "crewId", "userId", "roundNumber" FROM crew_round_votes WHERE "fightId" = ${toFightId})
  `;
  await tx.$executeRaw`
    UPDATE crew_round_votes SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}
  `;

  // No fightId-scoped unique constraints below; just re-point.
  await tx.$executeRaw`UPDATE fight_reviews SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}`;
  await tx.$executeRaw`UPDATE pre_fight_comments SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}`;
  await tx.$executeRaw`UPDATE crew_messages SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}`;
  await tx.$executeRaw`UPDATE crew_reactions SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}`;
  await tx.$executeRaw`UPDATE user_activities SET "fightId" = ${toFightId} WHERE "fightId" = ${fromFightId}`;

  return {
    ratingsMoved: Number(ratingsMoved),
    ratingsDropped: Number(ratingsDropped),
  };
}

async function recomputeFightStats(tx: Prisma.TransactionClient, fightId: string): Promise<void> {
  // Recomputes fight aggregate columns from fight_ratings + fight_reviews counts.
  await tx.$executeRaw`
    UPDATE fights f SET
      "totalRatings"  = COALESCE(s.cnt, 0),
      "averageRating" = COALESCE(s.avg, 0),
      ratings1  = COALESCE(s.r1,  0),
      ratings2  = COALESCE(s.r2,  0),
      ratings3  = COALESCE(s.r3,  0),
      ratings4  = COALESCE(s.r4,  0),
      ratings5  = COALESCE(s.r5,  0),
      ratings6  = COALESCE(s.r6,  0),
      ratings7  = COALESCE(s.r7,  0),
      ratings8  = COALESCE(s.r8,  0),
      ratings9  = COALESCE(s.r9,  0),
      ratings10 = COALESCE(s.r10, 0)
    FROM (
      SELECT
        COUNT(*)::int AS cnt,
        AVG(rating)::float AS avg,
        COUNT(*) FILTER (WHERE rating = 1)::int  AS r1,
        COUNT(*) FILTER (WHERE rating = 2)::int  AS r2,
        COUNT(*) FILTER (WHERE rating = 3)::int  AS r3,
        COUNT(*) FILTER (WHERE rating = 4)::int  AS r4,
        COUNT(*) FILTER (WHERE rating = 5)::int  AS r5,
        COUNT(*) FILTER (WHERE rating = 6)::int  AS r6,
        COUNT(*) FILTER (WHERE rating = 7)::int  AS r7,
        COUNT(*) FILTER (WHERE rating = 8)::int  AS r8,
        COUNT(*) FILTER (WHERE rating = 9)::int  AS r9,
        COUNT(*) FILTER (WHERE rating = 10)::int AS r10
      FROM fight_ratings WHERE "fightId" = ${fightId}
    ) s
    WHERE f.id = ${fightId}
  `;
  await tx.$executeRaw`
    UPDATE fights SET "totalReviews" = (SELECT COUNT(*)::int FROM fight_reviews WHERE "fightId" = ${fightId})
    WHERE id = ${fightId}
  `;
}

async function recomputeEventStats(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE events e SET
      "totalRatings"  = COALESCE(s.cnt, 0),
      "averageRating" = COALESCE(s.avg, 0),
      "greatFights"   = COALESCE(s.great, 0)
    FROM (
      SELECT
        SUM(f."totalRatings")::int AS cnt,
        CASE WHEN SUM(f."totalRatings") > 0
             THEN SUM(f."averageRating" * f."totalRatings") / SUM(f."totalRatings")
             ELSE 0 END AS avg,
        COUNT(*) FILTER (WHERE f."averageRating" >= 8.5)::int AS great
      FROM fights f WHERE f."eventId" = ${eventId}
    ) s
    WHERE e.id = ${eventId}
  `;
}

async function mergePair(
  canonical: EventRow,
  duplicate: EventRow,
  dryRun: boolean,
): Promise<MergeResult['details'][number]> {
  const detail: MergeResult['details'][number] = {
    canonicalId: canonical.id,
    canonicalName: canonical.name,
    duplicateId: duplicate.id,
    duplicateName: duplicate.name,
    fightsReparented: 0,
    fightsCollapsed: 0,
    ratingsMoved: 0,
    ratingsDropped: 0,
    action: dryRun ? 'dry-run' : 'merged',
  };

  if (dryRun) {
    const canonicalKeys = new Set(canonical.fights.map(f => pairKey(f.fighter1Id, f.fighter2Id)));
    for (const f of duplicate.fights) {
      if (canonicalKeys.has(pairKey(f.fighter1Id, f.fighter2Id))) detail.fightsCollapsed++;
      else detail.fightsReparented++;
    }
    return detail;
  }

  await prisma.$transaction(async (tx) => {
    const canonicalFights = await tx.fight.findMany({
      where: { eventId: canonical.id },
      select: { id: true, fighter1Id: true, fighter2Id: true },
    });
    const canonicalByPair = new Map(canonicalFights.map(f => [pairKey(f.fighter1Id, f.fighter2Id), f.id]));

    const dupFights = await tx.fight.findMany({
      where: { eventId: duplicate.id },
      select: { id: true, fighter1Id: true, fighter2Id: true },
    });

    for (const f of dupFights) {
      const target = canonicalByPair.get(pairKey(f.fighter1Id, f.fighter2Id));
      if (target) {
        const counts = await repointFightChildren(tx, f.id, target);
        detail.ratingsMoved += counts.ratingsMoved;
        detail.ratingsDropped += counts.ratingsDropped;
        await tx.fight.delete({ where: { id: f.id } });
        await recomputeFightStats(tx, target);
        detail.fightsCollapsed++;
      } else {
        // Reparent. The unique (eventId, fighter1Id, fighter2Id) is safe because
        // the no-match branch means no canonical fight uses this pair.
        await tx.fight.update({ where: { id: f.id }, data: { eventId: canonical.id } });
        detail.fightsReparented++;
      }
    }

    // Move pre-event-notification record if dup had one (unique on eventId).
    await tx.$executeRaw`
      DELETE FROM sent_pre_event_notifications WHERE "eventId" = ${duplicate.id}
        AND EXISTS (SELECT 1 FROM sent_pre_event_notifications WHERE "eventId" = ${canonical.id})
    `;
    await tx.$executeRaw`
      UPDATE sent_pre_event_notifications SET "eventId" = ${canonical.id} WHERE "eventId" = ${duplicate.id}
    `;

    // Keep canonical's promotion as-is. Combining promo strings (e.g.
    // "Top Rank / Golden Boy") would silently break promotion filters and
    // notification rules that match exact strings.
    await tx.event.update({
      where: { id: canonical.id },
      data: {
        bannerImage: canonical.bannerImage ?? duplicate.bannerImage ?? undefined,
        venue: canonical.venue ?? duplicate.venue ?? undefined,
        location: canonical.location ?? duplicate.location ?? undefined,
      },
    });

    await tx.event.delete({ where: { id: duplicate.id } });
    await recomputeEventStats(tx, canonical.id);
  }, { timeout: 60_000 });

  return detail;
}

export async function mergeDuplicatePromoEvents(
  options: { dryRun?: boolean } = {},
): Promise<MergeResult> {
  const dryRun = !!options.dryRun;
  const result: MergeResult = { candidatePairs: 0, merged: 0, skipped: 0, details: [] };

  const events = await loadCandidateEvents();
  const pairs = findDuplicatePairs(events);
  result.candidatePairs = pairs.length;

  for (const [a, b] of pairs) {
    const { canonical, duplicate } = pickCanonical(a, b);
    try {
      const detail = await mergePair(canonical, duplicate, dryRun);
      result.details.push(detail);
      if (detail.action === 'merged' || detail.action === 'dry-run') result.merged++;
    } catch (err: any) {
      result.skipped++;
      result.details.push({
        canonicalId: canonical.id,
        canonicalName: canonical.name,
        duplicateId: duplicate.id,
        duplicateName: duplicate.name,
        fightsReparented: 0,
        fightsCollapsed: 0,
        ratingsMoved: 0,
        ratingsDropped: 0,
        action: 'skipped',
        skipReason: err?.message || String(err),
      });
    }
  }

  return result;
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
