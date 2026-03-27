const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function fixPflTimes() {
  // Fix PFL Pittsburgh - date was scraped as 2099-01-01 (fallback), actual date is March 28, 2026
  // Prelims: 7:00 PM ET = 23:00 UTC, Main Card: 10:00 PM ET = 02:00 UTC (Mar 29)
  const pittsburgh = await p.event.updateMany({
    where: { name: { contains: 'Pittsburgh' }, promotion: 'PFL' },
    data: {
      date: new Date('2026-03-28T00:00:00.000Z'),
      prelimStartTime: new Date('2026-03-28T23:00:00.000Z'),
      mainStartTime: new Date('2026-03-29T02:00:00.000Z'),
    }
  });
  console.log('Fixed PFL Pittsburgh date + times:', pittsburgh.count, 'events');

  // Cancel the bogus "PFL Africa Pretoria Tickets" duplicate event
  const ticketEvents = await p.event.findMany({
    where: { promotion: 'PFL', name: { contains: 'Tickets' } }
  });
  for (const evt of ticketEvents) {
    await p.fight.updateMany({
      where: { eventId: evt.id, fightStatus: { in: ['UPCOMING', 'LIVE'] } },
      data: { fightStatus: 'CANCELLED' }
    });
    await p.event.update({
      where: { id: evt.id },
      data: { eventStatus: 'COMPLETED' }
    });
    console.log('Cancelled bogus ticket event:', evt.name);
  }

  await p.$disconnect();
}

fixPflTimes();
