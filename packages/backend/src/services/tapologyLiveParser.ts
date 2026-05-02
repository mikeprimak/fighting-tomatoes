/**
 * Tapology Live Parser
 *
 * Takes scraped Tapology data and updates the database.
 * Matches fights by fighter last names and updates results.
 */

import { PrismaClient, Gender, Sport } from '@prisma/client';
import { TapologyEventData, TapologyFight } from './tapologyLiveScraper';
import { stripDiacritics, similarityScore } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';
import { syncFighterFollowMatchesForFight } from './notificationRuleEngine';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ParseResult {
  fightsUpdated: number;
  fightsMatched: number;
  fightsNotFound: string[];
  fightsCreated: number;
  cancelledCount: number;
  unCancelledCount: number;
}

// ============== HELPER FUNCTIONS ==============

/**
 * Normalize name for matching (remove accents including ł/đ/ø/æ/ß, lowercase)
 */
function normalizeName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .trim();
}

/**
 * Compact a name by removing spaces, hyphens, periods, apostrophes.
 * "Al-Silawi" → "alsilawi", "Lipski da Silva" → "lipskidasilva"
 */
function compactName(name: string): string {
  return normalizeName(name).replace(/[\s\-.']/g, '');
}

/**
 * Extract last name from full name (everything after first space, or the whole name)
 */
function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
}

/**
 * Find a matching DB fight for a scraped fight using multiple strategies.
 * Returns the matched DB fight or undefined.
 */
function findMatchingDbFight(
  dbFights: any[],
  scrapedNameA: string,
  scrapedNameB: string
): any | undefined {
  const sA = normalizeName(extractLastName(scrapedNameA));
  const sB = normalizeName(extractLastName(scrapedNameB));
  const sACompact = compactName(extractLastName(scrapedNameA));
  const sBCompact = compactName(extractLastName(scrapedNameB));
  // Also try full name compact (for names stored as single lastName like "Lipskidasilva")
  const sAFullCompact = compactName(scrapedNameA);
  const sBFullCompact = compactName(scrapedNameB);

  for (const fight of dbFights) {
    const d1 = normalizeName(fight.fighter1.lastName);
    const d2 = normalizeName(fight.fighter2.lastName);
    const d1Compact = compactName(fight.fighter1.lastName);
    const d2Compact = compactName(fight.fighter2.lastName);

    // Strategy 1: Exact last name match (bidirectional)
    if ((d1 === sA && d2 === sB) || (d1 === sB && d2 === sA)) return fight;

    // Strategy 2: Compact match (removes hyphens/spaces — "Al-Silawi" matches "Alsalawi")
    if ((d1Compact === sACompact && d2Compact === sBCompact) ||
        (d1Compact === sBCompact && d2Compact === sACompact)) return fight;

    // Strategy 3: Full name compact vs DB lastName compact
    // Handles "Ariane Lipski da Silva" → compact "arianelipskidasilva" contains DB "lipskidasilva"
    if ((d1Compact === sAFullCompact && d2Compact === sBFullCompact) ||
        (d1Compact === sBFullCompact && d2Compact === sAFullCompact)) return fight;
    if ((sAFullCompact.includes(d1Compact) && sBFullCompact.includes(d2Compact)) ||
        (sAFullCompact.includes(d2Compact) && sBFullCompact.includes(d1Compact))) return fight;

    // Strategy 4: Partial/contains match on last names
    if ((d1.includes(sA) || sA.includes(d1)) && (d2.includes(sB) || sB.includes(d2))) return fight;
    if ((d1.includes(sB) || sB.includes(d1)) && (d2.includes(sA) || sA.includes(d2))) return fight;

    // Strategy 5: Similarity score on compact names (handles spelling variations like "Silawi" vs "Salawi")
    const sim1A2B = similarityScore(d1Compact, sACompact) + similarityScore(d2Compact, sBCompact);
    const sim1B2A = similarityScore(d1Compact, sBCompact) + similarityScore(d2Compact, sACompact);
    // Both fighters must score >= 0.8 individually (sum >= 1.6)
    if (sim1A2B >= 1.6 && Math.min(similarityScore(d1Compact, sACompact), similarityScore(d2Compact, sBCompact)) >= 0.8) return fight;
    if (sim1B2A >= 1.6 && Math.min(similarityScore(d1Compact, sBCompact), similarityScore(d2Compact, sACompact)) >= 0.8) return fight;
  }

  return undefined;
}

/**
 * Split a Tapology-style full name into firstName/lastName.
 * "Abdelrahman Mohamed" → { Abdelrahman, Mohamed }
 * "Abdul Razac Sankara" → { "Abdul Razac", "Sankara" }
 * Single-word names go into lastName.
 */
function parseFighterName(fullName: string): { firstName: string; lastName: string } {
  const clean = fullName.trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: '', lastName: stripDiacritics(parts[0]) };
  }
  const lastName = stripDiacritics(parts[parts.length - 1]);
  const firstName = stripDiacritics(parts.slice(0, -1).join(' '));
  return { firstName, lastName };
}

