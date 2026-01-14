/**
 * Count fights that need historical outcome data
 * Groups by promotion to understand the scope of the backfill
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function countFightsNeedingOutcomes() {
  console.log('\n📊 FIGHT OUTCOME BACKFILL ANALYSIS\n');
  console.log('='.repeat(60));

  // Get all promotions
  const promotions = await prisma.event.findMany({
    select: { promotion: true },
    distinct: ['promotion']
  });

  const promotionList = promotions.map(p => p.promotion);
  console.log(`\nFound ${promotionList.length} promotions: ${promotionList.join(', ')}\n`);

  let totalFightsNeedingOutcomes = 0;
  let totalCompletedFights = 0;
  let totalUpcomingFights = 0;

  const results = [];

  for (const promotion of promotionList) {
    // Count fights WITHOUT outcomes (completed events, no winner set)
    const fightsNeedingOutcomes = await prisma.fight.count({
      where: {
        event: {
          promotion: promotion,
          date: { lt: new Date() }  // Past events
        },
        winner: null,
        isCancelled: false
      }
    });

    // Count fights WITH outcomes
    const fightsWithOutcomes = await prisma.fight.count({
      where: {
        event: {
          promotion: promotion,
          date: { lt: new Date() }
        },
        winner: { not: null }
      }
    });

    // Count upcoming fights (no outcome expected)
    const upcomingFights = await prisma.fight.count({
      where: {
        event: {
          promotion: promotion,
          date: { gte: new Date() }
        }
      }
    });

    // Count total events
    const pastEvents = await prisma.event.count({
      where: {
        promotion: promotion,
        date: { lt: new Date() }
      }
    });

    results.push({
      promotion,
      pastEvents,
      fightsNeedingOutcomes,
      fightsWithOutcomes,
      upcomingFights
    });

    totalFightsNeedingOutcomes += fightsNeedingOutcomes;
    totalCompletedFights += fightsWithOutcomes;
    totalUpcomingFights += upcomingFights;
  }

  // Sort by fights needing outcomes (descending)
  results.sort((a, b) => b.fightsNeedingOutcomes - a.fightsNeedingOutcomes);

  // Print results
  console.log('FIGHTS NEEDING HISTORICAL OUTCOMES:\n');
  console.log('Promotion'.padEnd(25) + 'Past Events'.padEnd(15) + 'Need Outcomes'.padEnd(15) + 'Have Outcomes'.padEnd(15) + 'Upcoming');
  console.log('-'.repeat(80));

  for (const r of results) {
    console.log(
      r.promotion.padEnd(25) +
      String(r.pastEvents).padEnd(15) +
      String(r.fightsNeedingOutcomes).padEnd(15) +
      String(r.fightsWithOutcomes).padEnd(15) +
      String(r.upcomingFights)
    );
  }

  console.log('-'.repeat(80));
  console.log(
    'TOTAL'.padEnd(25) +
    String(results.reduce((s, r) => s + r.pastEvents, 0)).padEnd(15) +
    String(totalFightsNeedingOutcomes).padEnd(15) +
    String(totalCompletedFights).padEnd(15) +
    String(totalUpcomingFights)
  );

  console.log('\n' + '='.repeat(60));
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total fights needing outcome data: ${totalFightsNeedingOutcomes}`);
  console.log(`   Total fights already with outcomes: ${totalCompletedFights}`);
  console.log(`   Total upcoming fights: ${totalUpcomingFights}`);
  console.log(`   Completion rate: ${((totalCompletedFights / (totalCompletedFights + totalFightsNeedingOutcomes)) * 100).toFixed(1)}%\n`);

  // Sample some fights to understand the data
  console.log('\n📋 SAMPLE FIGHTS NEEDING OUTCOMES (first 5 per promotion):\n');

  for (const r of results.slice(0, 5)) {
    if (r.fightsNeedingOutcomes > 0) {
      const sampleFights = await prisma.fight.findMany({
        where: {
          event: {
            promotion: r.promotion,
            date: { lt: new Date() }
          },
          winner: null,
          isCancelled: false
        },
        include: {
          event: { select: { name: true, date: true } },
          fighter1: { select: { firstName: true, lastName: true } },
          fighter2: { select: { firstName: true, lastName: true } }
        },
        take: 5,
        orderBy: { event: { date: 'desc' } }
      });

      console.log(`\n${r.promotion}:`);
      for (const f of sampleFights) {
        const f1Name = `${f.fighter1.firstName} ${f.fighter1.lastName}`;
        const f2Name = `${f.fighter2.firstName} ${f.fighter2.lastName}`;
        const eventDate = f.event.date.toISOString().split('T')[0];
        console.log(`   ${eventDate} | ${f.event.name} | ${f1Name} vs ${f2Name}`);
      }
    }
  }

  await prisma.$disconnect();
}

countFightsNeedingOutcomes().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
