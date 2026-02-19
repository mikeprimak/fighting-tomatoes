/**
 * ONE FC Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, and results
 */

import { PrismaClient } from '@prisma/client';
import { OneFCEventData, OneFCFightData } from './oneFCLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Find fight by fighter names (matches by last name, handles single-name fighters)
 */
function findFightByFighters(dbFights: any[], fighterAName: string, fighterBName: string) {
  // Extract last names (or full name for single-name fighters)
  const getLastName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    return stripDiacritics(parts[parts.length - 1]).toLowerCase();
  };

  const scraperALast = getLastName(fighterAName);
  const scraperBLast = getLastName(fighterBName);

  return dbFights.find(fight => {
    const dbF1Last = fight.fighter1.lastName.toLowerCase();
    const dbF2Last = fight.fighter2.lastName.toLowerCase();

    return (
      (dbF1Last === scraperALast && dbF2Last === scraperBLast) ||
      (dbF1Last === scraperBLast && dbF2Last === scraperALast)
    );
  });
}

/**
 * Determine winner fighter ID from scraped result
 */
function getWinnerFighterId(
  scrapedFight: OneFCFightData,
  fighter1: any,
  fighter2: any
): string | null {
  if (!scrapedFight.result?.winnerSide) return null;

  const scraperALast = stripDiacritics(scrapedFight.fighterA.lastName).toLowerCase();
  const dbF1Last = fighter1.lastName.toLowerCase();

  // Check if scraperA matches dbF1
  const scraperAIsDbF1 = dbF1Last === scraperALast ||
    dbF1Last.includes(scraperALast) ||
    scraperALast.includes(dbF1Last);

  if (scrapedFight.result.winnerSide === 'A') {
    return scraperAIsDbF1 ? fighter1.id : fighter2.id;
  } else {
    return scraperAIsDbF1 ? fighter2.id : fighter1.id;
  }
}

/**
 * Notify users about the next upcoming fight
 */