/**
 * Find an existing fighter by first/last name or create a minimal record.
 * Mirrors the pattern from ufcLiveParser so new fighters added mid-event
 * get cleaned up later by the daily scraper.
 */
async function findOrCreateFighter(fullName: string): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const { firstName, lastName } = parseFighterName(fullName);
  if (!lastName) return null;

  try {
    const fighter = await prisma.fighter.upsert({
      where: { firstName_lastName: { firstName, lastName } },
      update: {},
      create: {
        firstName,
        lastName,
        gender: Gender.MALE,
        sport: Sport.MMA,
        isActive: true,
        wins: 0,
        losses: 0,
        draws: 0,
        noContests: 0,
      },
      select: { id: true, firstName: true, lastName: true },
    });
    return fighter;
  } catch (err: any) {
    console.error(`[Tapology Parser] Failed to upsert fighter "${fullName}":`, err.message);
    return null;
  }
}

/**
 * Determine winner fighter ID from winner name
 */
function getWinnerFighterId(winnerName: string, fighter1: any, fighter2: any): string | null {
  if (!winnerName) return null;

  const winnerLast = normalizeName(extractLastName(winnerName));
  const winnerCompact = compactName(extractLastName(winnerName));
  const winnerFullCompact = compactName(winnerName);

  const f1 = normalizeName(fighter1.lastName);
  const f2 = normalizeName(fighter2.lastName);
  const f1Compact = compactName(fighter1.lastName);
  const f2Compact = compactName(fighter2.lastName);

  // Exact
  if (f1 === winnerLast) return fighter1.id;
  if (f2 === winnerLast) return fighter2.id;

  // Compact
  if (f1Compact === winnerCompact) return fighter1.id;
  if (f2Compact === winnerCompact) return fighter2.id;

  // Full compact contains
  if (winnerFullCompact.includes(f1Compact) || f1Compact.includes(winnerCompact)) return fighter1.id;
  if (winnerFullCompact.includes(f2Compact) || f2Compact.includes(winnerCompact)) return fighter2.id;

  // Partial
  if (f1.includes(winnerLast) || winnerLast.includes(f1)) return fighter1.id;
  if (f2.includes(winnerLast) || winnerLast.includes(f2)) return fighter2.id;

  // Similarity fallback
  const sim1 = similarityScore(f1Compact, winnerCompact);
  const sim2 = similarityScore(f2Compact, winnerCompact);
  if (sim1 >= 0.8 && sim1 > sim2) return fighter1.id;
  if (sim2 >= 0.8 && sim2 > sim1) return fighter2.id;

  return null;
}

/**
 * Create a compact fight signature for cancellation tracking
 */
function createFightSignature(fighter1LastName: string, fighter2LastName: string): string {
  return [compactName(fighter1LastName), compactName(fighter2LastName)].sort().join('|');
}

// ============== MAIN PARSER ==============

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

/**
 * Parse Tapology data and update database for a specific event.
 * Handles: fight completion, cancellations, un-cancellations, lifecycle resets.
 */
