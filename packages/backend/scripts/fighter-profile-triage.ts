/**
 * Triage query for the fighter-profile AI enrichment campaign (Phase 5).
 *
 * Ranks fighters by an engagement proxy so we can pick the "important fighter"
 * threshold off the real distribution instead of guessing. Engagement is
 * computed straight from fight_ratings (a fighter inherits every rating on any
 * of their fights) plus follower count — we do NOT trust the denormalized
 * Fighter.totalRatings column, which may not be maintained.
 *
 * Reports: a top-N list, how many fighters clear each candidate threshold, and
 * how many already have an aiProfile (so re-runs show remaining backfill work).
 *
 * Usage:
 *   npx tsx scripts/fighter-profile-triage.ts [limit=60]
 */
import { PrismaClient } from '@prisma/client';

interface Row {
  id: string;
  name: string;
  nickname: string | null;
  rating_count: bigint;
  follower_count: bigint;
  total_fights: bigint;
  is_active: boolean;
  has_ai_profile: boolean;
}

async function main() {
  const prisma = new PrismaClient();
  const limit = Number(process.argv[2] ?? 60);

  // rating_count: ratings across every fight this fighter appears in (either corner).
  // follower_count: rows in user_fighter_follows.
  const rows = await prisma.$queryRaw<Row[]>`
    WITH fighter_ratings AS (
      SELECT fighter_id, COUNT(*)::bigint AS rating_count
      FROM (
        SELECT f."fighter1Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
        UNION ALL
        SELECT f."fighter2Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
      ) x
      WHERE fighter_id IS NOT NULL
      GROUP BY fighter_id
    ),
    fighter_follows AS (
      SELECT "fighterId" AS fighter_id, COUNT(*)::bigint AS follower_count
      FROM user_fighter_follows
      GROUP BY "fighterId"
    ),
    fighter_fights AS (
      SELECT fighter_id, COUNT(*)::bigint AS total_fights
      FROM (
        SELECT "fighter1Id" AS fighter_id FROM fights
        UNION ALL
        SELECT "fighter2Id" AS fighter_id FROM fights
      ) y
      WHERE fighter_id IS NOT NULL
      GROUP BY fighter_id
    )
    SELECT
      ft.id,
      TRIM(ft."firstName" || ' ' || ft."lastName") AS name,
      ft.nickname,
      COALESCE(fr.rating_count, 0)::bigint   AS rating_count,
      COALESCE(ff.follower_count, 0)::bigint  AS follower_count,
      COALESCE(fg.total_fights, 0)::bigint    AS total_fights,
      ft."isActive"                           AS is_active,
      (ft."aiProfile" IS NOT NULL)            AS has_ai_profile
    FROM fighters ft
    LEFT JOIN fighter_ratings fr ON fr.fighter_id = ft.id
    LEFT JOIN fighter_follows  ff ON ff.fighter_id = ft.id
    LEFT JOIN fighter_fights   fg ON fg.fighter_id = ft.id
    ORDER BY (COALESCE(fr.rating_count, 0) + COALESCE(ff.follower_count, 0) * 3) DESC,
             rating_count DESC
    LIMIT ${limit}
  `;

  // Threshold distribution over the WHOLE table (separate aggregate query).
  const ratingThresholds = [5, 10, 25, 50, 100, 200];
  const dist = await prisma.$queryRaw<Array<{ rating_count: bigint; follower_count: bigint }>>`
    WITH fighter_ratings AS (
      SELECT fighter_id, COUNT(*)::bigint AS rating_count
      FROM (
        SELECT f."fighter1Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
        UNION ALL
        SELECT f."fighter2Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
      ) x
      WHERE fighter_id IS NOT NULL
      GROUP BY fighter_id
    ),
    fighter_follows AS (
      SELECT "fighterId" AS fighter_id, COUNT(*)::bigint AS follower_count
      FROM user_fighter_follows
      GROUP BY "fighterId"
    )
    SELECT
      COALESCE(fr.rating_count, 0)::bigint  AS rating_count,
      COALESCE(ff.follower_count, 0)::bigint AS follower_count
    FROM fighters ft
    LEFT JOIN fighter_ratings fr ON fr.fighter_id = ft.id
    LEFT JOIN fighter_follows  ff ON ff.fighter_id = ft.id
  `;

  const totalFighters = dist.length;
  const withAnyRating = dist.filter((r) => Number(r.rating_count) > 0).length;
  const withAnyFollower = dist.filter((r) => Number(r.follower_count) > 0).length;

  console.log(`\nTop ${rows.length} fighters by engagement (ratings + 3×followers):\n`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nick = r.nickname ? ` "${r.nickname}"` : '';
    const flags = [
      r.is_active ? 'active' : 'inactive',
      `${r.total_fights}f`,
      r.has_ai_profile ? 'HAS_PROFILE' : '',
    ].filter(Boolean).join(' · ');
    console.log(
      `${(i + 1).toString().padStart(3)}. [${r.rating_count.toString().padStart(5)}r ${r.follower_count.toString().padStart(3)}fol] ${r.name}${nick}  (${flags})`,
    );
  }

  console.log(`\n=== Population ===`);
  console.log(`  total fighters:        ${totalFighters}`);
  console.log(`  with ≥1 rating:        ${withAnyRating} (${pct(withAnyRating, totalFighters)}%)`);
  console.log(`  with ≥1 follower:      ${withAnyFollower} (${pct(withAnyFollower, totalFighters)}%)`);

  console.log(`\n=== How many fighters clear each rating threshold ===`);
  for (const t of ratingThresholds) {
    const n = dist.filter((r) => Number(r.rating_count) >= t).length;
    console.log(`  ratings ≥ ${t.toString().padStart(3)}: ${n}`);
  }

  console.log(`\n=== Candidate scope ("rating ≥ X OR any follower") ===`);
  for (const t of [5, 10, 25, 50]) {
    const n = dist.filter((r) => Number(r.rating_count) >= t || Number(r.follower_count) > 0).length;
    console.log(`  ratings ≥ ${t.toString().padStart(3)} OR followed: ${n} fighters`);
  }

  await prisma.$disconnect();
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '0';
  return ((num / denom) * 100).toFixed(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
