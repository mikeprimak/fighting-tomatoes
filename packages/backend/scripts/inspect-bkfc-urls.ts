/** Inspect what ufcUrl values BKFC events have in the DB. */
import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  const rows = await p.event.findMany({
    where: { promotion: 'BKFC', eventStatus: 'UPCOMING' },
    select: { id: true, name: true, date: true, ufcUrl: true },
    orderBy: { date: 'asc' },
    take: 20,
  });
  for (const r of rows) {
    console.log(`${r.id}  ${r.date.toISOString().slice(0, 10)}  ${r.name.padEnd(50)}  ${r.ufcUrl ?? '(null)'}`);
  }
  await p.$disconnect();
})();
