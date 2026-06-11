/** Read-only: size the enrichment pilot for one user's rated fights. */
import { prisma } from '../lib/prisma';

async function main() {
  const rows: any[] = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS rated,
      COUNT(*) FILTER (WHERE f."aiPostFightSummary" IS NOT NULL)::int AS with_recap,
      COUNT(*) FILTER (WHERE f."aiPostFightTags" IS NOT NULL)::int AS with_post_tags
    FROM fight_ratings r
    JOIN fights f ON f.id = r."fightId"
    JOIN users u ON u.id = r."userId"
    WHERE u.email = 'avocadomike@hotmail.com' AND f."fightStatus" = 'COMPLETED'
  `;
  console.log(rows[0]);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
