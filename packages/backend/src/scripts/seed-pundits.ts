/**
 * Seed the pundit registry with known combat-sports voices + their aliases.
 *
 * Idempotent: upserts by slug, so re-running after adding names to SEED_PUNDITS
 * only writes the new ones. Existing rows have their aliases/role/excluded flag
 * refreshed from the seed list, but rows created by the cron (unknown speakers
 * the extractor found in the wild) are left alone — they aren't in the list.
 *
 * Usage (from packages/backend/):
 *   npx tsx src/scripts/seed-pundits.ts            (dry run)
 *   npx tsx src/scripts/seed-pundits.ts --persist
 */
import { prisma } from '../lib/prisma';
import { SEED_PUNDITS, punditSlug } from '../services/aiEnrichment/postFight/punditRegistry';

async function main() {
  const persist = process.argv.includes('--persist');

  let created = 0;
  let updated = 0;

  for (const p of SEED_PUNDITS) {
    const slug = punditSlug(p.name);
    const existing = await prisma.pundit.findUnique({ where: { slug }, select: { id: true } });

    if (!persist) {
      console.log(`${existing ? 'update' : 'create'}  ${slug.padEnd(24)} role=${p.role}${p.excluded ? ' EXCLUDED' : ''}`);
      existing ? updated++ : created++;
      continue;
    }

    await prisma.pundit.upsert({
      where: { slug },
      create: {
        name: p.name,
        slug,
        role: p.role,
        aliases: p.aliases ?? [],
        excluded: !!p.excluded,
      },
      update: {
        name: p.name,
        role: p.role,
        aliases: p.aliases ?? [],
        excluded: !!p.excluded,
      },
    });
    existing ? updated++ : created++;
  }

  console.log(
    `\n${persist ? 'Seeded' : 'DRY RUN'}: ${created} created, ${updated} updated (${SEED_PUNDITS.length} in registry).`,
  );
  if (!persist) console.log('Re-run with --persist to write.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
