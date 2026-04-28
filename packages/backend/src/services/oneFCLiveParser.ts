/**
 * ONE FC Live Data Parser
 * Takes scraped live event data and updates the database
 * Detects changes in event status, fight status, and results
 */

import { PrismaClient, WeightClass, Sport, Gender } from '@prisma/client';
import { OneFCEventData, OneFCFightData } from './oneFCLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== UTILITY FUNCTIONS ==============

/**
 * Find fight by fighter names.
 *
 * Primary match: scraped lastName vs DB lastName (both sides, any order).
 *
 * Fallback for the JSON-LD-name transition: some ONE FC fighters still
 * exist in the DB under single-word rows (firstName='', lastName='Rittidet')
 * from the pre-JSON-LD scraper era. Once the scraper starts emitting the
 * full name (firstName='Rittidet', lastName='Lukjaoporongtom'), lastName
 * matching against the old row fails. Fall back to matching the scraped
 * firstName against the DB lastName so we keep tracking the old row until
 * a backfill renames it. The match is mutual-exclusive across sides so
 * fights with both fighters transitioning still resolve.
 */
function findFightByFighters(dbFights: any[], scrapedFighterA: { firstName: string; lastName: string }, scrapedFighterB: { firstName: string; lastName: string }) {
  const normalize = (s: string) => stripDiacritics(s || '').toLowerCase().trim();

  const buildTokens = (f: { firstName: string; lastName: string }) => {
    const tokens = new Set<string>();
    const first = normalize(f.firstName);
    const last = normalize(f.lastName);
    if (first) tokens.add(first);
    if (last) tokens.add(last);
    return tokens;
  };

  const aTokens = buildTokens(scrapedFighterA);
  const bTokens = buildTokens(scrapedFighterB);

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

// ============== LIVE-INSERT HELPERS ==============
//
// When the live scraper surfaces a fight the daily scraper never imported
// (common when ONE FC publishes late additions — e.g. the Inner Circle
// companion card — after the last daily run), we insert it on the fly so
// users see the full card even though we found it live. These helpers are
// scoped to that path; the daily scraper still owns the canonical import
// and will overwrite gender/sport/weightClass with better-parsed values on
// its next run.

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
  // ONE's atomweight maps to strawweight (matches daily scraper)
  if (normalized.includes('strawweight') || normalized.includes('atomweight')) return WeightClass.STRAWWEIGHT;
  return null;
}

function parseSportEnum(sportStr: string): Sport {
  const normalized = (sportStr || '').toLowerCase();
  if (normalized.includes('muay thai')) return Sport.MUAY_THAI;
  if (normalized.includes('kickboxing')) return Sport.KICKBOXING;
  return Sport.MMA;
}

async function upsertFighterForLiveInsert(
  fighter: { firstName: string; lastName: string },
  sport: Sport,
  weightClass: WeightClass | null
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const firstName = (fighter.firstName || '').trim();
  const lastName = (fighter.lastName || '').trim();
  if (!firstName && !lastName) return null;

  try {
    return await prisma.fighter.upsert({
      where: { firstName_lastName: { firstName, lastName } },
      update: {}, // don't clobber anything the daily scraper set
      create: {
        firstName,
        lastName,
        gender: Gender.MALE, // best-effort default; daily scraper corrects
        sport,
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
  scrapedFight: OneFCFightData
): Promise<any | null> {
  try {
    const weightClass = parseWeightClassEnum(scrapedFight.weightClass);
    const sport = parseSportEnum(scrapedFight.sport);

    const fighter1 = await upsertFighterForLiveInsert(scrapedFight.fighterA, sport, weightClass);
    const fighter2 = await upsertFighterForLiveInsert(scrapedFight.fighterB, sport, weightClass);
    if (!fighter1 || !fighter2) return null;
    if (fighter1.id === fighter2.id) {
      console.warn('    ⚠ Refusing to create fight with identical fighter1/fighter2');
      return null;
    }

    const titleName = scrapedFight.isTitle
      ? `ONE ${scrapedFight.weightClass} World Championship`
      : undefined;

    return await prisma.fight.create({
      data: {
        eventId,
        fighter1Id: fighter1.id,
        fighter2Id: fighter2.id,
        weightClass,
        isTitle: scrapedFight.isTitle,
        titleName,
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

      console.log(`  🔎 Looking for: ${fighterAName} vs ${fighterBName} (tokens: ${scrapedFight.fighterA.firstName}/${fighterALast} vs ${scrapedFight.fighterB.firstName}/${fighterBLast})`);

      let dbFight = findFightByFighters(
        event.fights,
        { firstName: scrapedFight.fighterA.firstName, lastName: fighterALast },
        { firstName: scrapedFight.fighterB.firstName, lastName: fighterBLast },
      );

      if (!dbFight) {
        // Late-addition path: daily scraper never imported this matchup
        // (e.g. ONE FC "Inner Circle" card added after the last daily run).
        // Create the fight live so the rest of the poll can update it
        // normally and cancellation detection doesn't flag it as missing.
        console.log(`    ➕ Fight not in DB — inserting via live scraper`);
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

        // Draw / No Contest: scraper indicates outcome via method but no winner side.
        // Encode as winner='draw'/'nc' so UI renders the badge.
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

    // Guard against partial/glitchy scrapes mass-cancelling legit fights.
    // If the scrape returned materially fewer fights than the DB has
    // (non-cancelled), it's most likely a transient page render issue —
    // skip cancellation this poll. Un-cancellation is always safe to run
    // since it only triggers when the fight *reappears* in the scrape.
    const dbNonCancelledCount = event.fights.filter(f => f.fightStatus !== 'CANCELLED').length;
    const scrapedCount = liveData.fights.length;
    const cancellationSafetyFloor = Math.max(2, Math.floor(dbNonCancelledCount * 0.75));
    const scrapeLooksComplete = scrapedCount >= cancellationSafetyFloor;

    if (!scrapeLooksComplete && dbNonCancelledCount > 0) {
      console.log(`  ⚠️  Skipping cancellation (scrape returned ${scrapedCount} fights, DB has ${dbNonCancelledCount} non-cancelled, need ≥${cancellationSafetyFloor}). Treating as partial scrape.`);
    }

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
      // (only if this scrape looks complete — otherwise defer to a later poll)
      else if (dbFight.fightStatus !== 'CANCELLED' && !fightIsInScrapedData && scrapeLooksComplete) {
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
