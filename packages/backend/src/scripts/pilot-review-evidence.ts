/** Read-only: list the fights driving one character token for one user. */
import { prisma } from '../lib/prisma';

const email = 'avocadomike@hotmail.com';
const token = process.argv[2] ?? 'low_output';

async function main() {
  const rows: any[] = await prisma.$queryRaw`
    SELECT f1."lastName" AS fighter1, f2."lastName" AS fighter2,
           e.name AS event, r.rating AS my_rating,
           ROUND(((f."averageRating" * f."totalRatings" - r.rating) /
                  NULLIF(f."totalRatings" - 1, 0))::numeric, 1) AS community_avg,
           f."totalRatings" - 1 AS community_n
    FROM fight_ratings r
    JOIN users u ON u.id = r."userId"
    JOIN fights f ON f.id = r."fightId"
    JOIN fighters f1 ON f1.id = f."fighter1Id"
    JOIN fighters f2 ON f2.id = f."fighter2Id"
    JOIN events e ON e.id = f."eventId"
    WHERE u.email = ${email}
      AND (f."aiPostFightTags"->'character'->'letdowns' ? ${token}
           OR f."aiPostFightTags"->'character'->>'actionLevel' = ${token}
           OR f."aiPostFightTags"->'character'->>'vibe' = ${token}
           OR f."aiPostFightTags"->'character'->>'drama' = ${token})
      AND f."totalRatings" > 5
    ORDER BY (r.rating - f."averageRating") DESC
    LIMIT 15
  `;
  for (const r of rows) {
    console.log(
      `me ${r.my_rating} vs crowd ${r.community_avg} (n=${r.community_n})  ${r.fighter1} vs ${r.fighter2}  [${r.event}]`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
