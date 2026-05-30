const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Phillips vs Barrett fight on BKFC 90 — should be 3rd-from-end (orderOnCard=3),
// currently tied at orderOnCard=2 with Till vs Chalmers. Till stays at 2.
const FIGHT_ID = 'ef21fe70'; // prefix; resolve full id below
const EVENT_ID = 'cef9ea1c-1075-4f88-94d8-ef3f0cecbbd3';

async function main() {
  const fight = await prisma.fight.findFirst({
    where: { eventId: EVENT_ID, id: { startsWith: FIGHT_ID } },
    select: {
      id: true, orderOnCard: true,
      fighter1: { select: { lastName: true } },
      fighter2: { select: { lastName: true } },
    },
  });
  if (!fight) { throw new Error('Barrett fight not found'); }
  console.log(`Found: ${fight.fighter1.lastName} vs ${fight.fighter2.lastName} | id=${fight.id} | orderOnCard=${fight.orderOnCard}`);

  if (fight.orderOnCard === 3) {
    console.log('Already orderOnCard=3, nothing to do.');
    await prisma.$disconnect();
    return;
  }
  if (fight.orderOnCard !== 2) {
    throw new Error(`Unexpected orderOnCard=${fight.orderOnCard}; aborting (expected 2).`);
  }

  // Confirm ord=3 slot is free on this event (among non-cancelled main card)
  const occupant = await prisma.fight.findFirst({
    where: { eventId: EVENT_ID, orderOnCard: 3, fightStatus: { not: 'CANCELLED' } },
    select: { id: true },
  });
  if (occupant) { throw new Error(`orderOnCard=3 already occupied by ${occupant.id}; aborting.`); }

  const updated = await prisma.fight.update({
    where: { id: fight.id },
    data: { orderOnCard: 3 },
    select: { id: true, orderOnCard: true },
  });
  console.log(`Updated ${updated.id} -> orderOnCard=${updated.orderOnCard}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
