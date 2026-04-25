import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TIER_CASE_SQL = `CASE
  WHEN ext_count >= 100 THEN 100
  WHEN ext_count >= 50 THEN 50
  WHEN ext_count >= 25 THEN 25
  WHEN ext_count >= 10 THEN 10
  WHEN ext_count >= 5 THEN 5
  WHEN ext_count >= 1 THEN 1
  ELSE 0
END`;

async function main() {
  const reviewResult = await prisma.$executeRawUnsafe(`
    WITH ext AS (
      SELECT fr.id AS review_id,
        COUNT(rv.*) FILTER (WHERE rv."isUpvote" = true AND rv."userId" != fr."userId") AS ext_count
      FROM fight_reviews fr
      LEFT JOIN review_votes rv ON rv."reviewId" = fr.id
      GROUP BY fr.id, fr."userId"
    )
    UPDATE fight_reviews fr
    SET "lastNotifiedLikeCount" = ${TIER_CASE_SQL}
    FROM ext
    WHERE fr.id = ext.review_id;
  `);
  console.log(`[backfill] fight_reviews updated: ${reviewResult}`);

  const commentResult = await prisma.$executeRawUnsafe(`
    WITH ext AS (
      SELECT pfc.id AS comment_id,
        COUNT(pfcv.*) FILTER (WHERE pfcv."userId" != pfc."userId") AS ext_count
      FROM pre_fight_comments pfc
      LEFT JOIN pre_fight_comment_votes pfcv ON pfcv."commentId" = pfc.id
      GROUP BY pfc.id, pfc."userId"
    )
    UPDATE pre_fight_comments pfc
    SET "lastNotifiedLikeCount" = ${TIER_CASE_SQL}
    FROM ext
    WHERE pfc.id = ext.comment_id;
  `);
  console.log(`[backfill] pre_fight_comments updated: ${commentResult}`);

  // Verify by tier
  const reviewBuckets = await prisma.$queryRawUnsafe<Array<{ tier: number; count: bigint }>>(`
    SELECT "lastNotifiedLikeCount" AS tier, COUNT(*)::bigint AS count
    FROM fight_reviews
    GROUP BY "lastNotifiedLikeCount"
    ORDER BY tier;
  `);
  console.log(`[backfill] fight_reviews tier distribution:`, reviewBuckets.map(r => ({ tier: r.tier, count: Number(r.count) })));

  const commentBuckets = await prisma.$queryRawUnsafe<Array<{ tier: number; count: bigint }>>(`
    SELECT "lastNotifiedLikeCount" AS tier, COUNT(*)::bigint AS count
    FROM pre_fight_comments
    GROUP BY "lastNotifiedLikeCount"
    ORDER BY tier;
  `);
  console.log(`[backfill] pre_fight_comments tier distribution:`, commentBuckets.map(r => ({ tier: r.tier, count: Number(r.count) })));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
