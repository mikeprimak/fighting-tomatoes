/**
 * One-time data correction: legacy fightingtomatoes import bugs stored some
 * ratings as 11 (confirmed errors by Mike, 2026-06-11 pilot review). Clamp
 * them to 10 and recompute averageRating on the affected fights.
 *
 * Dry-run by default; pass --persist to write.
 */
import { prisma } from '../lib/prisma';

const persist = process.argv.includes('--persist');

async function main() {
  const bad: any[] = await prisma.$queryRaw`
    SELECT r.id, r."fightId", r."userId", r.rating, u.email,
           f."averageRating", f."totalRatings"
    FROM fight_ratings r
    JOIN users u ON u.id = r."userId"
    JOIN fights f ON f.id = r."fightId"
    WHERE r.rating > 10
    ORDER BY u.email, r."fightId"`;
  console.log(`ratings > 10: ${bad.length}`);
  const byUser = new Map<string, number>();
  for (const b of bad) byUser.set(b.email, (byUser.get(b.email) ?? 0) + 1);
  for (const [email, n] of byUser) console.log(`  ${email}: ${n}`);

  const fightIds = [...new Set(bad.map((b) => b.fightId))];
  console.log(`affected fights: ${fightIds.length}`);

  if (!persist) {
    console.log('\nDRY RUN — pass --persist to write.');
    await prisma.$disconnect();
    return;
  }

  const updated: number = await prisma.$executeRaw`
    UPDATE fight_ratings SET rating = 10 WHERE rating > 10`;
  console.log(`clamped ${updated} ratings to 10`);

  const recomputed: number = await prisma.$executeRaw`
    UPDATE fights f
    SET "averageRating" = sub.avg
    FROM (
      SELECT "fightId", AVG(rating)::float AS avg
      FROM fight_ratings
      WHERE "fightId" = ANY(${fightIds})
      GROUP BY "fightId"
    ) sub
    WHERE f.id = sub."fightId"`;
  console.log(`recomputed averageRating on ${recomputed} fights`);

  const left: any[] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM fight_ratings WHERE rating > 10`;
  console.log(`remaining > 10: ${left[0].n}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
