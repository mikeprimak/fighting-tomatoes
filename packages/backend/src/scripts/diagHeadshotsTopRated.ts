/**
 * Diagnostic: top-rated UFC fighters missing headshots + live ufc.com probe
 *
 * Does NOT write anything. Two probes:
 *   1. SQL: top 30 fighters with profileImage=NULL ranked by UFC-fight rating impact.
 *   2. Puppeteer: for a fixed shortlist of stars (mcgregor, teixeira, +others),
 *      fetch the ufc.com og:image and report what came back.
 *
 * Run: pnpm tsx src/scripts/diagHeadshotsTopRated.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  fetchUFCAthleteHeadshot,
  deriveUFCAthleteSlug,
  launchAthleteBrowser,
  closeAthleteBrowser,
} from '../services/scrapeUFCAthleteHeadshot';

const prisma = new PrismaClient();

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  ufcAthleteSlug: string | null;
  ufc_fights: bigint;
  total_ratings: bigint;
  avg_rating: number | null;
}

async function topRatedMissing(): Promise<Candidate[]> {
  return prisma.$queryRaw<Candidate[]>`
    SELECT f.id, f."firstName", f."lastName", f."ufcAthleteSlug",
           COUNT(fi.id)::bigint AS ufc_fights,
           COALESCE(SUM(fi."totalRatings"),0)::bigint AS total_ratings,
           AVG(NULLIF(fi."averageRating",0))::float AS avg_rating
    FROM fighters f
    JOIN fights fi ON (fi."fighter1Id"=f.id OR fi."fighter2Id"=f.id)
    JOIN events e ON e.id = fi."eventId"
    WHERE f."profileImage" IS NULL
      AND (e."scraperType"='ufc' OR e.name ~* '^UFC[: ]' OR e.name ~* '^UFC$')
    GROUP BY f.id, f."firstName", f."lastName", f."ufcAthleteSlug"
    ORDER BY total_ratings DESC NULLS LAST, avg_rating DESC NULLS LAST
    LIMIT 30
  `;
}

async function findByName(first: string, last: string) {
  return prisma.fighter.findFirst({
    where: { firstName: { equals: first, mode: 'insensitive' }, lastName: { equals: last, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, ufcAthleteSlug: true, profileImage: true },
  });
}

async function main() {
  console.log('========================================');
  console.log('Diagnostic: top-rated UFC missing-headshot candidates + live probes');
  console.log('========================================\n');

  console.log('Top 30 fighters with profileImage=NULL, ordered by UFC-fight rating impact:\n');
  const top = await topRatedMissing();
  if (top.length === 0) {
    console.log('  (none - no fighters missing headshots on rated UFC fights)');
  } else {
    console.log('  rank | total_ratings | ufc_fights | avg_rating | slug?   | name');
    console.log('  -----+---------------+------------+------------+---------+-----');
    top.forEach((c, i) => {
      const r = String(i + 1).padStart(4);
      const tr = String(c.total_ratings).padStart(13);
      const uf = String(c.ufc_fights).padStart(10);
      const av = (c.avg_rating ?? 0).toFixed(1).padStart(10);
      const slug = (c.ufcAthleteSlug ? 'yes' : 'NO ').padEnd(7);
      console.log(`  ${r} | ${tr} | ${uf} | ${av} | ${slug} | ${c.firstName} ${c.lastName}`);
    });
  }

  const probeNames: Array<{ first: string; last: string }> = [
    { first: 'Conor', last: 'McGregor' },
    { first: 'Glover', last: 'Teixeira' },
    { first: 'Nate', last: 'Diaz' },
    { first: 'Anderson', last: 'Silva' },
    { first: 'Khabib', last: 'Nurmagomedov' },
  ];
  for (const c of top.slice(0, 5)) {
    if (!probeNames.some(p => p.last.toLowerCase() === c.lastName.toLowerCase())) {
      probeNames.push({ first: c.firstName, last: c.lastName });
    }
  }

  console.log(`\nLive ufc.com probes for ${probeNames.length} fighters:\n`);
  const handle = await launchAthleteBrowser();
  try {
    for (const name of probeNames) {
      const fighter = await findByName(name.first, name.last);
      const fullName = `${name.first} ${name.last}`;
      const dbState = fighter
        ? `id=${fighter.id.slice(0, 8)}  slug=${fighter.ufcAthleteSlug ?? 'NULL'}  hasImage=${!!fighter.profileImage}`
        : 'NOT IN DB';
      const slug = fighter?.ufcAthleteSlug || deriveUFCAthleteSlug(fullName);
      const r = await fetchUFCAthleteHeadshot(slug, handle);
      const imgInfo = r.imageUrl ? r.imageUrl.slice(0, 100) + (r.imageUrl.length > 100 ? '...' : '') : '-';
      console.log(`  ${fullName}`);
      console.log(`    db:      ${dbState}`);
      console.log(`    probe:   slug=${slug}  status=${r.status}`);
      console.log(`    finalUrl:${r.finalUrl ?? '-'}`);
      console.log(`    og:image:${imgInfo}`);
      if (r.errorMessage) console.log(`    error:   ${r.errorMessage}`);
      console.log('');
    }
  } finally {
    await closeAthleteBrowser(handle);
  }

  console.log('========================================');
  console.log('Done.');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
