import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASELINE = new Date('2026-04-15T00:00:00Z');
const CAMPAIGN_START = new Date('2026-05-05T00:00:00Z');
const UFC328 = new Date('2026-05-09T00:00:00Z');
const CHECKPOINT = new Date('2026-05-01T00:00:00Z');
const NOW = new Date();
const D30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const D7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const D1 = new Date(Date.now() - 24 * 60 * 60 * 1000);

function fmt(n: number) { return n.toLocaleString(); }

async function main() {
  console.log('\n=== GOOD FIGHTS — Marketing Snapshot 2026-05-13 ===\n');

  const totalUsers = await prisma.user.count();
  const usersBeforeBaseline = await prisma.user.count({ where: { createdAt: { lt: BASELINE } } });
  const newSinceBaseline = await prisma.user.count({ where: { createdAt: { gte: BASELINE } } });
  const newSinceCheckpoint = await prisma.user.count({ where: { createdAt: { gte: CHECKPOINT } } });
  const newSinceCampaign = await prisma.user.count({ where: { createdAt: { gte: CAMPAIGN_START } } });
  const newSinceUFC328 = await prisma.user.count({ where: { createdAt: { gte: UFC328 } } });

  console.log('USERS (all-time, includes 2k migrated legacy):');
  console.log(`  Total users:                       ${fmt(totalUsers)}`);
  console.log(`  Pre-campaign baseline (Apr 15):   ${fmt(usersBeforeBaseline)}`);
  console.log(`  New since baseline (Apr 15):      ${fmt(newSinceBaseline)}`);
  console.log(`  New since checkpoint (May 1):     ${fmt(newSinceCheckpoint)}`);
  console.log(`  New during UFC 328 week (May 5+): ${fmt(newSinceCampaign)}`);
  console.log(`  New since UFC 328 (May 9+):       ${fmt(newSinceUFC328)}`);

  // Daily signup trend last 35 days
  const recentUsers = await prisma.user.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const byDay: Record<string, number> = {};
  for (const u of recentUsers) {
    const d = u.createdAt.toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  }
  console.log('\nDAILY SIGNUPS (last 35 days, zero days omitted):');
  for (const [d, n] of Object.entries(byDay)) {
    const marker = d === '2026-05-09' ? '  <-- UFC 328' : (d === '2026-05-05' ? '  <-- campaign start' : '');
    console.log(`  ${d}: ${'#'.repeat(Math.min(n, 40))} ${n}${marker}`);
  }

  // MAU / DAU using lastActive or lastLogin field if it exists
  // Fallback: count users who created a rating in the last 30d
  const mauByRating = await prisma.fightRating.findMany({
    where: { createdAt: { gte: D30 } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const dauByRating = await prisma.fightRating.findMany({
    where: { createdAt: { gte: D1 } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const wauByRating = await prisma.fightRating.findMany({
    where: { createdAt: { gte: D7 } },
    select: { userId: true },
    distinct: ['userId'],
  });
  console.log('\nACTIVITY (distinct users submitting ratings):');
  console.log(`  DAU-by-rating  (last 24h):  ${mauByRating.length === 0 ? 0 : fmt(dauByRating.length)}`);
  console.log(`  WAU-by-rating  (last 7d):   ${fmt(wauByRating.length)}`);
  console.log(`  MAU-by-rating  (last 30d):  ${fmt(mauByRating.length)}`);
  console.log('  (Real MAU is higher — many users open the app without rating.)');

  // Ratings volume
  const ratingsTotal = await prisma.fightRating.count();
  const ratingsSinceBaseline = await prisma.fightRating.count({ where: { createdAt: { gte: BASELINE } } });
  const ratingsSinceCampaign = await prisma.fightRating.count({ where: { createdAt: { gte: CAMPAIGN_START } } });
  const ratingsSinceUFC328 = await prisma.fightRating.count({ where: { createdAt: { gte: UFC328 } } });
  console.log('\nRATINGS:');
  console.log(`  Total all-time:               ${fmt(ratingsTotal)}`);
  console.log(`  Since baseline (Apr 15):      ${fmt(ratingsSinceBaseline)}`);
  console.log(`  Since campaign start (May 5): ${fmt(ratingsSinceCampaign)}`);
  console.log(`  Since UFC 328 (May 9+):       ${fmt(ratingsSinceUFC328)}`);

  // Look at signup source if there's a field for it
  // Try to find sample of recent users
  const last10 = await prisma.user.findMany({
    where: { createdAt: { gte: CAMPAIGN_START } },
    select: { createdAt: true, email: true, displayName: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  console.log('\nMOST-RECENT 15 SIGNUPS SINCE CAMPAIGN START:');
  for (const u of last10) {
    const d = u.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    const emailMasked = u.email ? u.email.replace(/(.{2}).*(@.*)/, '$1***$2') : '(no email)';
    console.log(`  ${d}  ${emailMasked}  ${u.displayName || ''}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
