/**
 * UFC Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, rounds, and results
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface LiveFightUpdate {
  fighterAName: string;
  fighterBName: string;
  order?: number | null;  // Fight order on card (UFC may change this)
  status?: 'upcoming' | 'live' | 'complete';
  currentRound?: number | null;
  completedRounds?: number | null;
  hasStarted?: boolean;
  isComplete?: boolean;
  winner?: string | null;
  method?: string | null;
  winningRound?: number | null;
  winningTime?: string | null;
}

interface LiveEventUpdate {
  eventName: string;
  hasStarted?: boolean;
  isComplete?: boolean;
  fights: LiveFightUpdate[];
}

// ============== HELPER FUNCTIONS ==============

/**
 * Find event by name (fuzzy match)
 */
async function findEventByName(eventName: string) {
  // Try exact match first
  let event = await prisma.event.findFirst({
    where: {
      name: {
        equals: eventName,
        mode: 'insensitive'
      }
    },
    include: {
      fights: {
        include: {
          fighter1: true,
          fighter2: true
        }
      }
    }
  });

  // Try partial match
  if (!event) {
    event = await prisma.event.findFirst({
      where: {
        name: {
          contains: eventName.replace(/[^\w\s]/g, '').split(' ')[1] || eventName, // Extract "320" from "UFC 320"
          mode: 'insensitive'
        }
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    });
  }

  return event;
}

/**
 * Find fight by fighter names
 */
function findFightByFighters(fights: any[], fighter1Name: string, fighter2Name: string) {
  const normalize = (name: string) => name.toLowerCase().trim();

  return fights.find(fight => {
    const f1LastName = fight.fighter1.lastName.toLowerCase();
    const f2LastName = fight.fighter2.lastName.toLowerCase();
    const fighter1Last = normalize(fighter1Name).split(' ').pop() || '';
    const fighter2Last = normalize(fighter2Name).split(' ').pop() || '';

    // Match by last names (more reliable than full names)
    return (
      (f1LastName === fighter1Last && f2LastName === fighter2Last) ||
      (f1LastName === fighter2Last && f2LastName === fighter1Last)
    );
  });
}

/**
 * Determine winner fighter ID from winner name
 */
function getWinnerFighterId(winnerName: string, fighter1: any, fighter2: any): string | null {
  if (!winnerName) return null;

  const normalize = (name: string) => name.toLowerCase().trim();
  const winnerLast = normalize(winnerName).split(' ').pop() || '';

  if (fighter1.lastName.toLowerCase() === winnerLast) {
    return fighter1.id;
  }
  if (fighter2.lastName.toLowerCase() === winnerLast) {
    return fighter2.id;
  }

  return null;
}

// ============== MAIN PARSER FUNCTION ==============

/**
 * Parse and update database with live event data
 * @param liveData - Live event data from scraper
 * @param eventId - Optional UUID of event (if not provided, will search by name)
 */
export async function parseLiveEventData(liveData: LiveEventUpdate, eventId?: string): Promise<void> {
  console.log(`\n📊 [LIVE PARSER] Processing live data for: ${liveData.eventName}`);

  try {
    // Find event in database - use UUID if provided, otherwise search by name
    let event;
    if (eventId) {
      event = await prisma.event.findUnique({
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
        return;
      }
    } else {
      event = await findEventByName(liveData.eventName);

      if (!event) {
        console.error(`  ❌ Event not found in database: ${liveData.eventName}`);
        return;
      }
    }

    console.log(`  ✓ Found event: ${event.name} (ID: ${event.id})`);

    // Track changes
    let eventChanged = false;
    let fightsUpdated = 0;

    // Calculate hasStarted based on time - event has started if current time is past the earliest start time
    const now = new Date();
    const earliestStartTime = [
      event.earlyPrelimStartTime,
      event.prelimStartTime,
      event.mainStartTime
    ].filter(t => t != null).sort((a, b) => a!.getTime() - b!.getTime())[0];

    const calculatedHasStarted = earliestStartTime ? now >= earliestStartTime : false;

    // Update event status
    if (calculatedHasStarted !== event.hasStarted) {
      console.log(`  🔴 Event status change: hasStarted ${event.hasStarted} → ${calculatedHasStarted} (based on time)`);
      eventChanged = true;
    }

    if (liveData.isComplete !== undefined && event.isComplete !== liveData.isComplete) {
      console.log(`  ✅ Event status change: isComplete ${event.isComplete} → ${liveData.isComplete}`);
      eventChanged = true;
    }

    if (eventChanged) {
      await prisma.event.update({
        where: { id: event.id },
        data: {
          hasStarted: calculatedHasStarted,
          isComplete: liveData.isComplete ?? event.isComplete,
        }
      });
      console.log(`  💾 Event updated`);
    }

    // Update fights
    console.log(`  🔍 Processing ${liveData.fights.length} fight updates...`);
    for (const fightUpdate of liveData.fights) {
      console.log(`  🔎 Looking for fight: ${fightUpdate.fighterAName} vs ${fightUpdate.fighterBName} (hasStarted: ${fightUpdate.hasStarted}, isComplete: ${fightUpdate.isComplete})`);

      const dbFight = findFightByFighters(
        event.fights,
        fightUpdate.fighterAName,
        fightUpdate.fighterBName
      );

      if (!dbFight) {
        console.warn(`  ⚠ Fight not found in DB: ${fightUpdate.fighterAName} vs ${fightUpdate.fighterBName}`);
        console.warn(`  Available fights in DB: ${event.fights.map(f => `${f.fighter1.lastName} vs ${f.fighter2.lastName}`).join(', ')}`);
        continue;
      }

      console.log(`  ✓ Found DB fight: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} (DB hasStarted: ${dbFight.hasStarted}, DB isComplete: ${dbFight.isComplete})`);

      const updateData: any = {};
      let changed = false;

      // Check status changes
      if (fightUpdate.hasStarted !== undefined && dbFight.hasStarted !== fightUpdate.hasStarted) {
        updateData.hasStarted = fightUpdate.hasStarted;
        changed = true;
        console.log(`    🥊 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: hasStarted → ${fightUpdate.hasStarted}`);
        // Note: Notifications are sent when the PREVIOUS fight completes, not when this fight starts
      }

      if (fightUpdate.isComplete !== undefined && dbFight.isComplete !== fightUpdate.isComplete) {
        updateData.isComplete = fightUpdate.isComplete;
        changed = true;
        console.log(`    ✅ ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: isComplete → ${fightUpdate.isComplete}`);

        // When a fight completes, send notifications for the NEXT fight on the card
        if (fightUpdate.isComplete === true) {
          // Find the next fight on the card (lower orderOnCard = later in event, closer to main event)
          // We want the fight with the next lower orderOnCard number
          prisma.fight.findFirst({
            where: {
              eventId: dbFight.eventId,
              orderOnCard: { lt: dbFight.orderOnCard },
              hasStarted: false,
              isComplete: false,
            },
            orderBy: { orderOnCard: 'desc' },
            include: {
              fighter1: { select: { firstName: true, lastName: true } },
              fighter2: { select: { firstName: true, lastName: true } },
            },
          }).then(nextFight => {
            if (nextFight) {
              const fighter1Name = `${nextFight.fighter1.firstName} ${nextFight.fighter1.lastName}`;
              const fighter2Name = `${nextFight.fighter2.firstName} ${nextFight.fighter2.lastName}`;

              console.log(`    🔔 Previous fight complete, notifying for next fight: ${fighter1Name} vs ${fighter2Name}`);

              import('../services/notificationService').then(({ notifyFightStartViaRules }) => {
                notifyFightStartViaRules(nextFight.id, fighter1Name, fighter2Name).catch(err => {
                  console.error(`    ❌ Failed to send next fight notifications:`, err);
                });
              });
            }
          }).catch(err => {
            console.error(`    ❌ Error finding next fight:`, err);
          });
        }
      }

      // Check order changes (UFC sometimes reorders fights)
      if (fightUpdate.order !== undefined && fightUpdate.order !== null && dbFight.orderOnCard !== fightUpdate.order) {
        updateData.orderOnCard = fightUpdate.order;
        changed = true;
        console.log(`    🔀 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: orderOnCard ${dbFight.orderOnCard} → ${fightUpdate.order}`);
      }

      // Check round changes
      if (fightUpdate.currentRound !== undefined && dbFight.currentRound !== fightUpdate.currentRound) {
        updateData.currentRound = fightUpdate.currentRound;
        changed = true;
        console.log(`    🔵 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: currentRound → ${fightUpdate.currentRound}`);
      }

      if (fightUpdate.completedRounds !== undefined && dbFight.completedRounds !== fightUpdate.completedRounds) {
        updateData.completedRounds = fightUpdate.completedRounds;
        changed = true;
        console.log(`    ⚫ ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: completedRounds → ${fightUpdate.completedRounds}`);
      }

      // Check result changes
      if (fightUpdate.winner && !dbFight.winner) {
        const winnerId = getWinnerFighterId(fightUpdate.winner, dbFight.fighter1, dbFight.fighter2);
        if (winnerId) {
          updateData.winner = winnerId;
          changed = true;
          console.log(`    🏆 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: winner → ${fightUpdate.winner}`);
        }
      }

      if (fightUpdate.method && !dbFight.method) {
        updateData.method = fightUpdate.method;
        changed = true;
        console.log(`    📋 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: method → ${fightUpdate.method}`);
      }

      if (fightUpdate.winningRound !== undefined && !dbFight.round) {
        updateData.round = fightUpdate.winningRound;
        changed = true;
        console.log(`    🔢 ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: round → ${fightUpdate.winningRound}`);
      }

      if (fightUpdate.winningTime && !dbFight.time) {
        updateData.time = fightUpdate.winningTime;
        changed = true;
        console.log(`    ⏱️  ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}: time → ${fightUpdate.winningTime}`);
      }

      // Apply updates
      if (changed) {
        console.log(`  💾 Updating fight ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} with:`, updateData);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: updateData
        });
        fightsUpdated++;
      } else {
        console.log(`  ⏭️  No changes for ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
      }
    }

    console.log(`  ✅ Parser complete: ${fightsUpdated} fights updated\n`);

  } catch (error) {
    console.error('  ❌ Parser error:', error);
    throw error;
  }
}

/**
 * Check if all fights in an event are complete
 */
export async function checkEventComplete(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
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
export async function autoCompleteEvent(eventId: string): Promise<boolean> {
  const allComplete = await checkEventComplete(eventId);

  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        isComplete: true,
        completionMethod: 'scraper' // Completed via live scraper
      }
    });
    console.log(`  🎉 Event ${eventId} auto-marked as complete (all fights done)`);
    return true;
  }

  return false;
}

/**
 * Get current event status for logging/monitoring
 * @param eventIdentifier - Event name or UUID
 */
export async function getEventStatus(eventIdentifier: string) {
  // Check if it's a UUID (contains hyphens)
  let event;
  if (eventIdentifier.includes('-')) {
    event = await prisma.event.findUnique({
      where: { id: eventIdentifier },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    });
  } else {
    event = await findEventByName(eventIdentifier);
  }

  if (!event) {
    return null;
  }

  const liveFights = event.fights.filter(f => f.hasStarted && !f.isComplete);
  const completeFights = event.fights.filter(f => f.isComplete);
  const upcomingFights = event.fights.filter(f => !f.hasStarted);

  return {
    eventId: event.id,
    eventName: event.name,
    hasStarted: event.hasStarted,
    isComplete: event.isComplete,
    totalFights: event.fights.length,
    liveFights: liveFights.length,
    completeFights: completeFights.length,
    upcomingFights: upcomingFights.length,
    currentFights: liveFights.map(f => ({
      fighters: `${f.fighter1.lastName} vs ${f.fighter2.lastName}`,
      currentRound: f.currentRound,
      completedRounds: f.completedRounds
    }))
  };
}
