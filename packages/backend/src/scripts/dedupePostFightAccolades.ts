/**
 * One-time back-correction: dedupe duplicated accolades in existing
 * `aiPostFightTags` rows.
 *
 * The post-fight AI enrichment occasionally emitted the same award twice — once
 * in `bonuses` and once in `fotyConsideration` — with different phrasings
 * ("Fight of the Night" + "2025 FOTN Winner"), so the app showed it twice.
 * The extractor now dedupes going forward (extractPostFightEnrichment.ts) and
 * the mobile screen dedupes at render, but this cleans the stored data too.
 *
 * Idempotent: re-running it is a no-op once rows are clean. Read-only audit by
 * default; pass `--apply` to write.
 *
 * Run from packages/backend so .env (prod DATABASE_URL) auto-loads:
 *   npx tsx src/scripts/dedupePostFightAccolades.ts          # audit
 *   npx tsx src/scripts/dedupePostFightAccolades.ts --apply  # write
 */

import { prisma } from '../lib/prisma';

function accoladeKey(raw: string): string {
  const s = raw.toLowerCase();
  if (/fight of the night|\bfotn\b/.test(s)) return 'FOTN';
  if (/performance of the night|\bpotn\b/.test(s)) return 'POTN';
  if (/knockout of the night|\bkotn\b/.test(s)) return 'KOTN';
  if (/submission of the night|\bsotn\b/.test(s)) return 'SOTN';
  if (/fight of the year|\bfoty\b/.test(s)) return 'FOTY';
  if (/performance of the year|\bpoty\b/.test(s)) return 'POTY';
  return s.trim().replace(/\s+/g, ' ');
}

async function main() {
  const apply = process.argv.includes('--apply');

  const fights = await prisma.fight.findMany({
    where: { aiPostFightTags: { not: null as any } },
    select: { id: true, aiPostFightTags: true },
  });

  let changed = 0;
  for (const f of fights) {
    const tags = f.aiPostFightTags as any;
    if (!tags || typeof tags !== 'object') continue;

    const rawBonuses: string[] = Array.isArray(tags.bonuses)
      ? tags.bonuses.filter((s: any) => typeof s === 'string' && s.trim())
      : [];
    const seen = new Set<string>();
    const bonuses: string[] = [];
    for (const b of rawBonuses) {
      const key = accoladeKey(b);
      if (seen.has(key)) continue;
      seen.add(key);
      bonuses.push(b);
    }

    let foty: string | null =
      typeof tags.fotyConsideration === 'string' && tags.fotyConsideration.trim()
        ? tags.fotyConsideration
        : null;
    if (foty && seen.has(accoladeKey(foty))) foty = null;

    const bonusesChanged = bonuses.length !== rawBonuses.length;
    const fotyChanged = foty !== (tags.fotyConsideration ?? null);
    if (!bonusesChanged && !fotyChanged) continue;

    changed++;
    console.log(
      `fight ${f.id}: bonuses ${JSON.stringify(rawBonuses)} -> ${JSON.stringify(bonuses)}` +
        (fotyChanged ? `, foty ${JSON.stringify(tags.fotyConsideration)} -> ${JSON.stringify(foty)}` : ''),
    );

    if (apply) {
      await prisma.fight.update({
        where: { id: f.id },
        data: { aiPostFightTags: { ...tags, bonuses, fotyConsideration: foty } as any },
      });
    }
  }

  console.log(
    `\n${changed} of ${fights.length} enriched fights ${apply ? 'updated' : 'have duplicate accolades (audit only — pass --apply to write)'}.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
