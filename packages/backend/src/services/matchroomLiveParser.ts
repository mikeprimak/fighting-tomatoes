/**
 * Matchroom Boxing Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, and results
 *
 * Similar to ufcLiveParser.ts but adapted for Matchroom Boxing events
 */

import { PrismaClient, WeightClass, Gender, Sport } from '@prisma/client';
import { MatchroomEventData, MatchroomFightData } from './matchroomLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Parse boxer name into first/last name
 */
function parseBoxerName(fullName: string): { firstName: string; lastName: string; nickname?: string } {
  // Decode URL-encoded characters (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
  let decodedName = fullName;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(fullName)) {
      decodedName = decodeURIComponent(fullName);
    }
  } catch (e) {
    decodedName = fullName;
  }

  let cleanName = decodedName.trim();

  // Extract nickname if present
  let nickname: string | undefined;
  const nicknameMatch = cleanName.match(/["']([^"']+)["']|\(([^)]+)\)/);
  if (nicknameMatch) {
    nickname = nicknameMatch[1] || nicknameMatch[2];
    cleanName = cleanName.replace(/["'][^"']+["']|\([^)]+\)/, '').trim();
  }

  const nameParts = cleanName.split(/\s+/).filter(p => p.length > 0);

  if (nameParts.length === 0) {
    return { firstName: '', lastName: '', nickname };
  }

  if (nameParts.length === 1) {
    return { firstName: '', lastName: stripDiacritics(nameParts[0]), nickname };
  }

  // Handle suffixes like Jr, Sr, III
  const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv'];
  let suffix = '';
  if (nameParts.length > 2 && suffixes.includes(nameParts[nameParts.length - 1].toLowerCase())) {
    suffix = ' ' + nameParts.pop();
  }

  const firstName = stripDiacritics(nameParts[0]);
  const lastName = stripDiacritics((nameParts.slice(1).join(' ') + suffix).trim());

  return { firstName, lastName: lastName.trim(), nickname };
}

/**
 * Find fight by fighter names (matches by last name)
 */
function findFightByFighters(fights: any[], fighter1Name: string, fighter2Name: string) {
  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();

  return fights.find(fight => {
    const f1LastName = fight.fighter1.lastName.toLowerCase();
    const f2LastName = fight.fighter2.lastName.toLowerCase();

    // Get last names from input
    const fighter1Last = normalize(fighter1Name).split(' ').pop() || '';
    const fighter2Last = normalize(fighter2Name).split(' ').pop() || '';

    // Match either ordering
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

  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();
  const winnerLast = normalize(winnerName).split(' ').pop() || '';

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

// ============== MAIN PARSER FUNCTION ==============

/**
 * Parse and update database with live Matchroom event data
 * @param liveData - Live event data from scraper
 * @param eventId - UUID of event in database
 */
export async function parseMatchroomLiveData(
  liveData: MatchroomEventData,
  eventId: string
): Promise<{ fightsUpdated: number; eventUpdated: boolean }> {
  console.log(`\n📊 [MATCHROOM PARSER] Processing live data for: ${liveData.eventName}`);

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
    console.log(`  🔍 Processing ${liveData.fights.length} fight updates...`);

    for (const fightUpdate of liveData.fights) {
      const boxerAName = fightUpdate.boxerA.name;
      const boxerBName = fightUpdate.boxerB.name;

      console.log(`  🔎 Looking for: ${boxerAName} vs ${boxerBName}`);

      const dbFight = findFightByFighters(event.fights, boxerAName, boxerBName);

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

        // When a fight completes, notify for the next fight
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
        const finalUpdateData = buildTrackerUpdateData(updateData, trackerMode);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: finalUpdateData
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

      // Import dynamically to avoid circular dependency
      const { notifyFightStartViaRules } = await import('./notificationService');
      await notifyFightStartViaRules(nextFight.id, fighter1Name, fighter2Name);
    }
  } catch (error) {
    console.error(`    ❌ Failed to notify next fight:`, error);
  }
}

/**
 * Check if all fights in event are complete
 */
export async function checkMatchroomEventComplete(eventId: string): Promise<boolean> {
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
    return false;
  }

  return event.fights.every(fight => fight.fightStatus === 'COMPLETED');
}

/**
 * Auto-complete event if all fights are done
 */
export async function autoCompleteMatchroomEvent(eventId: string): Promise<boolean> {
  const allComplete = await checkMatchroomEventComplete(eventId);

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
