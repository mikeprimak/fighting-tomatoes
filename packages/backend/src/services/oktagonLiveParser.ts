/**
 * OKTAGON MMA Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, and results
 */

import { PrismaClient } from '@prisma/client';
import { OktagonEventData, OktagonFightData } from './oktagonLiveScraper';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Find fight by fighter names (matches by last name)
 */
function findFightByFighters(fights: any[], fighter1Name: string, fighter2Name: string) {
  const normalize = (name: string) => name.toLowerCase().trim();

  return fights.find(fight => {
    const f1LastName = fight.fighter1.lastName.toLowerCase();
    const f2LastName = fight.fighter2.lastName.toLowerCase();
    const fighter1Last = normalize(fighter1Name);
    const fighter2Last = normalize(fighter2Name);

    return (
      (f1LastName === fighter1Last && f2LastName === fighter2Last) ||
      (f1LastName === fighter2Last && f2LastName === fighter1Last)
    );
  });
}

/**
 * Determine winner fighter ID from winner name
 */
function getWinnerFighterId(winnerLastName: string, fighter1: any, fighter2: any): string | null {
  if (!winnerLastName) return null;

  const winnerLast = winnerLastName.toLowerCase().trim();

  if (fighter1.lastName.toLowerCase() === winnerLast) {
    return fighter1.id;
  }
  if (fighter2.lastName.toLowerCase() === winnerLast) {
    return fighter2.id;
  }

  // Try partial match
  if (fighter1.lastName.toLowerCase().includes(winnerLast) ||
      winnerLast.includes(fighter1.lastName.toLowerCase())) {
    return fighter1.id;
  }
  if (fighter2.lastName.toLowerCase().includes(winnerLast) ||
      winnerLast.includes(fighter2.lastName.toLowerCase())) {
    return fighter2.id;
  }

  return null;
}

/**
 * Notify users about the next upcoming fight
 */
async function notifyNextFight(eventId: string, completedFightOrder: number): Promise<void> {
  try {
    const nextFight = await prisma.fight.findFirst({
      where: {
        eventId,
        orderOnCard: { lt: completedFightOrder },
        hasStarted: false,
        isComplete: false,
      },
      orderBy: { orderOnCard: 'desc' },
      include: {
        fighter1: { select: { firstName: true, lastName: true } },
        fighter2: { select: { firstName: true, lastName: true } },
      },
    });

    if (nextFight) {
      // Handle single-name fighters (stored in lastName with empty firstName)
      const formatName = (f: { firstName: string; lastName: string }) =>
        f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
      const fighter1Name = formatName(nextFight.fighter1);
      const fighter2Name = formatName(nextFight.fighter2);

      console.log(`    🔔 Next fight notification: ${fighter1Name} vs ${fighter2Name}`);

      const { notifyFightStartViaRules } = await import('./notificationService');
      await notifyFightStartViaRules(nextFight.id, fighter1Name, fighter2Name);
    }
  } catch (error) {
    console.error(`    ❌ Failed to notify next fight:`, error);
  }
}

// ============== MAIN PARSER FUNCTION ==============

/**
 * Parse and update database with live OKTAGON event data
 */
export async function parseOktagonLiveData(
  liveData: OktagonEventData,
  eventId: string
): Promise<{ fightsUpdated: number; eventUpdated: boolean }> {
  console.log(`\n📊 [OKTAGON PARSER] Processing live data for: ${liveData.eventName}`);

  let fightsUpdated = 0;
  let eventUpdated = false;

  try {
    // Get event with fights from database
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    });

    if (!event) {
      console.error(`  ❌ Event not found with ID: ${eventId}`);
      return { fightsUpdated: 0, eventUpdated: false };
    }

    console.log(`  ✓ Found event: ${event.name} (${event.fights.length} fights)`);

    // Update event status if changed
    if (liveData.hasStarted && !event.hasStarted) {
      await prisma.event.update({
        where: { id: eventId },
        data: { hasStarted: true }
      });
      console.log(`  🔴 Event marked as STARTED`);
      eventUpdated = true;
    }

    if (liveData.isComplete && !event.isComplete) {
      await prisma.event.update({
        where: { id: eventId },
        data: {
          isComplete: true,
          completionMethod: 'scraper'
        }
      });
      console.log(`  ✅ Event marked as COMPLETE`);
      eventUpdated = true;
    }

    // Process each fight from scraped data
    console.log(`  🔍 Processing ${liveData.fights.length} fight updates...`);

    for (const fightUpdate of liveData.fights) {
      const fighterALast = fightUpdate.fighterA.lastName;
      const fighterBLast = fightUpdate.fighterB.lastName;

      console.log(`  🔎 Looking for: ${fighterALast} vs ${fighterBLast}`);

      const dbFight = findFightByFighters(event.fights, fighterALast, fighterBLast);

      if (!dbFight) {
        console.warn(`    ⚠ Fight not found in DB`);
        continue;
      }

      console.log(`    ✓ Found: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

      const updateData: any = {};
      let changed = false;

      // Check hasStarted
      if (fightUpdate.hasStarted && !dbFight.hasStarted) {
        updateData.hasStarted = true;
        changed = true;
        console.log(`    🥊 Fight STARTED`);
      }

      // Check isComplete
      if (fightUpdate.isComplete && !dbFight.isComplete) {
        updateData.isComplete = true;
        changed = true;
        console.log(`    ✅ Fight COMPLETE`);

        // Notify for next fight
        notifyNextFight(dbFight.eventId, dbFight.orderOnCard);
      }

      // Check result
      if (fightUpdate.result && !dbFight.winner) {
        // Winner
        if (fightUpdate.result.winner) {
          const winnerId = getWinnerFighterId(
            fightUpdate.result.winner,
            dbFight.fighter1,
            dbFight.fighter2
          );
          if (winnerId) {
            updateData.winner = winnerId;
            changed = true;
            console.log(`    🏆 Winner: ${fightUpdate.result.winner}`);
          }
        }

        // Method
        if (fightUpdate.result.method) {
          updateData.method = fightUpdate.result.method;
          changed = true;
          console.log(`    📋 Method: ${fightUpdate.result.method}`);
        }

        // Round
        if (fightUpdate.result.round) {
          updateData.round = fightUpdate.result.round;
          changed = true;
          console.log(`    🔢 Round: ${fightUpdate.result.round}`);
        }

        // Time
        if (fightUpdate.result.time) {
          updateData.time = fightUpdate.result.time;
          changed = true;
          console.log(`    ⏱️  Time: ${fightUpdate.result.time}`);
        }
      }

      // Apply updates
      if (changed) {
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: updateData
        });
        fightsUpdated++;
        console.log(`    💾 Fight updated`);
      }
    }

    console.log(`  ✅ Parser complete: ${fightsUpdated} fights updated\n`);
    return { fightsUpdated, eventUpdated };

  } catch (error) {
    console.error('  ❌ Parser error:', error);
    throw error;
  }
}

/**
 * Check if all fights in event are complete
 */
export async function checkOktagonEventComplete(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
        where: { isCancelled: false },
        select: { isComplete: true }
      }
    }
  });

  if (!event || event.fights.length === 0) {
    return false;
  }

  return event.fights.every(fight => fight.isComplete);
}

/**
 * Auto-complete event if all fights are done
 */
export async function autoCompleteOktagonEvent(eventId: string): Promise<boolean> {
  const allComplete = await checkOktagonEventComplete(eventId);

  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        isComplete: true,
        completionMethod: 'scraper'
      }
    });
    console.log(`  🎉 Event ${eventId} auto-marked as complete`);
    return true;
  }

  return false;
}
