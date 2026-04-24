/**
 * RAF Live Data Parser
 * Takes scraped live event data and updates the database.
 * Matches fights by fighter last names, updates results via shadow field system.
 */

import { PrismaClient } from '@prisma/client';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

export interface RAFLiveFight {
  order: number;
  weightClass: string;
  isTitle: boolean;
  fighter1Name: string;
  fighter2Name: string;
  status: string;
  hasStarted: boolean;
  isComplete: boolean;
  winner: 'fighter1' | 'fighter2' | null;
  scores?: {
    total: { fighter1: string; fighter2: string };
    rounds: { fighter1: string; fighter2: string }[];
  } | null;
  takedowns?: { fighter1: string; fighter2: string } | null;
}

export interface RAFLiveEventData {
  eventName: string;
  eventUrl: string;
  isLiveEvent: boolean;
  hasStarted: boolean;
  isComplete: boolean;
  status: string;
  fights: RAFLiveFight[];
  scrapedAt: string;
}

// ============== UTILITY FUNCTIONS ==============

function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
}

function findFightByFighters(dbFights: any[], fighter1Name: string, fighter2Name: string) {
  const normalize = (name: string) => stripDiacritics(name).toLowerCase().trim();
  const f1Last = normalize(extractLastName(fighter1Name));
  const f2Last = normalize(extractLastName(fighter2Name));

  return dbFights.find(fight => {
    const db1 = normalize(fight.fighter1.lastName);
    const db2 = normalize(fight.fighter2.lastName);

    if ((db1 === f1Last && db2 === f2Last) || (db1 === f2Last && db2 === f1Last)) return true;

    // Partial match fallback
    if ((db1.includes(f1Last) || f1Last.includes(db1)) &&
        (db2.includes(f2Last) || f2Last.includes(db2))) return true;
    if ((db1.includes(f2Last) || f2Last.includes(db1)) &&
        (db2.includes(f1Last) || f1Last.includes(db2))) return true;

    return false;
  });
}

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

