/**
 * Tapology Live Parser
 *
 * Takes scraped Tapology data and updates the database.
 * Matches fights by fighter last names and updates results.
 */

import { PrismaClient } from '@prisma/client';
import { TapologyEventData, TapologyFight } from './tapologyLiveScraper';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getEventTrackerType, buildTrackerUpdateData } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

// ============== TYPE DEFINITIONS ==============

interface ParseResult {
  fightsUpdated: number;
  fightsMatched: number;
  fightsNotFound: string[];
}

// ============== HELPER FUNCTIONS ==============

/**
 * Extract last name from full name
 */
function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Normalize name for matching (remove accents including ł/đ/ø/æ/ß, lowercase)
 */
function normalizeName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .trim();
}

/**
 * Create a fight signature from two fighter names (sorted for consistency)
 */
function createFightSignature(name1: string, name2: string): string {
  return [normalizeName(getLastName(name1)), normalizeName(getLastName(name2))]
    .sort()
    .join('|');
}

// ============== MAIN PARSER ==============

/**
 * Parse Tapology data and update database for a specific event
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
  };

  try {
    // Get event to determine scraper type
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { scraperType: true },
    });
    const scraperType = getEventTrackerType({
      scraperType: event?.scraperType,
    });
    console.log(`[Tapology Parser] Scraper type: ${scraperType || 'none'}`);

    // Get all fights for this event from database
    const dbFights = await prisma.fight.findMany({
      where: { eventId },
      include: {
        fighter1: { select: { id: true, firstName: true, lastName: true } },
        fighter2: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    console.log(`[Tapology Parser] Found ${dbFights.length} fights in database`);

    // Create signature map for DB fights
    const dbFightMap = new Map<string, typeof dbFights[0]>();
    for (const fight of dbFights) {
      const sig = createFightSignature(fight.fighter1.lastName, fight.fighter2.lastName);
      dbFightMap.set(sig, fight);
    }

    // Process each scraped fight
    for (const scrapedFight of scrapedData.fights) {
      // Skip incomplete fights
      if (!scrapedFight.isComplete) continue;

      const sig = createFightSignature(
        scrapedFight.fighterA.name,
        scrapedFight.fighterB.name
      );

      const dbFight = dbFightMap.get(sig);

      if (!dbFight) {
        // Fight not in our database (might be from another event on the page)
        continue;
      }

      result.fightsMatched++;

      // Skip if already complete in DB
      if (dbFight.fightStatus === 'COMPLETED') {
        console.log(`  ⏭️  ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} - already complete`);
        continue;
      }

      // Determine winner ID
      let winnerId: string | null = null;
      if (scrapedFight.result?.winner) {
        const winnerLastName = normalizeName(getLastName(scrapedFight.result.winner));
        if (normalizeName(dbFight.fighter1.lastName) === winnerLastName) {
          winnerId = dbFight.fighter1.id;
        } else if (normalizeName(dbFight.fighter2.lastName) === winnerLastName) {
          winnerId = dbFight.fighter2.id;
        }
      }

      // Build update data
      const updateData: any = {
        fightStatus: 'COMPLETED',
        completionMethod: 'tapology-scraper',
        completedAt: new Date(),
      };

      if (winnerId) {
        updateData.winner = winnerId;
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

      // Update the fight (route through shadow field helper)
      const finalUpdateData = buildTrackerUpdateData(updateData, scraperType);
      await prisma.fight.update({
        where: { id: dbFight.id },
        data: finalUpdateData,
      });

      const winnerName = winnerId
        ? (winnerId === dbFight.fighter1.id ? dbFight.fighter1.lastName : dbFight.fighter2.lastName)
        : 'Unknown';

      console.log(`  ✅ ${dbFight.fighter1.lastName} vs ${dbFight.fighter2.lastName} → ${winnerName} by ${scrapedFight.result?.method || '?'}`);
      result.fightsUpdated++;
    }

    // Mark event as started if any fights updated
    if (result.fightsUpdated > 0) {
      await prisma.event.update({
        where: { id: eventId },
        data: { eventStatus: 'LIVE' },
      });
    }

    console.log(`\n[Tapology Parser] Complete: ${result.fightsUpdated} updated, ${result.fightsMatched} matched`);
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
