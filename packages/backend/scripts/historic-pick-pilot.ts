/**
 * Emit the pilot batch of fight IDs + minimal metadata for the historic
 * enrichment campaign. Used to seed the search/fetch loop.
 *
 * Usage:
 *   npx tsx scripts/historic-pick-pilot.ts [limit=5] [offset=0]
 *
 * For multi-window parallelization, partition the candidate list by offset:
 *   Window A: npx tsx scripts/historic-pick-pilot.ts 250 0     # ranks 1-250
 *   Window B: npx tsx scripts/historic-pick-pilot.ts 250 250   # ranks 251-500
 *   Window C: npx tsx scripts/historic-pick-pilot.ts 250 500   # ranks 501-750
 *   Window D: npx tsx scripts/historic-pick-pilot.ts 250 750   # ranks 751-1000
 *
 * Each window writes its own fightIds; the writer's UPSERT is idempotent so
 * even if two windows collide on a fightId, the second write is a harmless
 * overwrite of the first.
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const limit = Number(process.argv[2] ?? 5);
  const offset = Number(process.argv[3] ?? 0);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    rating_count: bigint;
    fighter1: string;
    fighter2: string;
    event_name: string;
    event_date: Date;
  }>>`
    SELECT
      f.id,
      COUNT(r.id)::bigint AS rating_count,
      TRIM(f1."firstName" || ' ' || f1."lastName") AS fighter1,
      TRIM(f2."firstName" || ' ' || f2."lastName") AS fighter2,
      e.name AS event_name,
      e.date AS event_date
    FROM fights f
    INNER JOIN fight_ratings r ON r."fightId" = f.id
    LEFT JOIN fighters f1 ON f1.id = f."fighter1Id"
    LEFT JOIN fighters f2 ON f2.id = f."fighter2Id"
    INNER JOIN events e ON e.id = f."eventId"
    WHERE f."aiTags" IS NULL
    GROUP BY f.id, f1."firstName", f1."lastName", f2."firstName", f2."lastName", e.name, e.date
    ORDER BY rating_count DESC, f.id ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  console.log(JSON.stringify(
    rows.map((r) => ({
      fightId: r.id,
      ratings: Number(r.rating_count),
      fighter1: r.fighter1,
      fighter2: r.fighter2,
      eventName: r.event_name,
      eventDate: r.event_date.toISOString().slice(0, 10),
    })),
    null,
    2,
  ));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
