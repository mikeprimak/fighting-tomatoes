/**
 * Tapology Live Parser
 *
 * Takes scraped Tapology data and updates the database.
 * Matches fights by fighter last names and updates results.
 */

import { PrismaClient } from '@prisma/client';
import { TapologyEventData, TapologyFight } from './tapologyLiveScraper';
import { stripDiacritics, similarityScore } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ParseResult {
  fightsUpdated: number;
  fightsMatched: number;
  fightsNotFound: string[];
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

      const dbFight = findMatchingDbFight(event.fights, nameA, nameB);

      if (!dbFight) {
        const label = `${extractLastName(nameA)} vs ${extractLastName(nameB)}`;
        result.fightsNotFound.push(label);
        console.log(`  ?? ${label} - not found in DB`);
        continue;
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

      // Handle completed fights
      if (scrapedFight.isComplete && dbFight.fightStatus !== 'COMPLETED') {
        updateData.fightStatus = 'COMPLETED';
        updateData.completionMethod = 'tapology-scraper';
        updateData.completedAt = new Date();
        changed = true;

        // Determine winner
        if (scrapedFight.result?.winner) {
          const winnerId = getWinnerFighterId(
            scrapedFight.result.winner,
            dbFight.fighter1,
            dbFight.fighter2
          );
          if (winnerId) {
            updateData.winner = winnerId;
          }
        }

        if (scrapedFight.result?.method) {
          updateData.method = scrapedFight.result.method;
        }

        if (scrapedFight.result?.round) {
          updateData.round = scrapedFight.result.round;
        }

        if (scrapedFight.result?.time) {
          updateData.time = scrapedFight.result.time;
        }

        const winnerName = updateData.winner
          ? (updateData.winner === dbFight.fighter1.id ? dbFight.fighter1.lastName : dbFight.fighter2.lastName)
          : '?';
        console.log(`  DONE ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} -> ${winnerName} by ${scrapedFight.result?.method || '?'}`);

        // Fire next-fight notification (don't await — non-blocking)
        notifyNextFight(eventId, dbFight.orderOnCard);
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

    if (hasStarted) {
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

    // Update event status
    if (hasStarted && event.eventStatus === 'UPCOMING') {
      await prisma.event.update({ where: { id: eventId }, data: { eventStatus: 'LIVE' } });
      console.log(`  Event -> LIVE`);
    }

    console.log(`\n[Tapology Parser] Done: ${result.fightsUpdated} updated, ${result.fightsMatched} matched, ${result.cancelledCount} cancelled, ${result.unCancelledCount} un-cancelled`);
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
