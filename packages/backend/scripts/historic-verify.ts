/** Verify a batch of historic enrichment writes by fightId. */
import { PrismaClient } from '@prisma/client';

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('usage: historic-verify.ts <fightId> [<fightId> ...]');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const rows = await prisma.fight.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      aiPreviewShort: true,
      aiConfidence: true,
      aiEnrichedAt: true,
      aiTags: true,
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
  });
  for (const r of rows) {
    const t = r.aiTags as any;
    const f1 = `${r.fighter1?.firstName} ${r.fighter1?.lastName}`;
    const f2 = `${r.fighter2?.firstName} ${r.fighter2?.lastName}`;
    console.log(`  ${f1} vs ${f2}`);
    console.log(`    conf=${r.aiConfidence} pace=${t?.pace ?? 'null'} stakes=${t?.stakes?.length ?? 0} storylines=${t?.storylines?.length ?? 0} styleTags=${t?.styleTags?.length ?? 0}`);
    console.log(`    preview: ${r.aiPreviewShort?.slice(0, 120) ?? '(null)'}`);
  }
  await prisma.$disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
