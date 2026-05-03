import { Prisma, PrismaClient, Fight } from '@prisma/client';

type AnyPrismaClient = PrismaClient | Prisma.TransactionClient;

/**
 * Upsert a fight identified by (eventId, fighter1Id, fighter2Id) in a way
 * that's robust to fighter1/fighter2 ordering swaps between scrapes.
 *
 * The Fight model's unique constraint on (eventId, fighter1Id, fighter2Id)
 * is order-sensitive — Prisma treats (event, A, B) and (event, B, A) as
 * different keys. If a scraper extracts a matchup with the fighters on one
 * side one day and the reverse the next (because the source CMS swapped
 * which fighter it bills first), a direct `prisma.fight.upsert` keyed on
 * that triple won't match the existing row and silently writes a duplicate.
 *
 * This helper finds an existing row in EITHER ordering, updates it (also
 * canonicalizing fighter1Id/fighter2Id to the current scrape's order so
 * subsequent direct-keyed upserts hit cleanly), or creates a new row when
 * neither ordering exists.
 *
 * Caller passes `update` and `create` data shaped exactly as it would for
 * a normal `prisma.fight.upsert` — the helper passes them straight through.
 */
export async function upsertFightSwapAware(
  prisma: AnyPrismaClient,
  identity: { eventId: string; fighter1Id: string; fighter2Id: string },
  updateData: Prisma.FightUncheckedUpdateInput,
  createData: Prisma.FightUncheckedCreateInput,
): Promise<Fight> {
  const { eventId, fighter1Id, fighter2Id } = identity;

  const existing = await prisma.fight.findFirst({
    where: {
      eventId,
      OR: [
        { fighter1Id, fighter2Id },
        { fighter1Id: fighter2Id, fighter2Id: fighter1Id },
      ],
    },
    select: { id: true, fighter1Id: true },
  });

  if (existing) {
    const needsReorder = existing.fighter1Id !== fighter1Id;
    return prisma.fight.update({
      where: { id: existing.id },
      data: {
        ...updateData,
        ...(needsReorder ? { fighter1Id, fighter2Id } : {}),
      },
    });
  }

  return prisma.fight.create({ data: createData });
}
