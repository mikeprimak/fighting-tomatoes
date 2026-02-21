/**
 * OKTAGON MMA Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, and results
 */

import { PrismaClient } from '@prisma/client';
import { OktagonEventData, OktagonFightData } from './oktagonLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Find fight by fighter names (matches by last name)
 */
function findFightByFighters(fights: any[], fighter1Name: string, fighter2Name: string) {
  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();

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

  const winnerLast = stripDiacritics(winnerLastName).toLowerCase().trim();

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
        fightStatus: 'UPCOMING',
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
): Promise<{ fightsUpdated: number; eventUpdated: boolean; cancelledCount: number; unCancelledCount: number }> {
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
      return { fightsUpdated: 0, eventUpdated: false, cancelledCount: 0, unCancelledCount: 0 };
    }

    console.log(`  ✓ Found event: ${event.name} (${event.fights.length} fights)`);

    // Determine scraper type for this event
    const scraperType = getEventTrackerType({ scraperType: event.scraperType });
    console.log(`  ⚙️  Scraper type: ${scraperType || 'none'}`);

    // Update event status if changed
    if (liveData.hasStarted && event.eventStatus === 'UPCOMING') {
      await prisma.event.update({
        where: { id: eventId },
        data: { eventStatus: 'LIVE' }
      });
      console.log(`  🔴 Event marked as STARTED`);
      eventUpdated = true;
    }

    if (liveData.isComplete && event.eventStatus !== 'COMPLETED') {
      await prisma.event.update({
        where: { id: eventId },
        data: {
          eventStatus: 'COMPLETED',
          completionMethod: 'scraper'
        }
      });
      console.log(`  ✅ Event marked as COMPLETE`);
      eventUpdated = true;
    }

    // Process each fight from scraped data
    console.log(`  🔍 Processing ${liveData.fights.length} fight updates...`);

    // Track which fights from scraped data we've seen (for cancellation detection)
    const scrapedFightSignatures = new Set<string>();

    for (const fightUpdate of liveData.fights) {
      const fighterALast = fightUpdate.fighterA.lastName;
      const fighterBLast = fightUpdate.fighterB.lastName;

      // Create a signature to track which fights we've seen in the scraped data
      const fightSignature = [fighterALast, fighterBLast]
        .map(n => stripDiacritics(n).toLowerCase().trim())
        .sort()
        .join('|');
      scrapedFightSignatures.add(fightSignature);

      console.log(`  🔎 Looking for: ${fighterALast} vs ${fighterBLast}`);

      const dbFight = findFightByFighters(event.fights, fighterALast, fighterBLast);

      if (!dbFight) {
        console.warn(`    ⚠ Fight not found in DB`);
        continue;
      }

      console.log(`    ✓ Found: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

      const updateData: any = {};
      let changed = false;

      // Check if fight started (UPCOMING -> LIVE)
      if (fightUpdate.hasStarted && dbFight.fightStatus === 'UPCOMING') {
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`    🥊 Fight STARTED`);
      }

      // Check if fight complete (-> COMPLETED)
      if (fightUpdate.isComplete && dbFight.fightStatus !== 'COMPLETED') {
        updateData.fightStatus = 'COMPLETED';
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

      // Apply updates (route through shadow field helper)
      if (changed) {
        const finalUpdateData = buildTrackerUpdateData(updateData, scraperType);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: finalUpdateData
        });
        fightsUpdated++;
        console.log(`    💾 Fight updated`);
      }
    }

    // ============== CANCELLATION DETECTION ==============
    // Check for fights in DB that were NOT in the scraped data (possibly cancelled)
    // Also check for previously cancelled fights that have reappeared (un-cancel them)

    console.log(`  🔍 Checking for cancelled/un-cancelled fights...`);
    let cancelledCount = 0;
    let unCancelledCount = 0;

    for (const dbFight of event.fights) {
      // Skip fights that are already complete
      if (dbFight.fightStatus === 'COMPLETED') {
        continue;
      }

      // Create signature for this DB fight
      const dbFightSignature = [dbFight.fighter1.lastName, dbFight.fighter2.lastName]
        .map(n => n.toLowerCase().trim())
        .sort()
        .join('|');

      const fightIsInScrapedData = scrapedFightSignatures.has(dbFightSignature);

      // Case 1: Fight was cancelled but has reappeared in scraped data -> UN-CANCEL it
      if (dbFight.fightStatus === 'CANCELLED' && fightIsInScrapedData) {
        console.log(`  ✅ Fight reappeared in scraped data, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        await prisma.fight.update({
          where: { id: dbFight.id },
          data: {
            fightStatus: 'UPCOMING',
          }
        });

        unCancelledCount++;
      }
      // Case 2: Fight is NOT cancelled and missing from scraped data -> CANCEL it
      else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData) {
        console.log(`  ⚠️  Fight missing from scraped data: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        // Only mark as cancelled if event has started (to avoid false positives before event begins)
        if (event.eventStatus !== 'UPCOMING' || liveData.hasStarted) {
          console.log(`  ❌ Marking fight as CANCELLED: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

          await prisma.fight.update({
            where: { id: dbFight.id },
            data: {
              fightStatus: 'CANCELLED',
            }
          });

          cancelledCount++;
        } else {
          console.log(`  ℹ️  Event hasn't started yet, not marking as cancelled (might be missing from preliminary data)`);
        }
      }
    }

    if (cancelledCount > 0) {
      console.log(`  ⚠️  Marked ${cancelledCount} fights as cancelled`);
    }
    if (unCancelledCount > 0) {
      console.log(`  ✅ Un-cancelled ${unCancelledCount} fights (reappeared in scraped data)`);
    }

    console.log(`  ✅ Parser complete: ${fightsUpdated} fights updated, ${cancelledCount} cancelled, ${unCancelledCount} un-cancelled\n`);
    return { fightsUpdated, eventUpdated, cancelledCount, unCancelledCount };

  } catch (error) {
    console.error('  ❌ Parser error:', error);
    throw error;
  }
}

/**
 * Check if all non-cancelled fights in event are complete
 */
export async function checkOktagonEventComplete(eventId: string): Promise<{ allComplete: boolean; eventAlreadyComplete: boolean }> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
        where: { fightStatus: { not: 'CANCELLED' } },
        select: { fightStatus: true }
      }
    }
  });

  if (!event || event.fights.length === 0) {
    return { allComplete: false, eventAlreadyComplete: false };
  }

  const allFightsComplete = event.fights.every(fight => fight.fightStatus === 'COMPLETED');
  return { allComplete: allFightsComplete, eventAlreadyComplete: event.eventStatus === 'COMPLETED' };
}

/**
 * Auto-complete event if all fights are done
 * Returns true if event is now complete (either just marked or already was)
 */
export async function autoCompleteOktagonEvent(eventId: string): Promise<boolean> {
  const { allComplete, eventAlreadyComplete } = await checkOktagonEventComplete(eventId);

  // Event already marked complete - just return true to stop tracker
  if (eventAlreadyComplete) {
    return true;
  }

  // All fights complete but event not yet marked - update it
  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        eventStatus: 'COMPLETED',
        completionMethod: 'scraper'
      }
    });
    console.log(`  🎉 Event ${eventId} auto-marked as complete`);
    return true;
  }

  return false;
}
