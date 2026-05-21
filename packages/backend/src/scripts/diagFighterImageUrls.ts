/**
 * Diagnostic: for a shortlist of "stars the user reported as missing in the app",
 * probe (a) ALL Fighter rows matching their name (catch duplicates),
 *      (b) the actual profileImage URL stored in each row (HEAD to see if it serves).
 *
 * Does NOT write anything.
 * Run: pnpm tsx src/scripts/diagFighterImageUrls.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NAMES = [
  'McGregor',
  'Teixeira',
  'Diaz',
  'Silva',
  'Nurmagomedov',
  'Holloway',
  'Adesanya',
  'Jones',
  'Cormier',
];

async function head(url: string): Promise<{ status: number | string; ct: string; size: string }> {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return {
      status: r.status,
      ct: r.headers.get('content-type') ?? '-',
      size: r.headers.get('content-length') ?? '-',
    };
  } catch (e: any) {
    return { status: `ERR ${e.message}`, ct: '-', size: '-' };
  }
}

async function main() {
  console.log('=== Probe: stored profileImage URLs for star fighters ===\n');
  for (const lastName of NAMES) {
    const rows = await prisma.fighter.findMany({
      where: { lastName: { contains: lastName, mode: 'insensitive' } },
      select: {
        id: true, firstName: true, lastName: true,
        ufcAthleteSlug: true, profileImage: true,
        totalFights: true, totalRatings: true, averageRating: true,
        sport: true,
      },
      orderBy: [{ totalRatings: 'desc' }, { firstName: 'asc' }],
    });
    console.log(`-- ${lastName} (${rows.length} rows) --`);
    for (const r of rows) {
      const probe = r.profileImage ? await head(r.profileImage) : null;
      const probeStr = probe ? `HTTP ${probe.status}  ${probe.ct}  ${probe.size}B` : 'no profileImage';
      console.log(
        `  id=${r.id.slice(0, 8)}  ${r.firstName} ${r.lastName}  sport=${r.sport}  fights=${r.totalFights}  ratings=${r.totalRatings}`,
      );
      console.log(`    slug:    ${r.ufcAthleteSlug ?? 'NULL'}`);
      console.log(`    image:   ${r.profileImage ?? 'NULL'}`);
      console.log(`    probe:   ${probeStr}`);
    }
    console.log('');
  }

  console.log('=== Done. ===');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
