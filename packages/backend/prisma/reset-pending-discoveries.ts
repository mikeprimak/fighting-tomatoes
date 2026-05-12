/**
 * One-shot: delete PENDING BroadcastDiscovery rows that pre-date the
 * cardSection-aware extraction so we can replace them with section-specific
 * findings from the next run.
 *
 * Only touches PENDING — APPLIED / REJECTED / DUPLICATE stay (those represent
 * actual decisions and the 90-day dedupe key still includes channel + section,
 * so old REJECTED rows won't accidentally suppress new section-aware findings).
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const before = await p.broadcastDiscovery.count({ where: { status: 'PENDING' } });
  const r = await p.broadcastDiscovery.deleteMany({
    where: { status: 'PENDING', cardSection: null },
  });
  const after = await p.broadcastDiscovery.count({ where: { status: 'PENDING' } });
  console.log(`Wiped ${r.count} PENDING rows with null cardSection. PENDING: ${before} → ${after}.`);
  await p.$disconnect();
})();
