/**
 * PFL Live Data Parser
 *
 * Takes scraped pflmma.com event data and writes the changes into the DB.
 * Mirrors oneFCLiveParser's structure (same BackfillOptions, same shadow-field
 * routing via buildTrackerUpdateData, same 75%-floor cancellation guard).
 *
 * PFL-specific notes:
 *   - Method vocabulary is fixed and small (KO/TKO/SUB/DEC). The scraper has
 *     already normalized; this parser passes the value through unchanged.
 *   - All PFL events are MMA (no kickboxing/muay thai branches like ONE FC).
 *   - Daily scraper is reliable enough that the live-insert path here is
 *     defensive — if it triggers, log loudly so we can investigate.
 */

import { PrismaClient, WeightClass, Sport, Gender } from '@prisma/client';
import { PFLEventData, PFLFightData } from './pflLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData, BackfillOptions } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Find a DB fight by fighter last names (token-based, both orderings).
 * Same approach as oneFCLiveParser — handles minor first-name spelling drift.
 */
function findFightByFighters(
  dbFights: any[],
  scrapedA: { firstName: string; lastName: string },
  scrapedB: { firstName: string; lastName: string }
) {
  const normalize = (s: string) => stripDiacritics(s || '').toLowerCase().trim();

  const buildTokens = (f: { firstName: string; lastName: string }) => {
    const tokens = new Set<string>();
    const first = normalize(f.firstName);
    const last = normalize(f.lastName);
    if (first) tokens.add(first);
    if (last) tokens.add(last);
    return tokens;
  };

  const aTokens = buildTokens(scrapedA);
  const bTokens = buildTokens(scrapedB);

  return dbFights.find(fight => {
    const dbF1Tokens = buildTokens(fight.fighter1);
    const dbF2Tokens = buildTokens(fight.fighter2);

    const aMatchesF1 = [...aTokens].some(t => dbF1Tokens.has(t));
    const bMatchesF2 = [...bTokens].some(t => dbF2Tokens.has(t));
    const aMatchesF2 = [...aTokens].some(t => dbF2Tokens.has(t));
    const bMatchesF1 = [...bTokens].some(t => dbF1Tokens.has(t));

    return (aMatchesF1 && bMatchesF2) || (aMatchesF2 && bMatchesF1);
  });
}

/**
 * Map scraped winnerSide to a DB fighter ID by checking which scraped side
 * matches DB fighter1's last name.
 */
function getWinnerFighterId(
  scrapedFight: PFLFightData,
  fighter1: any,
  fighter2: any
): string | null {
  if (!scrapedFight.result?.winnerSide) return null;

  const scraperALast = stripDiacritics(scrapedFight.fighterA.lastName).toLowerCase();
  const dbF1Last = (fighter1.lastName || '').toLowerCase();

  const scraperAIsDbF1 =
    dbF1Last === scraperALast ||
    dbF1Last.includes(scraperALast) ||
    scraperALast.includes(dbF1Last);

  if (scrapedFight.result.winnerSide === 'A') {
    return scraperAIsDbF1 ? fighter1.id : fighter2.id;
  } else {
    return scraperAIsDbF1 ? fighter2.id : fighter1.id;
  }
}

