/**
 * Backfill SEO slugs on fighters / events / fights.
 * See docs/plans/programmatic-seo-2026-07-01.md (step 1).
 *
 * DRY-RUN BY DEFAULT — prints what it would write. Pass --apply to persist.
 *   npx tsx scripts/backfillSlugs.ts             # dry run (no writes)
 *   npx tsx scripts/backfillSlugs.ts --apply     # write slugs
 *   npx tsx scripts/backfillSlugs.ts --apply --only=fighters   # one table
 *
 * Idempotent: rows that already have a slug are skipped, and existing slugs seed
 * the uniqueness set so a re-run never collides with prior writes. Deterministic
 * ordering (createdAt, id) so suffix assignment is stable across runs.
 *
 * Uses the prisma singleton (never `new PrismaClient()` — see CLAUDE.md). Reads
 * DATABASE_URL from .env, which points at PROD Render Postgres, so --apply writes
 * to production. The migration 20260701000000_add_seo_slugs must be deployed first.
 */
import { prisma } from '../src/lib/prisma';
import {
  fighterSlugBase,
  eventSlugBase,
  fightSlugBase,
  ensureUniqueSlug,
} from '../src/lib/slug';

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const UPDATE_BATCH = 25; // small concurrency — single-row updates, gentle on the 256MB DB

type Plan = { id: string; slug: string; label: string; collided: boolean };

async function writePlans(table: 'fighter' | 'event' | 'fight', plans: Plan[]) {
  for (let i = 0; i < plans.length; i += UPDATE_BATCH) {
    const batch = plans.slice(i, i + UPDATE_BATCH);
    await Promise.all(
      batch.map((p) =>
        // @ts-expect-error dynamic model access is fine here
        prisma[table].update({ where: { id: p.id }, data: { slug: p.slug } }),
      ),
    );
    process.stdout.write(`  wrote ${Math.min(i + UPDATE_BATCH, plans.length)}/${plans.length}\r`);
  }
  if (plans.length) process.stdout.write('\n');
}

async function backfillFighters() {
  const rows = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true, slug: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean) as string[]);
  const plans: Plan[] = [];
  for (const r of rows) {
    if (r.slug) continue;
    const base = fighterSlugBase(r);
    const slug = ensureUniqueSlug(base, taken);
    plans.push({ id: r.id, slug, label: `${r.firstName} ${r.lastName}`, collided: slug !== base });
  }
  return { total: rows.length, plans };
}

async function backfillEvents() {
  const rows = await prisma.event.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean) as string[]);
  const plans: Plan[] = [];
  for (const r of rows) {
    if (r.slug) continue;
    const base = eventSlugBase(r);
    const slug = ensureUniqueSlug(base, taken);
    plans.push({ id: r.id, slug, label: r.name, collided: slug !== base });
  }
  return { total: rows.length, plans };
}

async function backfillFights() {
  const rows = await prisma.fight.findMany({
    select: {
      id: true,
      slug: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean) as string[]);
  const plans: Plan[] = [];
  for (const r of rows) {
    if (r.slug) continue;
    const base = fightSlugBase(r);
    const slug = ensureUniqueSlug(base, taken);
    plans.push({ id: r.id, slug, label: slug, collided: slug !== base });
  }
  return { total: rows.length, plans };
}

async function main() {
  console.log(`\nBackfill SEO slugs — mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}${ONLY ? ` — only: ${ONLY}` : ''}\n`);

  const jobs: Array<{ table: 'fighter' | 'event' | 'fight'; run: () => Promise<{ total: number; plans: Plan[] }> }> = [
    { table: 'fighter', run: backfillFighters },
    { table: 'event', run: backfillEvents },
    { table: 'fight', run: backfillFights },
  ];

  for (const job of jobs) {
    if (ONLY && ONLY !== `${job.table}s` && ONLY !== job.table) continue;
    const { total, plans } = await job.run();
    console.log(`${job.table}s: ${total} rows, ${plans.length} missing slug`);
    for (const p of plans.slice(0, 5)) console.log(`   e.g. ${p.label}  ->  ${p.slug}`);
    const suffixed = plans.filter((p) => p.collided);
    if (suffixed.length) {
      console.log(`   ${suffixed.length} needed a -N suffix (true slug collision, e.g. rematches/dupes):`);
      for (const p of suffixed.slice(0, 10)) console.log(`      ${p.label}  ->  ${p.slug}`);
    }
    if (APPLY && plans.length) {
      await writePlans(job.table, plans);
      console.log(`   ✓ ${plans.length} ${job.table} slugs written`);
    }
    console.log('');
  }

  await prisma.$disconnect();
  if (!APPLY) console.log('Dry run complete. Re-run with --apply to write.\n');
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
