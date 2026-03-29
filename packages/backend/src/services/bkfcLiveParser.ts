/**
 * BKFC Live Data Parser
 * Takes scraped live event data from Puppeteer scraper and updates the database.
 * Matches fights by fighter last names, updates results via shadow field system.
 */

import { PrismaClient } from '@prisma/client';
import { BKFCEventData, BKFCFightData } from './bkfcLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Extract last name from full name string
 */
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
}

/**
 * Find fight in DB by fighter last names (bidirectional match)
 */
function findFightByFighters(dbFights: any[], fighter1FullName: string, fighter2FullName: string) {
  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();
  const f1Last = normalize(extractLastName(fighter1FullName));
  const f2Last = normalize(extractLastName(fighter2FullName));

  // Also try full name match for single-name fighters
  const f1Full = normalize(fighter1FullName);
  const f2Full = normalize(fighter2FullName);

  return dbFights.find(fight => {
    const db1 = normalize(fight.fighter1.lastName);
    const db2 = normalize(fight.fighter2.lastName);

    // Standard last name match
    if ((db1 === f1Last && db2 === f2Last) || (db1 === f2Last && db2 === f1Last)) return true;

    // Full name match (for single-name fighters stored in lastName)
    if ((db1 === f1Full && db2 === f2Full) || (db1 === f2Full && db2 === f1Full)) return true;

    // Partial match fallback
    if ((db1.includes(f1Last) || f1Last.includes(db1)) &&
        (db2.includes(f2Last) || f2Last.includes(db2))) return true;
    if ((db1.includes(f2Last) || f2Last.includes(db1)) &&
        (db2.includes(f1Last) || f1Last.includes(db2))) return true;

    return false;
  });
}

/**
 * Determine winner fighter ID from winner last name
 */
function getWinnerFighterId(winnerLastName: string, fighter1: any, fighter2: any): string | null {
  if (!winnerLastName) return null;

  const winnerLast = stripDiacritics(winnerLastName).toLowerCase().trim();
  const f1Last = stripDiacritics(fighter1.lastName).toLowerCase().trim();
  const f2Last = stripDiacritics(fighter2.lastName).toLowerCase().trim();

  if (f1Last === winnerLast) return fighter1.id;
  if (f2Last === winnerLast) return fighter2.id;

  // Partial match
  if (f1Last.includes(winnerLast) || winnerLast.includes(f1Last)) return fighter1.id;
  if (f2Last.includes(winnerLast) || winnerLast.includes(f2Last)) return fighter2.id;

  return null;
}

/**
 * Parse method string to standard format
 */
function standardizeMethod(method: string | null | undefined): string | undefined {
  if (!method || method === 'TBU' || method === 'TBD') return undefined;

  const m = method.toLowerCase().trim();
  if (m === 'ko' || (m.includes('knockout') && !m.includes('technical'))) return 'KO';
  if (m === 'tko' || m.includes('technical knockout') || m.includes('technical ko')) return 'TKO';
  if (m.includes('unanimous')) return 'UD';
  if (m.includes('split')) return 'SD';
  if (m.includes('majority')) return 'MD';
  if (m.includes('decision') || m === 'dec') return 'DEC';
  if (m === 'dq' || m.includes('disqualif')) return 'DQ';
  if (m === 'nc' || m.includes('no contest')) return 'NC';
  if (m.includes('draw')) return 'DRAW';
  if (m === 'rtd' || m.includes('corner stoppage') || m.includes('retirement')) return 'RTD';
  if (m.includes('submission') || m === 'sub') return 'SUB';

  return method.trim();
}

/**
 * Notify users about the next upcoming fight
 */
async function notifyNextFight(eventId: string, completedFightOrder: number): Promise<void> {
  try {
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
      const formatName = (f: { firstName: string; lastName: string }) =>
        f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : (f.lastName || f.firstName);
      const f1 = formatName(nextFight.fighter1);
      const f2 = formatName(nextFight.fighter2);

      console.log(`    Next fight notification: ${f1} vs ${f2}`);
      const { notifyFightStartViaRules } = await import('./notificationService');
      await notifyFightStartViaRules(nextFight.id, f1, f2);
    }
  } catch (error) {
    console.error(`    Failed to notify next fight:`, error);
  }
}

