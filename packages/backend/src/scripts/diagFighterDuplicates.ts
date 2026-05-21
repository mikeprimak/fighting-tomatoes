/**
 * Diagnostic: find duplicate Fighter rows where one has an image and the other doesn't.
 *
 * Strategy:
 *   1. Confirm the Choi case: print all rows where lastName ~ 'choi'.
 *   2. Build a "normalized name key" (lowercase, strip spaces/hyphens/punctuation,
 *      strip diacritics) and group Fighter rows by it. Surface groups where:
 *        - >= 2 rows exist, AND
 *        - at least one has profileImage, at least one does not.
 *   3. For each group, show which row has fight references (so we know which is
 *      the "real" one used by the app).
 *
 * Does NOT write anything.
 * Run: pnpm tsx src/scripts/diagFighterDuplicates.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Row {
  id: string;
  firstName: string;
  lastName: string;
  ufcAthleteSlug: string | null;
  profileImage: string | null;
  sport: string;
  norm_key: string;
  fight_count: bigint;
  ratings_sum: bigint;
}

async function main() {
  console.log('=== 1. Choi rows (confirm Dooho vs Doo Ho duplicate) ===\n');
  const chois = await prisma.$queryRaw<Row[]>`
    SELECT f.id, f."firstName", f."lastName", f."ufcAthleteSlug", f."profileImage", f.sport::text,
           '' AS norm_key,
           (SELECT COUNT(*) FROM fights fi WHERE fi."fighter1Id"=f.id OR fi."fighter2Id"=f.id)::bigint AS fight_count,
           COALESCE((SELECT SUM(fi."totalRatings") FROM fights fi WHERE fi."fighter1Id"=f.id OR fi."fighter2Id"=f.id),0)::bigint AS ratings_sum
    FROM fighters f
    WHERE LOWER(f."lastName") = 'choi'
    ORDER BY ratings_sum DESC, f."firstName"
  `;
  for (const r of chois) {
    console.log(`  id=${r.id.slice(0,8)}  "${r.firstName}" "${r.lastName}"  slug=${r.ufcAthleteSlug ?? 'NULL'}`);
    console.log(`    fights=${r.fight_count}  ratings=${r.ratings_sum}  image=${r.profileImage ? 'YES' : 'NO'}`);
    if (r.profileImage) console.log(`    url:   ${r.profileImage}`);
  }

  console.log('\n=== 2. Top duplicate groups: one has image, others do not ===\n');
  // Normalize: lowercase firstName+lastName, remove non-alphanumeric, strip diacritics.
  // Postgres `unaccent` is in an extension; use translate for the common diacritics
  // we see (Brazilian Portuguese mostly).
  const groups = await prisma.$queryRaw<Array<{
    norm_key: string;
    n_rows: bigint;
    n_with_image: bigint;
    n_without_image: bigint;
    total_ratings: bigint;
    names: string;
    ids: string;
  }>>`
    WITH normalized AS (
      SELECT
        f.id,
        f."firstName" || ' ' || f."lastName" AS full_name,
        f."profileImage",
        regexp_replace(
          lower(translate(
            f."firstName" || f."lastName",
            'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'
          )),
          '[^a-z0-9]', '', 'g'
        ) AS norm_key,
        COALESCE((SELECT SUM(fi."totalRatings") FROM fights fi WHERE fi."fighter1Id"=f.id OR fi."fighter2Id"=f.id),0) AS ratings_sum
      FROM fighters f
    )
    SELECT
      norm_key,
      COUNT(*)::bigint AS n_rows,
      SUM(CASE WHEN "profileImage" IS NOT NULL THEN 1 ELSE 0 END)::bigint AS n_with_image,
      SUM(CASE WHEN "profileImage" IS NULL THEN 1 ELSE 0 END)::bigint AS n_without_image,
      SUM(ratings_sum)::bigint AS total_ratings,
      string_agg(full_name || ' (' || CASE WHEN "profileImage" IS NULL THEN 'no-img' ELSE 'img' END || ')', ' | ' ORDER BY ratings_sum DESC) AS names,
      string_agg(id, ',') AS ids
    FROM normalized
    WHERE norm_key <> ''
    GROUP BY norm_key
    HAVING COUNT(*) >= 2
       AND SUM(CASE WHEN "profileImage" IS NOT NULL THEN 1 ELSE 0 END) >= 1
       AND SUM(CASE WHEN "profileImage" IS NULL THEN 1 ELSE 0 END) >= 1
    ORDER BY total_ratings DESC
    LIMIT 40
  `;

  if (groups.length === 0) {
    console.log('  (none)');
  } else {
    console.log(`Found ${groups.length} duplicate groups (top 40 shown, ordered by combined ratings)\n`);
    console.log(`  total_ratings | rows | with_img | names`);
    for (const g of groups) {
      console.log(`  ${String(g.total_ratings).padStart(13)} | ${String(g.n_rows).padStart(4)} | ${String(g.n_with_image).padStart(8)} | ${g.names}`);
    }
  }

  console.log('\n=== 3. Total scope ===\n');
  const scope = await prisma.$queryRaw<Array<{ n_groups: bigint; n_rows: bigint; n_orphan_rows: bigint }>>`
    WITH normalized AS (
      SELECT
        f.id,
        f."profileImage",
        regexp_replace(
          lower(translate(
            f."firstName" || f."lastName",
            'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'
          )),
          '[^a-z0-9]', '', 'g'
        ) AS norm_key
      FROM fighters f
    ),
    grouped AS (
      SELECT norm_key,
             COUNT(*) AS n_rows,
             SUM(CASE WHEN "profileImage" IS NULL THEN 1 ELSE 0 END) AS n_no_img,
             SUM(CASE WHEN "profileImage" IS NOT NULL THEN 1 ELSE 0 END) AS n_with_img
      FROM normalized WHERE norm_key <> ''
      GROUP BY norm_key
    )
    SELECT
      COUNT(*) FILTER (WHERE n_rows >= 2 AND n_with_img >= 1 AND n_no_img >= 1)::bigint AS n_groups,
      SUM(n_rows) FILTER (WHERE n_rows >= 2 AND n_with_img >= 1 AND n_no_img >= 1)::bigint AS n_rows,
      SUM(n_no_img) FILTER (WHERE n_rows >= 2 AND n_with_img >= 1 AND n_no_img >= 1)::bigint AS n_orphan_rows
    FROM grouped
  `;
  const s = scope[0];
  console.log(`  Duplicate groups (mix of has-image / no-image): ${s.n_groups}`);
  console.log(`  Total rows in those groups:                     ${s.n_rows}`);
  console.log(`  "Orphan" rows (no image, has same-name sibling): ${s.n_orphan_rows}`);
  console.log('\n=== Done. ===');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
