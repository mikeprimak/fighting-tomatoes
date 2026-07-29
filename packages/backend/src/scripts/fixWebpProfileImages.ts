/**
 * One-time backfill: re-host every WebP Fighter.profileImage as a
 * Satori-decodable raster on R2.
 *
 * Context (2026-07-28): the RAF daily scraper wrote raw Webflow .webp URLs
 * into profileImage for ~158 fighters. Satori (next/og) can't decode WebP, so
 * any fight OG image involving those fighters 500'd until the route learned to
 * degrade (e6aa91ae). The parser now routes fighter images through
 * uploadFighterImage, which transcodes; this script fixes the rows already
 * written.
 *
 * Idempotent and safe to re-run: only touches rows whose profileImage still
 * points at a .webp or Webflow URL, and only writes when the upload actually
 * produced a different, non-WebP URL.
 *
 * Run from packages/backend (DATABASE_URL points at prod per repo rules):
 *   npx tsx src/scripts/fixWebpProfileImages.ts           # dry run
 *   npx tsx src/scripts/fixWebpProfileImages.ts --apply   # write changes
 */

import { prisma } from '../lib/prisma';
import { uploadFighterImage } from '../services/imageStorage';

const APPLY = process.argv.includes('--apply');

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      OR: [
        { profileImage: { contains: '.webp' } },
        { profileImage: { contains: 'website-files' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, profileImage: true },
    orderBy: { lastName: 'asc' },
  });

  console.log(`${fighters.length} fighters with WebP/Webflow profileImage${APPLY ? '' : ' (DRY RUN)'}\n`);

  let fixed = 0;
  let failedCount = 0;
  for (const f of fighters) {
    const name = `${f.firstName} ${f.lastName}`.trim();
    const source = f.profileImage!;
    if (!APPLY) {
      console.log(`would fix  ${name}  ${source.slice(0, 90)}`);
      continue;
    }

    const newUrl = await uploadFighterImage(source, name);
    // uploadFighterImage falls back to the source URL on any failure — only
    // persist a real improvement, never rewrite a row with its own bad URL.
    if (newUrl && newUrl !== source && !newUrl.includes('.webp')) {
      await prisma.fighter.update({ where: { id: f.id }, data: { profileImage: newUrl } });
      fixed++;
      console.log(`fixed  ${name}  ->  ${newUrl}`);
    } else {
      failedCount++;
      console.log(`FAILED  ${name}  (upload fell back to source)`);
    }
  }

  if (APPLY) {
    console.log(`\n${fixed} fixed, ${failedCount} failed of ${fighters.length}`);
  }
  await prisma.$disconnect();
  process.exit(failedCount > 0 ? 1 : 0);
}

main();
