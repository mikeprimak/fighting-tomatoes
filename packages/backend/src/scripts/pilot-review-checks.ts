import { prisma } from '../lib/prisma';
async function main() {
  const over: any[] = await prisma.$queryRaw`
    SELECT r.rating, COUNT(*)::int AS n
    FROM fight_ratings r JOIN users u ON u.id = r."userId"
    WHERE u.email = 'avocadomike@hotmail.com' AND r.rating > 10
    GROUP BY r.rating ORDER BY r.rating`;
  console.log('avocadomike ratings > 10:', JSON.stringify(over));
  const overAll: any[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM fight_ratings WHERE rating > 10`;
  console.log('ALL users ratings > 10:', JSON.stringify(overAll));
  const legacy: any[] = await prisma.$queryRaw`
    SELECT (e."scraperType" IS NULL) AS legacy, COUNT(*)::int AS n
    FROM fight_ratings r
    JOIN users u ON u.id = r."userId"
    JOIN fights f ON f.id = r."fightId"
    JOIN events e ON e.id = f."eventId"
    WHERE u.email = 'avocadomike@hotmail.com'
      AND f."aiPostFightTags"->'character'->'letdowns' ? 'low_output'
    GROUP BY 1`;
  console.log('low_output fights by legacy(scraperType null):', JSON.stringify(legacy));
  const legacyAllRated: any[] = await prisma.$queryRaw`
    SELECT (e."scraperType" IS NULL) AS legacy, COUNT(*)::int AS n
    FROM fight_ratings r
    JOIN users u ON u.id = r."userId"
    JOIN fights f ON f.id = r."fightId"
    JOIN events e ON e.id = f."eventId"
    WHERE u.email = 'avocadomike@hotmail.com'
    GROUP BY 1`;
  console.log('ALL his rated fights by legacy:', JSON.stringify(legacyAllRated));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
