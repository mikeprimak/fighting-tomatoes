/**
 * Read-only inventory of AI tag coverage + vocabulary in prod.
 * Run: pnpm -C packages/backend exec tsx src/scripts/tag-inventory.ts
 */
import { prisma } from '../lib/prisma';

async function main() {
  // --- Coverage counts ---
  const [counts]: any = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS total_fights,
      COUNT(*) FILTER (WHERE "aiTags" IS NOT NULL)::int AS with_ai_tags,
      COUNT(*) FILTER (WHERE "aiPostFightTags" IS NOT NULL)::int AS with_post_tags,
      COUNT(*) FILTER (WHERE "fightStatus" = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE "fightStatus" = 'COMPLETED' AND "aiPostFightTags" IS NOT NULL)::int AS completed_with_post,
      COUNT(*) FILTER (WHERE "totalRatings" > 0)::int AS rated_fights,
      COUNT(*) FILTER (WHERE "totalRatings" > 0 AND "aiTags" IS NOT NULL)::int AS rated_with_ai_tags,
      COUNT(*) FILTER (WHERE "totalRatings" > 0 AND "aiPostFightTags" IS NOT NULL)::int AS rated_with_post_tags
    FROM fights
  `;
  console.log('=== COVERAGE ===');
  console.log(counts);

  // --- Pre-fight styleTags vocabulary ---
  const styleTags: any[] = await prisma.$queryRaw`
    SELECT tag, COUNT(*)::int AS n
    FROM fights, jsonb_array_elements_text("aiTags"->'styleTags') AS tag
    WHERE "aiTags" ? 'styleTags'
    GROUP BY tag ORDER BY n DESC LIMIT 60
  `;
  console.log('\n=== PRE-FIGHT styleTags (top 60) ===');
  for (const r of styleTags) console.log(`${String(r.n).padStart(5)}  ${r.tag}`);

  // --- Pace distribution ---
  const pace: any[] = await prisma.$queryRaw`
    SELECT "aiTags"->>'pace' AS pace, COUNT(*)::int AS n
    FROM fights WHERE "aiTags" IS NOT NULL
    GROUP BY 1 ORDER BY n DESC
  `;
  console.log('\n=== PRE-FIGHT pace ===');
  console.log(pace);

  // --- Top-level keys present in aiTags (schema drift check: historic campaign vs cron) ---
  const tagKeys: any[] = await prisma.$queryRaw`
    SELECT key, COUNT(*)::int AS n
    FROM fights, jsonb_object_keys("aiTags") AS key
    WHERE "aiTags" IS NOT NULL
    GROUP BY key ORDER BY n DESC
  `;
  console.log('\n=== aiTags top-level keys ===');
  for (const r of tagKeys) console.log(`${String(r.n).padStart(6)}  ${r.key}`);

  // --- Top-level keys in aiPostFightTags ---
  const postKeys: any[] = await prisma.$queryRaw`
    SELECT key, COUNT(*)::int AS n
    FROM fights, jsonb_object_keys("aiPostFightTags") AS key
    WHERE "aiPostFightTags" IS NOT NULL
    GROUP BY key ORDER BY n DESC
  `;
  console.log('\n=== aiPostFightTags top-level keys ===');
  for (const r of postKeys) console.log(`${String(r.n).padStart(6)}  ${r.key}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