export async function parseTapologyData(
  eventId: string,
  scrapedData: TapologyEventData
): Promise<ParseResult> {
  console.log(`\n[Tapology Parser] Processing ${scrapedData.fights.length} scraped fights`);
  console.log(`[Tapology Parser] Event ID: ${eventId}`);

  const result: ParseResult = {
    fightsUpdated: 0,
    fightsMatched: 0,
    fightsNotFound: [],
    fightsCreated: 0,
    cancelledCount: 0,
    unCancelledCount: 0,
  };

  try {
    // Get event with fights
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        fights: {
          include: {
            fighter1: { select: { id: true, firstName: true, lastName: true } },
            fighter2: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!event) {
      console.error(`[Tapology Parser] Event not found: ${eventId}`);
      return result;
    }

    const scraperType = getEventTrackerType({ scraperType: event.scraperType });
    console.log(`[Tapology Parser] Scraper type: ${scraperType || 'none'}`);
    console.log(`[Tapology Parser] DB fights: ${event.fights.length}, Scraped: ${scrapedData.fights.length}`);

    // Track which DB fights were found in the scraped data (for cancellation detection)
    const matchedDbFightIds = new Set<string>();

    // Process each scraped fight
    for (const scrapedFight of scrapedData.fights) {
      const nameA = scrapedFight.fighterA.name;
      const nameB = scrapedFight.fighterB.name;

      let dbFight = findMatchingDbFight(event.fights, nameA, nameB);

      // If not in DB, create the fight on-the-fly — the daily scraper may have
      // missed it, or it may have been added to the card after the daily run.
      if (!dbFight) {
        const label = `${extractLastName(nameA)} vs ${extractLastName(nameB)}`;
        console.log(`  NEW ${label} - not in DB, creating...`);

        const fighter1 = await findOrCreateFighter(nameA);
        const fighter2 = await findOrCreateFighter(nameB);

        if (!fighter1 || !fighter2) {
          console.warn(`  SKIP ${label} - fighter create failed`);
          result.fightsNotFound.push(label);
          continue;
        }

        // Pick an orderOnCard. Prefer Tapology's bout number if it doesn't
        // collide with an existing fight; otherwise fall back to max + 1.
        const usedOrders = new Set(event.fights.map(f => f.orderOnCard));
        const maxOrder = event.fights.reduce((m, f) => Math.max(m, f.orderOnCard), 0);
        const desired = scrapedFight.boutOrder;
        const orderOnCard = (desired && !usedOrders.has(desired)) ? desired : (maxOrder + 1);

        try {
          const created = await prisma.fight.create({
            data: {
              eventId: event.id,
              fighter1Id: fighter1.id,
              fighter2Id: fighter2.id,
              orderOnCard,
              cardType: null,
              scheduledRounds: 3,
              fightStatus: 'UPCOMING',
            },
          });

          await syncFighterFollowMatchesForFight(created.id).catch(err =>
            console.warn('[FollowSync]', err)
          );

          // Synthesize a dbFight-shaped object so the rest of the loop can
          // update it immediately with the scraped result (e.g. for a fight
          // that Tapology already has as completed).
          dbFight = {
            ...created,
            fighter1,
            fighter2,
          };
          event.fights.push(dbFight);
          result.fightsCreated++;
          console.log(`  CREATED ${fighter1.lastName} vs ${fighter2.lastName} (orderOnCard=${orderOnCard})`);
        } catch (err: any) {
          console.error(`  FAIL to create fight ${label}:`, err.message);
          result.fightsNotFound.push(label);
          continue;
        }
      }

      result.fightsMatched++;
      matchedDbFightIds.add(dbFight.id);

      const updateData: any = {};
      let changed = false;

      // Reset lifecycle-completed fights (COMPLETED with no winner = premature lifecycle completion)
      if (!scrapedFight.isComplete && !scrapedFight.isCancelled &&
          dbFight.fightStatus === 'COMPLETED' && !dbFight.winner) {
        updateData.fightStatus = 'UPCOMING';
        changed = true;
        console.log(`    Reset ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} to UPCOMING (lifecycle premature)`);
      }

      // Handle completed fights — this is idempotent: if the DB fight is
      // already COMPLETED but missing method/winner (e.g. prematurely marked
      // by the lifecycle job), we still write the scraped result.
      if (scrapedFight.isComplete) {
        const isNoContest = scrapedFight.result?.method === 'NC';
        const isDraw = scrapedFight.result?.method === 'DRAW';

        // Determine winner: real fighter ID, "nc", "draw", or null
        let scrapedWinnerValue: string | null = null;
        if (isNoContest) {
          scrapedWinnerValue = 'nc';
        } else if (isDraw) {
          scrapedWinnerValue = 'draw';
        } else if (scrapedFight.result?.winner) {
          scrapedWinnerValue = getWinnerFighterId(
            scrapedFight.result.winner,
            dbFight.fighter1,
            dbFight.fighter2
          );
        }

        const wasAlreadyCompleted = dbFight.fightStatus === 'COMPLETED';

        if (!wasAlreadyCompleted) {
          updateData.fightStatus = 'COMPLETED';
          updateData.completionMethod = 'tapology-scraper';
          updateData.completedAt = new Date();
          changed = true;
        }

        // Write result fields whenever the scraper has them AND the DB
        // doesn't already have a matching value. This lets us fill in a
        // previously-premature completion, and specifically lets us land
        // an NC result on a fight that was auto-completed without data.
        if (scrapedWinnerValue && dbFight.winner !== scrapedWinnerValue) {
          updateData.winner = scrapedWinnerValue;
          changed = true;
        }
        if (scrapedFight.result?.method && dbFight.method !== scrapedFight.result.method) {
          updateData.method = scrapedFight.result.method;
          changed = true;
        }
        // For decisions/draws/NC the fight went the distance, so there is no
        // ended-in round or end-time. Clear any stale values left behind by
        // an earlier buggy scrape that pulled bogus numbers from the <li>.
        const scrapedMethod = scrapedFight.result?.method;
        const wentTheDistance = scrapedMethod &&
          ['DEC', 'UD', 'SD', 'MD', 'DRAW', 'NC'].includes(scrapedMethod);
        if (wentTheDistance) {
          if (dbFight.round !== null) { updateData.round = null; changed = true; }
          if (dbFight.time !== null) { updateData.time = null; changed = true; }
        } else {
          if (scrapedFight.result?.round && dbFight.round !== scrapedFight.result.round) {
            updateData.round = scrapedFight.result.round;
            changed = true;
          }
          if (scrapedFight.result?.time && dbFight.time !== scrapedFight.result.time) {
            updateData.time = scrapedFight.result.time;
            changed = true;
          }
        }

        if (changed) {
          let winnerDesc = '?';
          if (scrapedWinnerValue === 'nc') winnerDesc = 'NO CONTEST';
          else if (scrapedWinnerValue === 'draw') winnerDesc = 'DRAW';
          else if (scrapedWinnerValue === dbFight.fighter1.id) winnerDesc = dbFight.fighter1.lastName;
          else if (scrapedWinnerValue === dbFight.fighter2.id) winnerDesc = dbFight.fighter2.lastName;
          console.log(`  DONE ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} -> ${winnerDesc} by ${scrapedFight.result?.method || '?'}`);
        }

        // Fire next-fight notification only on the transition to COMPLETED
        if (!wasAlreadyCompleted) {
          notifyNextFight(eventId, dbFight.orderOnCard);
        }
      }

      // Handle scraped cancellations
      if (scrapedFight.isCancelled && dbFight.fightStatus !== 'CANCELLED') {
        updateData.fightStatus = 'CANCELLED';
        changed = true;
        result.cancelledCount++;
        console.log(`  CANCEL ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} (scraped as cancelled)`);
      }

      if (changed) {
        const finalData = buildTrackerUpdateData(updateData, scraperType);
        await prisma.fight.update({ where: { id: dbFight.id }, data: finalData });
        result.fightsUpdated++;
      }
    }

    // Cancellation detection: DB fights not in scraped data
    // Only do this if the event appears to have started (some fights completed or event is LIVE)
    const hasStarted = event.eventStatus === 'LIVE' ||
      scrapedData.status === 'live' || scrapedData.status === 'complete' ||
      scrapedData.fights.some(f => f.isComplete);

    // Safety guard: never run the missing-from-page cancellation sweep or the
    // UPCOMING→LIVE flip if the scrape came back empty or matched zero DB fights.
    // A broken/empty scrape would otherwise cancel every fight on the card and
    // trigger auto-completion of an event that hasn't happened yet (DBX 6 incident).
    const scrapeLooksValid = scrapedData.fights.length > 0 && result.fightsMatched > 0;
    if (hasStarted && !scrapeLooksValid) {
      console.log(
        `[Tapology Parser] Skipping cancellation sweep and LIVE flip: scrape looks empty ` +
        `(scraped=${scrapedData.fights.length}, matched=${result.fightsMatched})`
      );
    }

    // Once an event is COMPLETED, the card is frozen. The missing-from-page
    // sweep should not run — any "missing" is almost certainly a Tapology UI
    // quirk (pagination, exhibition hidden, stale cache), not a real cancel.
    // Result backfills for completed events still update winner/method/round
    // via the per-fight block above; only the sweep is skipped here.
    const eventIsComplete = event.eventStatus === 'COMPLETED';
    if (hasStarted && scrapeLooksValid && eventIsComplete) {
      console.log('[Tapology Parser] Skipping cancellation sweep: event already COMPLETED (backfill mode)');
    }

    if (hasStarted && scrapeLooksValid && !eventIsComplete) {
      for (const dbFight of event.fights) {
        // Skip fights already completed with results or already cancelled
        if (dbFight.fightStatus === 'COMPLETED' && dbFight.winner) continue;

        const inScraped = matchedDbFightIds.has(dbFight.id);

        // Un-cancel: fight was CANCELLED in DB but reappeared in scraped data
        if (dbFight.fightStatus === 'CANCELLED' && inScraped) {
          await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'UPCOMING' } });
          result.unCancelledCount++;
          console.log(`  UN-CANCEL ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName}`);
        }
        // Cancel: fight in DB but missing from scraped data
        else if (dbFight.fightStatus !== 'CANCELLED' && !inScraped) {
          await prisma.fight.update({ where: { id: dbFight.id }, data: { fightStatus: 'CANCELLED' } });
          result.cancelledCount++;
          console.log(`  CANCEL ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} (missing from page)`);
        }
      }
    }

    // Update event status (guarded by scrapeLooksValid so an empty scrape can't flip LIVE)
    if (hasStarted && scrapeLooksValid && event.eventStatus === 'UPCOMING') {
      await prisma.event.update({ where: { id: eventId }, data: { eventStatus: 'LIVE' } });
      console.log(`  Event -> LIVE`);
    }

    console.log(`\n[Tapology Parser] Done: ${result.fightsUpdated} updated, ${result.fightsMatched} matched, ${result.fightsCreated} created, ${result.cancelledCount} cancelled, ${result.unCancelledCount} un-cancelled`);
    if (result.fightsNotFound.length > 0) {
      console.log(`[Tapology Parser] Not found: ${result.fightsNotFound.join(', ')}`);
    }
    return result;

  } catch (error: any) {
    console.error(`[Tapology Parser] Error: ${error.message}`);
    throw error;
  }
}

/**
 * Scrape and parse in one step
 */
export async function scrapeAndParse(
  eventId: string,
  tapologyUrl: string
): Promise<ParseResult> {
  // Import scraper dynamically to avoid circular deps
  const { TapologyLiveScraper } = await import('./tapologyLiveScraper');

  console.log(`\n[Tapology] Scraping and parsing: ${tapologyUrl}`);

  const scraper = new TapologyLiveScraper(tapologyUrl);
  const scrapedData = await scraper.scrape();

  return parseTapologyData(eventId, scrapedData);
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventId = process.argv[2];
  const tapologyUrl = process.argv[3] || 'https://www.tapology.com/fightcenter/events/137070-zuffa-boxing';

  if (!eventId) {
    console.error('Usage: npx ts-node tapologyLiveParser.ts <eventId> [tapologyUrl]');
    console.error('Example: npx ts-node tapologyLiveParser.ts 3ce5be31-4d9c-4042-b7cb-97b6b440ad78');
    process.exit(1);
  }

  scrapeAndParse(eventId, tapologyUrl)
    .then(result => {
      console.log('\n📊 Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default { parseTapologyData, scrapeAndParse };
