/**
 * One-off: rename the `sportsnet` broadcast channel to "Sportsnet+" and point
 * its homepage at sportsnetplus.ca (the actual UFC Canada streaming service).
 *
 * Idempotent — safe to re-run.
 *
 *   pnpm tsx packages/backend/prisma/update-sportsnet-plus.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  const updated = await prisma.broadcastChannel.update({
    where: { slug: 'sportsnet' },
    data: {
      name: 'Sportsnet+',
      homepageUrl: 'https://www.sportsnetplus.ca/',
    },
    select: { id: true, slug: true, name: true, homepageUrl: true },
  });
  console.log('Updated:', updated);
  await prisma.$disconnect();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