// ============== MAIN PARSER FUNCTION ==============

export async function parseBKFCLiveData(
  liveData: BKFCEventData,
  eventId: string
): Promise<{ fightsUpdated: number; eventUpdated: boolean; cancelledCount: number; unCancelledCount: number }> {
  console.log(`\n[BKFC PARSER] Processing: ${liveData.eventName}`);

  let fightsUpdated = 0;
  let eventUpdated = false;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        fights: {
          include: { fighter1: true, fighter2: true },
        },
      },
    });

    if (!event) {
      console.error(`  Event not found: ${eventId}`);
      return { fightsUpdated: 0, eventUpdated: false, cancelledCount: 0, unCancelledCount: 0 };
    }

    console.log(`  DB: ${event.name} (${event.fights.length} fights)`);
    console.log(`  Scraped: ${liveData.fights.length} fights`);

    const scraperType = getEventTrackerType({ scraperType: event.scraperType });

    // Update event status
    if (liveData.hasStarted && event.eventStatus === 'UPCOMING') {
      await prisma.event.update({ where: { id: eventId }, data: { eventStatus: 'LIVE' } });
      console.log(`  Event -> LIVE`);
      eventUpdated = true;
    }

    if (liveData.isComplete && event.eventStatus !== 'COMPLETED') {
      await prisma.event.update({
        where: { id: eventId },
        data: { eventStatus: 'COMPLETED', completionMethod: 'scraper' },
      });
      console.log(`  Event -> COMPLETED`);
      eventUpdated = true;
    }

    // Process each scraped fight
    const scrapedFightSignatures = new Set<string>();
    // Track which DB fight IDs the scraper says are currently LIVE
    const scrapedLiveFightIds = new Set<string>();

    for (const fightUpdate of liveData.fights) {
      const f1Name = fightUpdate.fighter1Name;
      const f2Name = fightUpdate.fighter2Name;
      const f1Last = extractLastName(f1Name);
      const f2Last = extractLastName(f2Name);

      // Track for cancellation detection
      const sig = [f1Last, f2Last]
        .map(n => stripDiacritics(n).toLowerCase().trim())
        .sort()
        .join('|');
      scrapedFightSignatures.add(sig);

      console.log(`  Looking for: ${f1Last} vs ${f2Last}`);

      const dbFight = findFightByFighters(event.fights, f1Name, f2Name);
      if (!dbFight) {
        console.warn(`    Not found in DB`);
        continue;
      }

      console.log(`    Matched: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

      const updateData: any = {};
      let changed = false;

      // Track fights the scraper says are currently live (started but not complete)
      if (fightUpdate.hasStarted && !fightUpdate.isComplete) {
        scrapedLiveFightIds.add(dbFight.id);
      }

      // Never downgrade from COMPLETED — protects manual fixes, draws, and scraper inconsistency
      if (dbFight.fightStatus === 'COMPLETED') {
        if (!fightUpdate.isComplete) {
          console.log(`    Skipping downgrade: DB is COMPLETED, scraper says ${fightUpdate.isComplete ? 'complete' : fightUpdate.hasStarted ? 'live' : 'upcoming'}`);
        }
        // Allow result updates (winner/method) even for already-completed fights
      } else if (dbFight.fightStatus === 'LIVE' && !fightUpdate.hasStarted && !fightUpdate.isComplete) {
        // LIVE -> UPCOMING (scraper says fight not started, but DB shows LIVE)
        updateData.fightStatus = 'UPCOMING';
        changed = true;
        console.log(`    Reset LIVE -> UPCOMING (not current bout)`);
      } else if (fightUpdate.hasStarted && !fightUpdate.isComplete && dbFight.fightStatus === 'UPCOMING') {
        // UPCOMING -> LIVE
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`    -> LIVE`);
      } else if (fightUpdate.isComplete && dbFight.fightStatus !== 'COMPLETED') {
        // -> COMPLETED
        updateData.fightStatus = 'COMPLETED';
        changed = true;
        console.log(`    -> COMPLETED`);
        notifyNextFight(dbFight.eventId, dbFight.orderOnCard);
      }

      // Result
      if (fightUpdate.result && !dbFight.winner) {
        if (fightUpdate.result.winner) {
          const winnerId = getWinnerFighterId(
            fightUpdate.result.winner,
            dbFight.fighter1,
            dbFight.fighter2
          );
          if (winnerId) {
            updateData.winner = winnerId;
            changed = true;
            console.log(`    Winner: ${fightUpdate.result.winner}`);
          }
        }

        const method = standardizeMethod(fightUpdate.result.method);
        if (method) {
          updateData.method = method;
          changed = true;
          console.log(`    Method: ${method}`);
        }

        if (fightUpdate.result.round) {
          updateData.round = fightUpdate.result.round;
          changed = true;
        }

        if (fightUpdate.result.time) {
          updateData.time = fightUpdate.result.time;
          changed = true;
        }
      }

      if (changed) {
        const finalData = buildTrackerUpdateData(updateData, scraperType);
        await prisma.fight.update({ where: { id: dbFight.id }, data: finalData });
        fightsUpdated++;
        console.log(`    Updated in DB`);
      }
    }

    // Reset stale LIVE fights: any DB fight that is LIVE but the scraper didn't
    // identify as currently live should be reset to UPCOMING.
    // This prevents multiple fights from being stuck in LIVE status simultaneously.
    for (const dbFight of event.fights) {
      if (dbFight.fightStatus === 'LIVE' && !scrapedLiveFightIds.has(dbFight.id)) {
        const resetData = buildTrackerUpdateData({ fightStatus: 'UPCOMING' }, scraperType);
        await prisma.fight.update({ where: { id: dbFight.id }, data: resetData });
        fightsUpdated++;
        console.log(`  Reset stale LIVE: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} -> UPCOMING`);
      }
    }

    // Cancellation detection
    let cancelledCount = 0;
    let unCancelledCount = 0;

    for (const dbFight of event.fights) {
      if (dbFight.fightStatus === 'COMPLETED') continue;

      const dbSig = [dbFight.fighter1.lastName, dbFight.fighter2.lastName]
        .map(n => stripDiacritics(n).toLowerCase().trim())
        .sort()
        .join('|');

      const inScraped = scrapedFightSignatures.has(dbSig);

      if (dbFight.fightStatus === 'CANCELLED' && inScraped) {
        await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'UPCOMING' } });
        unCancelledCount++;
        console.log(`  UN-CANCEL: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
      } else if (dbFight.fightStatus !== 'CANCELLED' && !inScraped) {
        if (event.eventStatus !== 'UPCOMING' || liveData.hasStarted) {
          await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'CANCELLED' } });
          cancelledCount++;
          console.log(`  CANCEL: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        }
      }
    }

    console.log(`  Done: ${fightsUpdated} updated, ${cancelledCount} cancelled, ${unCancelledCount} un-cancelled\n`);
    return { fightsUpdated, eventUpdated, cancelledCount, unCancelledCount };

  } catch (error) {
    console.error('  Parser error:', error);
    throw error;
  }
}

/**
 * Auto-complete event if all non-cancelled fights are done
 */
export async function autoCompleteBKFCEvent(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
        where: { fightStatus: { not: 'CANCELLED' } },
        select: { fightStatus: true },
      },
    },
  });

  if (!event || event.fights.length === 0) return false;
  if (event.eventStatus === 'COMPLETED') return true;

  const allComplete = event.fights.every(f => f.fightStatus === 'COMPLETED');
  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: { eventStatus: 'COMPLETED', completionMethod: 'scraper' },
    });
    console.log(`  Event auto-completed`);
    return true;
  }

  return false;
}
