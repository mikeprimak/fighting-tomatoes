import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  const r = await p.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'fights' AND column_name LIKE 'aiPostFight%'
    ORDER BY column_name
  `;
  console.log('Post-fight columns on prod DB:', r.map((x) => x.column_name));
  await p.$disconnect();
})();
