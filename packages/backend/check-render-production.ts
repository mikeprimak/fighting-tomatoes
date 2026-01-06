import { PrismaClient } from '@prisma/client';

// Use environment variable for database URL - NEVER hardcode credentials!
// Usage: DATABASE_URL="postgresql://..." npx ts-node check-render-production.ts
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://user:pass@host/db" npx ts-node check-render-production.ts');
  process.exit(1);
}

const prisma = new PrismaClient();

async function checkProductionData() {
  console.log('🔍 Checking Render PRODUCTION Database...\n');
  console.log('📍 Database: dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewapp\n');

  try {
    // Check for stuck live events
    console.log('=== STUCK LIVE EVENTS ===\n');

    const stuckEvents = await prisma.event.findMany({
      where: {
        hasStarted: true,
        isComplete: false
      },
      select: {
        id: true,
        name: true,
        date: true,
        hasStarted: true,
        isComplete: true,
        createdAt: true,
        _count: {
          select: {
            fights: true
          }
        }
      },
      orderBy: { date: 'desc' },
      take: 20
    });

    console.log(`Found ${stuckEvents.length} events with hasStarted=true and isComplete=false:\n`);

    stuckEvents.forEach(event => {
      const daysAgo = Math.floor((Date.now() - event.date.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`- ${event.name}`);
      console.log(`  Date: ${event.date.toISOString().split('T')[0]}`);
      console.log(`  Total Fights: ${event._count.fights}`);
      console.log(`  Days ago: ${daysAgo}`);
      console.log('');
    });

    // Check for stuck fights
    console.log('\n=== STUCK LIVE FIGHTS (from past events) ===\n');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stuckFights = await prisma.fight.findMany({
      where: {
        hasStarted: true,
        isComplete: false,
        event: {
          date: {
            lt: oneDayAgo
          }
        }
      },
      select: {
        id: true,
        event: {
          select: {
            name: true,
            date: true
          }
        },
        fighter1: {
          select: { lastName: true }
        },
        fighter2: {
          select: { lastName: true }
        }
      },
      take: 20,
      orderBy: {
        event: {
          date: 'desc'
        }
      }
    });

    console.log(`Found ${stuckFights.length} fights with hasStarted=true and isComplete=false from past events:\n`);

    stuckFights.forEach(fight => {
      const daysAgo = Math.floor((Date.now() - fight.event.date.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`- ${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`);
      console.log(`  Event: ${fight.event.name}`);
      console.log(`  Date: ${fight.event.date.toISOString().split('T')[0]} (${daysAgo} days ago)`);
      console.log('');
    });

    // Check total event/fight counts
    console.log('\n=== DATABASE STATS ===\n');

    const totalEvents = await prisma.event.count();
    const completedEvents = await prisma.event.count({ where: { isComplete: true } });
    const totalFights = await prisma.fight.count();
    const completedFights = await prisma.fight.count({ where: { isComplete: true } });

    console.log(`Total Events: ${totalEvents} (${completedEvents} complete, ${totalEvents - completedEvents} incomplete)`);
    console.log(`Total Fights: ${totalFights} (${completedFights} complete, ${totalFights - completedFights} incomplete)`);

    // Check upcoming events
    console.log('\n=== UPCOMING EVENTS (Next 7 days) ===\n');

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcomingEvents = await prisma.event.findMany({
      where: {
        date: {
          gte: now,
          lte: sevenDaysFromNow
        }
      },
      select: {
        name: true,
        date: true,
        isComplete: true,
        _count: {
          select: { fights: true }
        }
      },
      orderBy: { date: 'asc' }
    });

    if (upcomingEvents.length === 0) {
      console.log('No events scheduled in next 7 days');
    } else {
      upcomingEvents.forEach(event => {
        console.log(`- ${event.name}`);
        console.log(`  Date: ${event.date.toISOString().split('T')[0]}`);
        console.log(`  Fights: ${event._count.fights}`);
        console.log(`  Complete: ${event.isComplete ? 'Yes' : 'No'}`);
        console.log('');
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductionData();