export async function parseRAFLiveData(
  liveData: RAFLiveEventData,
  eventId: string,
): Promise<{ fightsUpdated: number; eventUpdated: boolean; cancelledCount: number; unCancelledCount: number }> {
  console.log(`\n[RAF PARSER] Processing: ${liveData.eventName}`);

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

    for (const fightUpdate of liveData.fights) {
      const f1Last = extractLastName(fightUpdate.fighter1Name);
      const f2Last = extractLastName(fightUpdate.fighter2Name);

      const sig = [f1Last, f2Last]
        .map(n => stripDiacritics(n).toLowerCase().trim())
        .sort()
        .join('|');
      scrapedFightSignatures.add(sig);

      console.log(`  Looking for: ${f1Last} vs ${f2Last}`);

      const dbFight = findFightByFighters(event.fights, fightUpdate.fighter1Name, fightUpdate.fighter2Name);
      if (!dbFight) {
        console.warn(`    Not found in DB`);
        continue;
      }

      console.log(`    Matched: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

      // Determine winner ID
      let winnerId: string | null = null;
      if (fightUpdate.winner === 'fighter1') {
        // Figure out which DB fighter is fighter1 from scrape
        const f1LastNorm = stripDiacritics(f1Last).toLowerCase();
        const db1LastNorm = stripDiacritics(dbFight.fighter1.lastName).toLowerCase();
        winnerId = (db1LastNorm.includes(f1LastNorm) || f1LastNorm.includes(db1LastNorm))
          ? dbFight.fighter1.id
          : dbFight.fighter2.id;
      } else if (fightUpdate.winner === 'fighter2') {
        const f2LastNorm = stripDiacritics(f2Last).toLowerCase();
        const db2LastNorm = stripDiacritics(dbFight.fighter2.lastName).toLowerCase();
        winnerId = (db2LastNorm.includes(f2LastNorm) || f2LastNorm.includes(db2LastNorm))
          ? dbFight.fighter2.id
          : dbFight.fighter1.id;
      }

      // Infer wrestling method from scores (see rafDataParser for the same
      // logic). RAF's page publishes scores only, so we classify a ≥10-point
      // margin as Tech Fall and anything less as Decision.
      let method: string | null = null;
      if (fightUpdate.winner) {
        const scores = fightUpdate.scores;
        if (scores?.total) {
          const f1 = parseInt(scores.total.fighter1, 10);
          const f2 = parseInt(scores.total.fighter2, 10);
          if (Number.isFinite(f1) && Number.isFinite(f2)) {
            const margin = Math.abs(f1 - f2);
            method = margin >= 10
              ? `Tech Fall (${scores.total.fighter1}-${scores.total.fighter2})`
              : `Decision (${scores.total.fighter1}-${scores.total.fighter2})`;
          } else {
            method = 'Decision';
          }
        } else {
          method = 'Decision';
        }
      }

      // Build update data using shadow field system
      const publishedData: any = {};
      let changed = false;

      // Reset lifecycle-premature completions
      if (!fightUpdate.isComplete && !fightUpdate.hasStarted &&
          dbFight.fightStatus === 'COMPLETED' && !dbFight.winner) {
        publishedData.fightStatus = 'UPCOMING';
        changed = true;
        console.log(`    Reset to UPCOMING (lifecycle premature)`);
      }

      // UPCOMING -> COMPLETED (wrestling matches go directly from upcoming to completed, no "live" intermediate)
      if (fightUpdate.isComplete && dbFight.fightStatus !== 'COMPLETED') {
        publishedData.fightStatus = 'COMPLETED';
        changed = true;
        console.log(`    -> COMPLETED`);
        notifyNextFight(dbFight.eventId, dbFight.orderOnCard);
      }

      // Winner
      if (winnerId && !dbFight.winner) {
        publishedData.winner = winnerId;
        changed = true;
        const winnerName = winnerId === dbFight.fighter1.id
          ? `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`
          : `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`;
        console.log(`    Winner: ${winnerName}`);
      }

      // Method
      if (method && !dbFight.method) {
        publishedData.method = method;
        changed = true;
        console.log(`    Method: ${method}`);
      }

      if (changed) {
        const updateData = buildTrackerUpdateData(publishedData, scraperType);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: updateData,
        });
        fightsUpdated++;
      }
    }

    // Cancellation detection
    let cancelledCount = 0;
    let unCancelledCount = 0;

    for (const dbFight of event.fights) {
      if (dbFight.fightStatus === 'COMPLETED') continue;

      const dbSig = [
        stripDiacritics(dbFight.fighter1.lastName).toLowerCase().trim(),
        stripDiacritics(dbFight.fighter2.lastName).toLowerCase().trim(),
      ].sort().join('|');

      const inScraped = scrapedFightSignatures.has(dbSig);

      if (dbFight.fightStatus === 'CANCELLED' && inScraped) {
        await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'UPCOMING' } });
        unCancelledCount++;
      } else if (dbFight.fightStatus !== 'CANCELLED' && !inScraped) {
        await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'CANCELLED' } });
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) console.log(`  Cancelled ${cancelledCount} fights`);
    if (unCancelledCount > 0) console.log(`  Un-cancelled ${unCancelledCount} fights`);

    return { fightsUpdated, eventUpdated, cancelledCount, unCancelledCount };
  } catch (error) {
    console.error('[RAF PARSER] Error:', error);
    return { fightsUpdated: 0, eventUpdated: false, cancelledCount: 0, unCancelledCount: 0 };
  }
}

/**
 * Auto-complete event when all fights are done
 */
export async function autoCompleteRAFEvent(eventId: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: { select: { fightStatus: true } },
    },
  });

  if (!event || event.eventStatus === 'COMPLETED') return false;

  const nonCancelled = event.fights.filter(f => f.fightStatus !== 'CANCELLED');
  const allDone = nonCancelled.length > 0 && nonCancelled.every(f => f.fightStatus === 'COMPLETED');

  if (allDone) {
    await prisma.event.update({
      where: { id: eventId },
      data: { eventStatus: 'COMPLETED', completionMethod: 'scraper-auto' },
    });
    return true;
  }

  return false;
}
