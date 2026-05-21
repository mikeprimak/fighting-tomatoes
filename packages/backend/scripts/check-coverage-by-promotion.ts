/**
 * Per-promotion AI enrichment coverage audit for UPCOMING events.
 *
 * Reports how many fights in each promotion have aiTags populated vs not,
 * scoped to UPCOMING events (the cron's working set).
 */
import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  const rows = await p.$queryRaw<Array<{
    promotion: string;
    total: bigint;
    enriched: bigint;
    has_preview: bigint;
  }>>`
    SELECT
      e.promotion,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE f."aiTags" IS NOT NULL)::bigint AS enriched,
      COUNT(*) FILTER (WHERE f."aiPreviewShort" IS NOT NULL)::bigint AS has_preview
    FROM events e
    JOIN fights f ON f."eventId" = e.id
    WHERE e."eventStatus" = 'UPCOMING'
    GROUP BY e.promotion
    ORDER BY total DESC
  `;

  const header = `${'PROMOTION'.padEnd(30)} ${'TOTAL'.padStart(6)} ${'ENRICHED'.padStart(9)} ${'PREVIEW'.padStart(8)} ${'COVERAGE'.padStart(9)}`;
  console.log(header);
  console.log('-'.repeat(header.length));

  let grandTotal = 0n;
  let grandEnriched = 0n;
  for (const r of rows) {
    const pct = r.total === 0n ? 0 : Number((r.enriched * 100n) / r.total);
    const flag = pct === 0 ? ' ⚠️ ZERO' : pct < 25 ? ' ⚠️' : '';
    console.log(
      `${r.promotion.padEnd(30)} ${String(r.total).padStart(6)} ${String(r.enriched).padStart(9)} ${String(r.has_preview).padStart(8)} ${(pct + '%').padStart(8)}${flag}`,
    );
    grandTotal += r.total;
    grandEnriched += r.enriched;
  }
  console.log('-'.repeat(header.length));
  const grandPct = grandTotal === 0n ? 0 : Number((grandEnriched * 100n) / grandTotal);
  console.log(`${'TOTAL'.padEnd(30)} ${String(grandTotal).padStart(6)} ${String(grandEnriched).padStart(9)} ${''.padStart(8)} ${(grandPct + '%').padStart(8)}`);

  await p.$disconnect();
})();
