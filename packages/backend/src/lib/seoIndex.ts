/**
 * SEO indexing gate — the single source of truth for "should Google index this
 * page?" across Fighter / Event / Fight. See docs/plans/programmatic-seo-2026-07-01.md
 * (step 3). Used two ways so they can never drift:
 *   1. The bulk sitemap endpoint (`/api/sitemap/:type`) filters by these `where`
 *      clauses — the sitemap IS the whitelist of pages that passed the gate.
 *   2. Each detail endpoint reports `shouldIndex` for its row via `isIndexable()`
 *      (a `count` scoped to that id against the SAME `where`), so the web page can
 *      emit `robots: noindex` on pages the sitemap omits.
 *
 * Philosophy (from the plan): better a few thousand strong pages than 16k thin
 * ones — thin pages at scale trigger a sitewide Helpful-Content demotion. Every
 * gate reuses the 0.5 AI-confidence floor already enforced app-wide.
 *
 * NOTE: `Event.totalRatings` is a DEAD field (always 0 — see
 * lesson_dataset_aggregates_dishonest). Event fan-engagement lives on the FIGHTS,
 * so the event gate keys off "has at least one indexable fight", never the event
 * row's rating aggregate.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { getHiddenPromotions } from '../config/hiddenPromotions';

export type SeoEntity = 'fighter' | 'event' | 'fight';

/** `NOT` clause excluding currently-shelved promotions (mirrors the events list route). */
function hiddenPromotionNot(): Array<{ promotion: { contains: string; mode: 'insensitive' } }> {
  return getHiddenPromotions().map((p) => ({
    promotion: { contains: p, mode: 'insensitive' as const },
  }));
}

/**
 * Fighter is indexable when the AI profile cleared the confidence floor AND the
 * fighter has real substance (a record OR fan ratings) — not an empty stub.
 */
export function fighterIndexWhere(): Prisma.FighterWhereInput {
  return {
    slug: { not: null },
    aiProfileConfidence: { gte: 0.5 },
    OR: [
      { totalRatings: { gt: 0 } },
      { wins: { gt: 0 } },
      { losses: { gt: 0 } },
      { draws: { gt: 0 } },
      { noContests: { gt: 0 } },
    ],
  };
}

/**
 * Core fight-quality predicate (no event-visibility scoping) — reused inside the
 * event gate's `fights.some`. A fight is quality content when it's COMPLETED with
 * a result + a post-fight recap, OR still to come with a confident preview.
 */
function fightIndexCore(): Prisma.FightWhereInput {
  return {
    slug: { not: null },
    OR: [
      { fightStatus: 'COMPLETED', winner: { not: null }, aiPostFightSummary: { not: null } },
      { fightStatus: { in: ['UPCOMING', 'LIVE'] }, aiConfidence: { gte: 0.5 } },
    ],
  };
}

/** Fight is indexable when it clears {@link fightIndexCore} AND its event is visible / not shelved. */
export function fightIndexWhere(): Prisma.FightWhereInput {
  return {
    ...fightIndexCore(),
    event: { isVisible: true, NOT: hiddenPromotionNot() },
  };
}

/**
 * Event is indexable when it's visible / not shelved AND carries genuinely
 * indexable content: at least one indexable fight (the card is real), OR a
 * card-wide AI summary, OR active broadcasts, OR it's still upcoming/live
 * (how-to-watch intent). "Has an indexable fight" is a stronger quality signal
 * than raw card size — and, unlike a relation-count threshold, it's expressible
 * in a Prisma `where` so the sitemap and the per-page gate share one predicate.
 */
export function eventIndexWhere(): Prisma.EventWhereInput {
  return {
    slug: { not: null },
    isVisible: true,
    NOT: hiddenPromotionNot(),
    OR: [
      { fights: { some: fightIndexCore() } },
      { aiEventSummary: { not: null } },
      { broadcasts: { some: { isActive: true } } },
      { eventStatus: { in: ['UPCOMING', 'LIVE'] } },
    ],
  };
}

export function indexWhereFor(entity: SeoEntity): Prisma.FighterWhereInput | Prisma.EventWhereInput | Prisma.FightWhereInput {
  switch (entity) {
    case 'fighter': return fighterIndexWhere();
    case 'event': return eventIndexWhere();
    case 'fight': return fightIndexWhere();
  }
}

/**
 * Does the single row with this id (already resolved to a real UUID) pass its
 * entity's index gate? Runs the SAME `where` as the sitemap scoped to `{ id }`,
 * so the per-page `robots` tag and the sitemap can never disagree.
 */
export async function isIndexable(prisma: PrismaClient, entity: SeoEntity, id: string): Promise<boolean> {
  if (entity === 'fighter') {
    return (await prisma.fighter.count({ where: { AND: [{ id }, fighterIndexWhere()] } })) > 0;
  }
  if (entity === 'event') {
    return (await prisma.event.count({ where: { AND: [{ id }, eventIndexWhere()] } })) > 0;
  }
  return (await prisma.fight.count({ where: { AND: [{ id }, fightIndexWhere()] } })) > 0;
}