/**
 * Notify users about the next upcoming fight after one completes.
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

// ============== LIVE-INSERT HELPERS ==============
//
// PFL's daily scraper is reliable, so this path is defensive. If a fight
// surfaces here that the daily scraper missed, log loudly — it likely means
// pflmma.com changed something or the daily run failed. We still create the
// fight so the live tracker doesn't crash on the missing row.

function parseWeightClassEnum(weightClassStr: string): WeightClass | null {
  const normalized = (weightClassStr || '').toLowerCase();
  if (normalized.includes('light heavy')) return WeightClass.LIGHT_HEAVYWEIGHT;
  if (normalized.includes('heavyweight')) return WeightClass.HEAVYWEIGHT;
  if (normalized.includes('middleweight')) return WeightClass.MIDDLEWEIGHT;
  if (normalized.includes('welterweight')) return WeightClass.WELTERWEIGHT;
  if (normalized.includes('lightweight')) return WeightClass.LIGHTWEIGHT;
  if (normalized.includes('featherweight')) return WeightClass.FEATHERWEIGHT;
  if (normalized.includes('bantamweight')) return WeightClass.BANTAMWEIGHT;
  if (normalized.includes('flyweight')) return WeightClass.FLYWEIGHT;
  if (normalized.includes('strawweight') || normalized.includes('atomweight')) return WeightClass.STRAWWEIGHT;
  return null;
}

async function upsertFighterForLiveInsert(
  fighter: { firstName: string; lastName: string },
  weightClass: WeightClass | null
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const firstName = (fighter.firstName || '').trim();
  const lastName = (fighter.lastName || '').trim();
  if (!firstName && !lastName) return null;

  try {
    return await prisma.fighter.upsert({
      where: { firstName_lastName: { firstName, lastName } },
      update: {}, // don't clobber values the daily scraper set
      create: {
        firstName,
        lastName,
        gender: Gender.MALE, // best-effort default; daily scraper corrects
        sport: Sport.MMA,
        weightClass: weightClass || undefined,
        isActive: true,
      },
      select: { id: true, firstName: true, lastName: true },
    });
  } catch (err) {
    console.error(`    ❌ Failed to upsert fighter ${firstName} ${lastName}:`, err);
    return null;
  }
}

async function createFightFromScrape(
  eventId: string,
  scrapedFight: PFLFightData
): Promise<any | null> {
  try {
    const weightClass = parseWeightClassEnum(scrapedFight.weightClass);
    const fighter1 = await upsertFighterForLiveInsert(scrapedFight.fighterA, weightClass);
    const fighter2 = await upsertFighterForLiveInsert(scrapedFight.fighterB, weightClass);
    if (!fighter1 || !fighter2) return null;
    if (fighter1.id === fighter2.id) {
      console.warn('    ⚠ Refusing to create fight with identical fighter1/fighter2');
      return null;
    }

    return await prisma.fight.create({
      data: {
        eventId,
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass,
        isTitle: scrapedFight.isTitle,
        scheduledRounds: scrapedFight.isTitle ? 5 : 3,
        orderOnCard: scrapedFight.order,
        cardType: 'Main Card',
        fightStatus: 'UPCOMING',
      },
      include: { fighter1: true, fighter2: true },
    });
  } catch (err) {
    console.error('    ❌ Failed to create fight from scrape:', err);
    return null;
  }
}

// ============== MAIN PARSER FUNCTION ==============

export async function parsePFLLiveData(
  liveData: PFLEventData,
  eventId: string,
  options: BackfillOptions = {}
): Promise<{ fightsUpdated: number; eventUpdated: boolean; cancelledCount: number; unCancelledCount: number }> {
  const isBackfill = !!(
    options.nullOnlyResults ||
    options.skipCancellationCheck ||
    options.skipNotifications ||
    options.completionMethodOverride
  );
  console.log(`\n${isBackfill ? '📦 [PFL BACKFILL]' : '📊 [PFL PARSER]'} Processing live data for: ${liveData.eventName}`);

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
      console.error(`  ❌ Event not found with ID: ${eventId}`);
      return { fightsUpdated: 0, eventUpdated: false, cancelledCount: 0, unCancelledCount: 0 };
    }

    console.log(`  ✓ Found event: ${event.name} (${event.fights.length} fights in DB)`);

    const scraperType = getEventTrackerType({ scraperType: event.scraperType });
    console.log(`  ⚙️  Scraper type: ${scraperType || 'none'}`);

    // Event-level transitions
    if (liveData.hasStarted && event.eventStatus === 'UPCOMING') {
      await prisma.event.update({
        where: { id: eventId },
        data: { eventStatus: 'LIVE' },
      });
      console.log(`  🔴 Event marked as STARTED`);
      eventUpdated = true;
    }

    if (liveData.isComplete && event.eventStatus !== 'COMPLETED') {
      await prisma.event.update({
        where: { id: eventId },
        data: {
          eventStatus: 'COMPLETED',
          completionMethod: options.completionMethodOverride || 'scraper',
        },
      });
      console.log(`  ✅ Event marked as COMPLETE`);
      eventUpdated = true;
    }

    console.log(`  🔍 Processing ${liveData.fights.length} fights from scraper...`);

    const scrapedFightSignatures = new Set<string>();

    for (const scrapedFight of liveData.fights) {
      const fighterAName = scrapedFight.fighterA.name;
      const fighterBName = scrapedFight.fighterB.name;
      const fighterALast = scrapedFight.fighterA.lastName;
      const fighterBLast = scrapedFight.fighterB.lastName;

      const fightSignature = [fighterALast, fighterBLast]
        .map(n => stripDiacritics(n).toLowerCase().trim())
        .sort()
        .join('|');
      scrapedFightSignatures.add(fightSignature);

      console.log(`  🔎 Looking for: ${fighterAName} vs ${fighterBName} (tokens: ${scrapedFight.fighterA.firstName}/${fighterALast} vs ${scrapedFight.fighterB.firstName}/${fighterBLast})`);

      let dbFight = findFightByFighters(
        event.fights,
        { firstName: scrapedFight.fighterA.firstName, lastName: fighterALast },
        { firstName: scrapedFight.fighterB.firstName, lastName: fighterBLast }
      );

      if (!dbFight) {
        // Defensive live-insert: daily scraper missed this matchup. Log loudly
        // so we can investigate later — for PFL this should be rare.
        console.warn(`    ⚠ Fight not in DB — daily scraper missed it. Inserting via live tracker.`);
        const created = await createFightFromScrape(eventId, scrapedFight);
        if (!created) {
          console.warn(`    ⚠ Could not create fight, skipping`);
          continue;
        }
        dbFight = created;
        event.fights.push(created);
      }

      console.log(`    ✓ Found: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);

      const updateData: any = {};
      let changed = false;

      if (scrapedFight.isLive && dbFight.fightStatus === 'UPCOMING') {
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`    🔴 Fight is LIVE`);

        if (!options.skipNotifications) {
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
      }

      if (scrapedFight.hasStarted && dbFight.fightStatus === 'UPCOMING') {
        updateData.fightStatus = 'LIVE';
        changed = true;
        console.log(`    🥊 Fight STARTED`);
      }

      if (scrapedFight.isComplete && dbFight.fightStatus !== 'COMPLETED') {
        updateData.fightStatus = 'COMPLETED';
        changed = true;
        console.log(`    ✅ Fight COMPLETE`);

        if (!options.skipNotifications) {
          await notifyNextFight(dbFight.eventId, dbFight.orderOnCard);
        }
      }

      if (scrapedFight.result && !dbFight.winner) {
        const winnerId = getWinnerFighterId(scrapedFight, dbFight.fighter1, dbFight.fighter2);
        if (winnerId) {
          updateData.winner = winnerId;
          changed = true;
          console.log(`    🏆 Winner: ${scrapedFight.result.winner}`);
        }

        if (scrapedFight.result.method) {
          updateData.method = scrapedFight.result.method;
          changed = true;
          console.log(`    📋 Method: ${scrapedFight.result.method}`);
        }

        if (scrapedFight.result.round) {
          updateData.round = scrapedFight.result.round;
          changed = true;
          console.log(`    🔢 Round: ${scrapedFight.result.round}`);
        }

        if (scrapedFight.result.time) {
          updateData.time = scrapedFight.result.time;
          changed = true;
          console.log(`    ⏱️  Time: ${scrapedFight.result.time}`);
        }

        // Encode draw / NC as winner = 'draw' / 'nc' so UI renders the badge
        if (!updateData.winner && scrapedFight.result.method) {
          const m = scrapedFight.result.method.toLowerCase();
          if (m === 'nc' || m.includes('no contest')) {
            updateData.winner = 'nc';
            changed = true;
            console.log(`    🤝 NO CONTEST`);
          } else if (m.includes('draw')) {
            updateData.winner = 'draw';
            changed = true;
            console.log(`    🤝 DRAW`);
          }
        }
      }

      if (changed) {
        if (
          options.completionMethodOverride &&
          updateData.fightStatus === 'COMPLETED' &&
          dbFight.fightStatus !== 'COMPLETED'
        ) {
          updateData.completionMethod = options.completionMethodOverride;
          updateData.completedAt = new Date();
        }

        const finalUpdateData = buildTrackerUpdateData(updateData, scraperType);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: finalUpdateData,
        });
        fightsUpdated++;
        console.log(`    💾 Fight updated`);
      }
    }

    // ============== CANCELLATION DETECTION ==============

    if (options.skipCancellationCheck) {
      console.log(`  ⏭️  [backfill] Skipping cancellation check`);
      console.log(`  ✅ Parser complete: ${fightsUpdated} fights updated\n`);
      return { fightsUpdated, eventUpdated, cancelledCount: 0, unCancelledCount: 0 };
    }

    console.log(`  🔍 Checking for cancelled/un-cancelled fights...`);
    let cancelledCount = 0;
    let unCancelledCount = 0;

    const dbNonCancelledCount = event.fights.filter(f => f.fightStatus !== 'CANCELLED').length;
    const scrapedCount = liveData.fights.length;
    const cancellationSafetyFloor = Math.max(2, Math.floor(dbNonCancelledCount * 0.75));
    const scrapeLooksComplete = scrapedCount >= cancellationSafetyFloor;

    if (!scrapeLooksComplete && dbNonCancelledCount > 0) {
      console.log(`  ⚠️  Skipping cancellation (scrape returned ${scrapedCount} fights, DB has ${dbNonCancelledCount} non-cancelled, need ≥${cancellationSafetyFloor}). Treating as partial scrape.`);
    }

    for (const dbFight of event.fights) {
      if (dbFight.fightStatus === 'COMPLETED') continue;

      const dbFightSignature = [dbFight.fighter1.lastName, dbFight.fighter2.lastName]
        .map(n => n.toLowerCase().trim())
        .sort()
        .join('|');

      const fightIsInScrapedData = scrapedFightSignatures.has(dbFightSignature);

      if (dbFight.fightStatus === 'CANCELLED' && fightIsInScrapedData) {
        console.log(`  ✅ Fight reappeared, UN-CANCELLING: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        await prisma.fight.update({
          where: { id: dbFight.id },
          data: { fightStatus: 'UPCOMING' },
        });
        unCancelledCount++;
      } else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData && scrapeLooksComplete) {
        console.log(`  ⚠️  Fight missing from scraped data: ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        if (event.eventStatus !== 'UPCOMING' || liveData.hasStarted) {
          console.log(`  ❌ Marking fight as CANCELLED`);
          await prisma.fight.update({
            where: { id: dbFight.id },
            data: { fightStatus: 'CANCELLED' },
          });
          cancelledCount++;
        } else {
          console.log(`  ℹ️  Event hasn't started yet, not marking as cancelled`);
        }
      }
    }

    if (cancelledCount > 0) console.log(`  ⚠️  Marked ${cancelledCount} fights as cancelled`);
    if (unCancelledCount > 0) console.log(`  ✅ Un-cancelled ${unCancelledCount} fights`);

    console.log(`  ✅ Parser complete: ${fightsUpdated} fights updated, ${cancelledCount} cancelled, ${unCancelledCount} un-cancelled\n`);
    return { fightsUpdated, eventUpdated, cancelledCount, unCancelledCount };
  } catch (error) {
    console.error('  ❌ Parser error:', error);
    throw error;
  }
}

/**
 * Check if all non-cancelled fights in event are complete.
 */
export async function checkPFLEventComplete(eventId: string): Promise<{ allComplete: boolean; eventAlreadyComplete: boolean }> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
        where: { fightStatus: { not: 'CANCELLED' } },
        select: { fightStatus: true },
      },
    },
  });

  if (!event || event.fights.length === 0) {
    return { allComplete: false, eventAlreadyComplete: false };
  }

  const allFightsComplete = event.fights.every(fight => fight.fightStatus === 'COMPLETED');
  return { allComplete: allFightsComplete, eventAlreadyComplete: event.eventStatus === 'COMPLETED' };
}

/**
 * Auto-complete event if all fights are done.
 * Returns true if event is now complete (either just marked or already was).
 */
export async function autoCompletePFLEvent(eventId: string): Promise<boolean> {
  const { allComplete, eventAlreadyComplete } = await checkPFLEventComplete(eventId);

  if (eventAlreadyComplete) return true;

  if (allComplete) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        eventStatus: 'COMPLETED',
        completionMethod: 'scraper',
      },
    });
    console.log(`  🎉 Event ${eventId} auto-marked as complete`);
    return true;
  }

  return false;
}
