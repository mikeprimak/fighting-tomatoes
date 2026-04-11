const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ids = [
    '566bdf8b-e5ed-4e8a-9234-f565e8e8908c', // Baumgardner vs Shin
    '8a9ead55-657b-4175-845b-b63829f46581', // MVP MMA 1
    '89b8c5c8-42ee-4208-89c0-c5e3211c2563', // Han vs Holm II
    '79655c08-ba05-49d0-a85f-efbb719781b8', // Usyk vs Rico
    'adf72728-7404-48d9-a614-4577c1e24c5c', // Zuffa Boxing 6
    'ea6c3c0b-e273-4bb0-8cfc-215b6d87a716', // Davis vs Albright II
    '0ab9a03f-53d1-4343-8a17-9a570b888420', // Foster vs Ford
  ];
  const events = await prisma.event.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, bannerImage: true,
      fights: {
        where: { fightStatus: { not: 'CANCELLED' } },
        orderBy: { orderOnCard: 'asc' },
        select: {
          orderOnCard: true,
          fightStatus: true,
          fighter1: { select: { firstName: true, lastName: true } },
          fighter2: { select: { firstName: true, lastName: true } },
        },
      },
      _count: { select: { fights: true } },
    },
  });
  for (const e of events) {
    console.log('='.repeat(70));
    console.log(e.name);
    console.log(`  banner: ${(e.bannerImage || '(null)').slice(0, 90)}`);
    console.log(`  upcoming: ${e.fights.length} / total: ${e._count.fights}`);
    e.fights.forEach(f => {
      const f1 = `${f.fighter1.firstName || ''} ${f.fighter1.lastName || ''}`.trim();
      const f2 = `${f.fighter2.firstName || ''} ${f.fighter2.lastName || ''}`.trim();
      console.log(`    [${f.orderOnCard}] ${f.fightStatus.padEnd(8)} ${f1} vs ${f2}`);
    });
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
