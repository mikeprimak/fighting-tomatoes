const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// READ-ONLY. Find fights that are duplicate matchups on the same event under an
// order-insensitive key: (eventId, LEAST(f1,f2), GREATEST(f1,f2)) with count > 1.
// These are the swap-order dupes the order-sensitive unique constraint can't catch.
async function main() {
  const groups = await prisma.$queryRawUnsafe(`
    SELECT
      "eventId",
      LEAST("fighter1Id", "fighter2Id")    AS lo,
      GREATEST("fighter1Id", "fighter2Id") AS hi,
      COUNT(*)::int                         AS n,
      ARRAY_AGG("id"::text)                 AS fight_ids,
      ARRAY_AGG("fightStatus"::text)        AS statuses,
      ARRAY_AGG("createdAt")                AS created
    FROM "fights"
    GROUP BY "eventId", LEAST("fighter1Id","fighter2Id"), GREATEST("fighter1Id","fighter2Id")
    HAVING COUNT(*) > 1
    ORDER BY n DESC;
  `);

  console.log(`Swap-order duplicate matchup groups found: ${groups.length}\n`);
  for (const g of groups) {
    const ev = await prisma.event.findUnique({
      where: { id: g.eventId },
      select: { name: true, promotion: true, scraperType: true, eventStatus: true, date: true },
    });
    const f = await prisma.fighter.findMany({
      where: { id: { in: [g.lo, g.hi] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nm = (id) => { const x = f.find(z => z.id === id); return x ? `${x.firstName} ${x.lastName}`.trim() : id.slice(0,8); };
    console.log(`[${ev?.promotion}/${ev?.scraperType}] "${ev?.name}" (${ev?.eventStatus}, ${ev?.date?.toISOString().slice(0,10)})`);
    console.log(`   ${nm(g.lo)} vs ${nm(g.hi)} — ${g.n} rows`);
    for (let i = 0; i < g.fight_ids.length; i++) {
      console.log(`     - id=${g.fight_ids[i].slice(0,8)} status=${g.statuses[i]} created=${new Date(g.created[i]).toISOString()}`);
    }
    console.log('');
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
