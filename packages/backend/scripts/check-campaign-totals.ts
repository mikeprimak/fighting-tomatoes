/** Quick totals on the historic enrichment campaign. */
import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const aiTagsCount = await p.fight.count({ where: { aiTags: { not: undefined as any } } });
  // Workaround for Prisma JSON null check
  const enrichedCount = await p.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM fights WHERE "aiTags" IS NOT NULL
  `;
  const previewCount = await p.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM fights WHERE "aiPreview" IS NOT NULL
  `;
  const postFightCount = await p.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM fights WHERE "aiPostFightSummary" IS NOT NULL
  `;
  const remaining = await p.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM fights f
    INNER JOIN fight_ratings r ON r."fightId" = f.id
    WHERE f."aiTags" IS NULL
  `;
  console.log('Enriched (aiTags):       ', Number(enrichedCount[0].count));
  console.log('Pre-fight long-form:     ', Number(previewCount[0].count));
  console.log('Post-fight long-form:    ', Number(postFightCount[0].count));
  console.log('Rated fights still null: ', Number(remaining[0].count));
  await p.$disconnect();
})();
