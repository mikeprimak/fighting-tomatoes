/**
 * Triage query for the historic enrichment campaign.
 *
 * Orders fights by rating count (engagement proxy) and reports what's missing
 * on each: AI enrichment, outcome data, structural metadata. The output guides
 * scope decisions (top 50 vs top 500 vs top 2000) and lets us see whether the
 * candidate fights cluster in scrapeable promotions or not.
 *
 * Usage:
 *   npx tsx scripts/historic-triage.ts [limit=50]
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const limit = Number(process.argv[2] ?? 50);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    rating_count: bigint;
    avg_rating: number | null;
    fighter1: string;
    fighter2: string;
    event_name: string;
    event_date: Date;
    scraper_type: string | null;
    winner: string | null;
    method: string | null;
    weight_class: string | null;
    is_title: boolean;
    card_type: string | null;
    ai_enriched_at: Date | null;
    ai_preview_short: string | null;
    has_ai_tags: boolean;
  }>>`
    SELECT
      f.id,
      COUNT(r.id)::bigint AS rating_count,
      AVG(r.rating)::float AS avg_rating,
      COALESCE(TRIM(f1."firstName" || ' ' || f1."lastName"), '?') AS fighter1,
      COALESCE(TRIM(f2."firstName" || ' ' || f2."lastName"), '?') AS fighter2,
      e.name AS event_name,
      e.date AS event_date,
      e."scraperType" AS scraper_type,
      f.winner,
      f.method,
      f."weightClass"::text AS weight_class,
      f."isTitle" AS is_title,
      f."cardType" AS card_type,
      f."aiEnrichedAt" AS ai_enriched_at,
      f."aiPreviewShort" AS ai_preview_short,
      (f."aiTags" IS NOT NULL) AS has_ai_tags
    FROM fights f
    INNER JOIN fight_ratings r ON r."fightId" = f.id
    LEFT JOIN fighters f1 ON f1.id = f."fighter1Id"
    LEFT JOIN fighters f2 ON f2.id = f."fighter2Id"
    INNER JOIN events e ON e.id = f."eventId"
    GROUP BY f.id, f1."firstName", f1."lastName", f2."firstName", f2."lastName", e.name, e.date, e."scraperType"
    ORDER BY rating_count DESC
    LIMIT ${limit}
  `;

  console.log(`\nTop ${rows.length} most-rated fights:\n`);

  let missingWinner = 0;
  let missingMethod = 0;
  let missingWeightClass = 0;
  let missingAiTags = 0;
  let missingAiPreview = 0;
  let promotionCounts: Record<string, number> = {};

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const gaps: string[] = [];
    if (!r.winner) { gaps.push('winner'); missingWinner++; }
    if (!r.method) { gaps.push('method'); missingMethod++; }
    if (!r.weight_class) { gaps.push('weightClass'); missingWeightClass++; }
    if (!r.has_ai_tags) { gaps.push('aiTags'); missingAiTags++; }
    if (!r.ai_preview_short) { gaps.push('aiPreview'); missingAiPreview++; }
    const promo = r.scraper_type ?? '(null)';
    promotionCounts[promo] = (promotionCounts[promo] ?? 0) + 1;
    const dateStr = r.event_date.toISOString().slice(0, 10);
    const avg = r.avg_rating?.toFixed(1) ?? '?';
    console.log(
      `${(i + 1).toString().padStart(3)}. [${r.rating_count.toString().padStart(4)}r ${avg}★] ${r.fighter1} vs ${r.fighter2}`,
    );
    console.log(
      `      ${dateStr} · ${r.event_name} · ${promo}${r.is_title ? ' · TITLE' : ''}`,
    );
    if (gaps.length > 0) console.log(`      MISSING: ${gaps.join(', ')}`);
  }

  console.log(`\n=== Coverage gaps across top ${rows.length} ===`);
  console.log(`  winner missing:      ${missingWinner} (${pct(missingWinner, rows.length)}%)`);
  console.log(`  method missing:      ${missingMethod} (${pct(missingMethod, rows.length)}%)`);
  console.log(`  weightClass missing: ${missingWeightClass} (${pct(missingWeightClass, rows.length)}%)`);
  console.log(`  aiTags missing:      ${missingAiTags} (${pct(missingAiTags, rows.length)}%)`);
  console.log(`  aiPreview missing:   ${missingAiPreview} (${pct(missingAiPreview, rows.length)}%)`);

  console.log(`\n=== Promotion distribution ===`);
  const sortedPromos = Object.entries(promotionCounts).sort(([, a], [, b]) => b - a);
  for (const [promo, count] of sortedPromos) {
    console.log(`  ${promo}: ${count} (${pct(count, rows.length)}%)`);
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
