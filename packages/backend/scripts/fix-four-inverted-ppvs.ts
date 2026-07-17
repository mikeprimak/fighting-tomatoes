/**
 * Targeted fix for 4 verified-inverted numbered PPVs that the §8 name-signal audit can't
 * reach (numbered PPVs carry no fighter names). Each was confirmed inverted by eye:
 * the named main event sits at the HIGHEST orderOnCard and ratings climb monotonically.
 *
 *   UFC 259 (2021-03-06)  main = Blachowicz vs Adesanya
 *   UFC 273 (2022-04-09)  main = Volkanovski vs "Korean Zombie"
 *   UFC 276 (2022-07-02)  main = Adesanya vs Cannonier
 *   UFC 277 (2022-07-30)  main = Pena vs Nunes
 *
 * Applies the self-inverse transform newOrder = (minOrder + maxOrder) - oldOrder as a single
 * set-based UPDATE per event (same transform as fix-legacy-event-order.ts). orderOnCard is in
 * no unique key, and the transform is a bijection over each event's order set, so it's safe.
 *
 * Usage:  npx tsx scripts/fix-four-inverted-ppvs.ts          (DRY RUN)
 *         npx tsx scripts/fix-four-inverted-ppvs.ts --apply   (writes to prod)
 */
import { prisma } from '../src/lib/prisma';

const APPLY = process.argv.includes('--apply');
const TARGETS = ['UFC 259', 'UFC 273', 'UFC 276', 'UFC 277'];

async function main() {
  for (const name of TARGETS) {
    const e = await prisma.event.findFirst({
      where: { name: { startsWith: name }, promotion: 'UFC' },
      include: { fights: { orderBy: { orderOnCard: 'asc' }, select: {
        orderOnCard: true, fighter1: { select: { lastName: true } }, fighter2: { select: { lastName: true } },
      } } },
    });
    if (!e) { console.log(`${name}: NOT FOUND — skipping`); continue; }
    const orders = e.fights.map(f => f.orderOnCard);
    const min = Math.min(...orders), max = Math.max(...orders);
    const mainBefore = e.fights[0];                      // current ord=1
    const mainAfter = e.fights[e.fights.length - 1];     // becomes ord=1 after flip

    console.log(`\n=== ${e.name} (min=${min} max=${max}, ${e.fights.length} fights) ===`);
    console.log(`  before: ord1 = ${mainBefore.fighter1?.lastName} vs ${mainBefore.fighter2?.lastName}`);
    console.log(`  after:  ord1 = ${mainAfter.fighter1?.lastName} vs ${mainAfter.fighter2?.lastName}`);

    if (APPLY) {
      // newOrder = (min+max) - oldOrder, applied atomically across the event's fights.
      const res = await prisma.$executeRaw`
        UPDATE "fights" SET "orderOnCard" = ${min + max} - "orderOnCard"
        WHERE "eventId" = ${e.id}`;
      console.log(`  APPLIED: ${res} fight rows updated`);
    } else {
      console.log(`  (dry run — pass --apply to write)`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