async function notifyNextFight(eventId: string, completedFightOrder: number): Promise<void> {
  try {
    // Find the next fight that hasn't started yet
    // ONE FC fights go in ascending order (1 = first fight of the night)
    const nextFight = await prisma.fight.findFirst({
      where: {
        eventId,
        orderOnCard: { gt: completedFightOrder },
        fightStatus: 'UPCOMING',
      },
      orderBy: { orderOnCard: 'asc' },
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
 * Parse and update database with live ONE FC event data
 */
export async function parseOneFCLiveData(
  liveData: OneFCEventData,
  eventId: string
): Promise<{ fightsUpdated: number; eventUpdated: boolean; cancelledCount: number; unCancelledCount: number }> {
  console.log(`\n📊 [ONE FC PARSER] Processing live data for: ${liveData.eventName}`);

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

    console.log(`  ✓ Found event: ${event.name} (${event.fights.length} fights in DB)`);

    // Determine tracker mode for this event
    const trackerMode = getEventTrackerType({ trackerMode: event.trackerMode, promotion: event.promotion });
    console.log(`  ⚙️  Tracker mode: ${trackerMode}`);

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
    console.log(`  🔍 Processing ${liveData.fights.length} fights from scraper...`);

    // Track which fights from scraped data we've seen (for cancellation detection)
    const scrapedFightSignatures = new Set<string>();

    for (const scrapedFight of liveData.fights) {
      const fighterAName = scrapedFight.fighterA.name;
      const fighterBName = scrapedFight.fighterB.name;
      const fighterALast = scrapedFight.fighterA.lastName;
      const fighterBLast = scrapedFight.fighterB.lastName;

      // Create a signature to track which fights we've seen in the scraped data
      const fightSignature = [fighterALast, fighterBLast]
        .map(n => stripDiacritics(n).toLowerCase().trim())
        .sort()
        .join('|');
      scrapedFightSignatures.add(fightSignature);

      console.log(`  🔎 Looking for: ${fighterAName} vs ${fighterBName}`);

      const dbFight = findFightByFighters(event.fights, fighterAName, fighterBName);

      if (!dbFight) {
        console.warn(`    ⚠ Fight not found in DB`);
        continue;
      }

      console.log(`    ✓ Found: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

      const updateData: any = {};
      let changed = false;

      // Check if fight is live (currently happening)
      if (scrapedFight.isLive && dbFight.fightStatus === 'UPCOMING') {
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`    🔴 Fight is LIVE`);

        // Notify that this fight just started
        const formatName = (f: { firstName: string; lastName: string }) =>
          f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
        const fighter1Name = formatName(dbFight.fighter1);
        const fighter2Name = formatName(dbFight.fighter2);

        try {
          const { notifyFightStartViaRules } = await import('./notificationService');
          await notifyFightStartViaRules(dbFight.id, fighter1Name, fighter2Name);
          console.log(`    🔔 Sent "fight started" notification`);
        } catch (err) {
          console.error(`    ⚠️ Failed to send notification:`, err);
        }
      }

      // Check hasStarted (fight has started, either live or complete)
      if (scrapedFight.hasStarted && dbFight.fightStatus === 'UPCOMING') {
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`    🥊 Fight STARTED`);
      }

      // Check isComplete
      if (scrapedFight.isComplete && dbFight.fightStatus !== 'COMPLETED') {
        updateData.fightStatus = 'COMPLETED';
        changed = true;
        console.log(`    ✅ Fight COMPLETE`);

        // Notify for next fight
        await notifyNextFight(dbFight.eventId, dbFight.orderOnCard);
      }

      // Check result
      if (scrapedFight.result && !dbFight.winner) {
        // Winner
        const winnerId = getWinnerFighterId(scrapedFight, dbFight.fighter1, dbFight.fighter2);
        if (winnerId) {
          updateData.winner = winnerId;
          changed = true;
          console.log(`    🏆 Winner: ${scrapedFight.result.winner}`);
        }

        // Method
        if (scrapedFight.result.method) {
          updateData.method = scrapedFight.result.method;
          changed = true;
          console.log(`    📋 Method: ${scrapedFight.result.method}`);
        }

        // Round
        if (scrapedFight.result.round) {
          updateData.round = scrapedFight.result.round;
          changed = true;
          console.log(`    🔢 Round: ${scrapedFight.result.round}`);
        }

        // Time
        if (scrapedFight.result.time) {
          updateData.time = scrapedFight.result.time;
          changed = true;
          console.log(`    ⏱️  Time: ${scrapedFight.result.time}`);
        }
      }

      // Apply updates (route through shadow field helper)
      if (changed) {
        const finalUpdateData = buildTrackerUpdateData(updateData, trackerMode);
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
        console.log(`  ✅ Fight reappeared, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { fightStatus: 'UPCOMING' }
        });

        unCancelledCount++;
      }
      // Case 2: Fight is NOT cancelled and missing from scraped data -> CANCEL it
      else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData) {
        console.log(`  ⚠️  Fight missing from scraped data: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

        // Only mark as cancelled if event has started (to avoid false positives before event begins)
        if (event.eventStatus !== 'UPCOMING' || liveData.hasStarted) {
          console.log(`  ❌ Marking fight as CANCELLED`);

          await prisma.fight.update({
            where: { id: dbFight.id },
            data: { fightStatus: 'CANCELLED' }
          });

          cancelledCount++;
        } else {
          console.log(`  ℹ️  Event hasn't started yet, not marking as cancelled`);
        }
      }
    }

    if (cancelledCount > 0) {
      console.log(`  ⚠️  Marked ${cancelledCount} fights as cancelled`);
    }
    if (unCancelledCount > 0) {
      console.log(`  ✅ Un-cancelled ${unCancelledCount} fights`);
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
export async function checkOneFCEventComplete(eventId: string): Promise<{ allComplete: boolean; eventAlreadyComplete: boolean }> {
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
export async function autoCompleteOneFCEvent(eventId: string): Promise<boolean> {
  const { allComplete, eventAlreadyComplete } = await checkOneFCEventComplete(eventId);

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
