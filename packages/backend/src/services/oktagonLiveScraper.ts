/**
 * OKTAGON MMA Live Event Scraper
 *
 * Scrapes live fight data from oktagonmma.com event pages during active events.
 * OKTAGON uses Next.js with server-side rendered data in __NEXT_DATA__ script.
 *
 * Data structure:
 * - Event data in dehydratedState.queries[].state.data
 * - Fights grouped by cards (Title fights, Main Card, Prelims, Free Prelims)
 * - Each fight has fighter1, fighter2, weightClass, result
 * - Result includes winner, method, round, time
 *
 * Usage:
 *   npx ts-node src/services/oktagonLiveScraper.ts [eventUrl] [intervalSeconds]
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// ============== TYPE DEFINITIONS ==============

interface OktagonFighterInfo {
  id: number;
  firstName: string;
  lastName: string;
  nickname?: string;
  country?: string;
  record?: string;
  isWinner?: boolean;
}

interface OktagonFightResult {
  winner?: string;        // Winner's last name
  winnerId?: number;      // Winner's fighter ID
  method?: string;        // "KO", "TKO", "Submission", "Decision", etc.
  round?: number;
  time?: string;          // "2:34" format
}

interface OktagonFightData {
  fightId: string | number;
  order: number;
  cardType: string;       // "HEAVYWEIGHT TITLE FIGHT", "Main Card", "Prelims", etc.
  weightClass: string;
  isTitle: boolean;
  scheduledRounds: number;
  fighterA: OktagonFighterInfo;
  fighterB: OktagonFighterInfo;
  hasStarted: boolean;
  isComplete: boolean;
  result?: OktagonFightResult;
}

interface OktagonEventData {
  eventId: string | number;
  eventName: string;
  eventUrl: string;
  venue?: string;
  location?: string;
  eventDate?: string;
  status: 'upcoming' | 'live' | 'complete';
  hasStarted: boolean;
  isComplete: boolean;
  fights: OktagonFightData[];
  timestamp: string;
  scrapeDuration?: number;
}

interface OktagonScraperSnapshot {
  data: OktagonEventData;
  changes: string[];
}

// ============== HELPER FUNCTIONS ==============

/**
 * Get localized text from multilingual object
 */
function getLocalizedText(obj: any): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj.en || obj.cs || obj.de || Object.values(obj)[0] || '';
}

/**
 * Parse fighter record from scores object
 */
function parseRecord(scores: any): string | undefined {
  if (!scores) return undefined;
  const mmaProfi = scores.MMA_PROFI;
  if (mmaProfi) {
    return `${mmaProfi.wins || 0}-${mmaProfi.losses || 0}-${mmaProfi.draws || 0}`;
  }
  return undefined;
}

/**
 * Parse result method to standard format
 */
function parseMethod(methodObj: any): string | undefined {
  if (!methodObj) return undefined;
  const method = getLocalizedText(methodObj);

  // Standardize method names
  const methodLower = method.toLowerCase();
  if (methodLower.includes('knockout') || methodLower === 'ko') return 'KO';
  if (methodLower.includes('technical knockout') || methodLower === 'tko') return 'TKO';
  if (methodLower.includes('submission') || methodLower === 'sub') return 'SUB';
  if (methodLower.includes('unanimous')) return 'UD';
  if (methodLower.includes('split')) return 'SD';
  if (methodLower.includes('majority')) return 'MD';
  if (methodLower.includes('decision')) return 'DEC';
  if (methodLower.includes('disqualification') || methodLower === 'dq') return 'DQ';
  if (methodLower.includes('no contest') || methodLower === 'nc') return 'NC';

  return method;
}

// ============== OKTAGON LIVE SCRAPER CLASS ==============

class OktagonLiveScraper {
  private outputDir: string;
  private eventUrl: string;
  private snapshots: OktagonScraperSnapshot[] = [];
  private previousState: OktagonEventData | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(eventUrl: string, outputDir?: string) {
    this.eventUrl = eventUrl;
    this.outputDir = outputDir || path.join(__dirname, '../../live-event-data/oktagon');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Fetch the OKTAGON event page and extract Next.js data
   */
  private async fetchEventData(): Promise<any> {
    const startTime = Date.now();

    try {
      const response = await axios.get(this.eventUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
        },
        timeout: 30000,
      });

      const duration = Date.now() - startTime;
      console.log(`  📥 Page fetched in ${duration}ms`);

      // Parse HTML and extract __NEXT_DATA__
      const $ = cheerio.load(response.data);
      const nextDataScript = $('#__NEXT_DATA__').html();

      if (!nextDataScript) {
        throw new Error('No __NEXT_DATA__ found on page');
      }

      const nextData = JSON.parse(nextDataScript);
      const queries = nextData.props?.pageProps?.dehydratedState?.queries || [];

      // Find event details query and fightCard query
      let eventDetails: any = null;
      let fightCards: any[] = [];

      for (const query of queries) {
        const queryKey = query.queryKey || [];
        const data = query.state?.data;

        // Look for event details (has title, startDate, etc.)
        if (queryKey.includes('events') && queryKey.includes('detail') && data?.title) {
          eventDetails = data;
        }

        // Look for fightCard query (queryKey includes 'fightCard')
        if (queryKey.includes('fightCard') && Array.isArray(data)) {
          fightCards = data;
        }

        // Legacy: also check for cards directly in data
        if (data && data.cards && data.cards.length > 0) {
          fightCards = data.cards;
          if (!eventDetails) {
            eventDetails = data;
          }
        }
      }

      if (fightCards.length === 0) {
        throw new Error('No fight card data found in __NEXT_DATA__');
      }

      // Return combined data structure
      return {
        ...eventDetails,
        cards: fightCards,
      };

    } catch (error: any) {
      console.error(`  ❌ Fetch error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse raw event data into structured format
   */
  private parseEventData(rawData: any): OktagonEventData {
    const eventName = getLocalizedText(rawData.title) || 'Unknown Event';
    const eventId = rawData.id || rawData.slug || 'unknown';
    const eventDate = rawData.dateFrom;
    const venue = getLocalizedText(rawData.venue);
    const location = getLocalizedText(rawData.location);

    const fights: OktagonFightData[] = [];
    let globalOrder = 0;

    // Process each card
    for (const card of rawData.cards || []) {
      const cardTitle = getLocalizedText(card.title) || 'Unknown Card';
      const isTitle = cardTitle.toLowerCase().includes('title');

      for (const fight of card.fights || []) {
        globalOrder++;

        // Parse fighters
        const fighterA: OktagonFighterInfo = {
          id: fight.fighter1?.id,
          firstName: fight.fighter1?.firstName || 'TBA',
          lastName: fight.fighter1?.lastName || '',
          nickname: fight.fighter1?.nickName,
          country: fight.fighter1?.nationality?.code,
          record: parseRecord(fight.fighter1?.scores),
          isWinner: false,
        };

        const fighterB: OktagonFighterInfo = {
          id: fight.fighter2?.id,
          firstName: fight.fighter2?.firstName || 'TBA',
          lastName: fight.fighter2?.lastName || '',
          nickname: fight.fighter2?.nickName,
          country: fight.fighter2?.nationality?.code,
          record: parseRecord(fight.fighter2?.scores),
          isWinner: false,
        };

        // Parse result if exists
        let result: OktagonFightResult | undefined;
        let isComplete = false;
        let hasStarted = false;

        if (fight.result) {
          isComplete = true;
          hasStarted = true;

          // New format: result is a string like "FIGHTER_1_WIN" or "FIGHTER_2_WIN"
          // resultType is the method, time and numRounds are at fight level
          const resultStr = typeof fight.result === 'string' ? fight.result : null;
          let winnerName: string | undefined;
          let winnerId: number | undefined;

          if (resultStr === 'FIGHTER_1_WIN') {
            fighterA.isWinner = true;
            winnerName = fighterA.lastName;
            winnerId = fighterA.id;
          } else if (resultStr === 'FIGHTER_2_WIN') {
            fighterB.isWinner = true;
            winnerName = fighterB.lastName;
            winnerId = fighterB.id;
          } else if (typeof fight.result === 'object' && fight.result?.winner?.id) {
            // Legacy format: result is an object with winner.id
            const legacyWinnerId = fight.result.winner.id;
            if (legacyWinnerId === fighterA.id) {
              fighterA.isWinner = true;
              winnerName = fighterA.lastName;
              winnerId = legacyWinnerId;
            } else if (legacyWinnerId === fighterB.id) {
              fighterB.isWinner = true;
              winnerName = fighterB.lastName;
              winnerId = legacyWinnerId;
            }
          }

          // resultType contains the method (DEC, TKO, SUB, etc.)
          // time and numRounds are at fight level
          const method = fight.resultType
            ? parseMethod(fight.resultType)
            : (typeof fight.result === 'object' ? parseMethod(fight.result?.method) : undefined);

          result = {
            winner: winnerName,
            winnerId: winnerId,
            method: method,
            round: fight.numRounds || (typeof fight.result === 'object' ? fight.result?.round : undefined),
            time: fight.time || (typeof fight.result === 'object' ? fight.result?.time : undefined),
          };
        }

        // Check for live status
        if (fight.status?.live || fight.isLive) {
          hasStarted = true;
          isComplete = false;
        }

        const weightClass = getLocalizedText(fight.weightClass?.title) || 'Unknown';
        const scheduledRounds = fight.rounds || (isTitle ? 5 : 3);

        fights.push({
          fightId: fight.id || `oktagon-${globalOrder}`,
          order: globalOrder,
          cardType: cardTitle,
          weightClass,
          isTitle: isTitle || fight.titleFight === true,
          scheduledRounds,
          fighterA,
          fighterB,
          hasStarted,
          isComplete,
          result,
        });
      }
    }

    // Determine event status
    const completedFights = fights.filter(f => f.isComplete).length;

    let status: 'upcoming' | 'live' | 'complete' = 'upcoming';
    let hasStarted = false;
    let isComplete = false;

    if (completedFights === fights.length && fights.length > 0) {
      status = 'complete';
      hasStarted = true;
      isComplete = true;
    } else if (completedFights > 0) {
      status = 'live';
      hasStarted = true;

      // Infer which fight is currently live
      // Fights are ordered from main event (1) to prelims (highest number)
      // Fights happen in reverse order (highest order number first)
      // So the "currently live" fight is the one with the highest order that isn't complete
      const incompleteFights = fights.filter(f => !f.isComplete);
      if (incompleteFights.length > 0) {
        // Sort by order descending to find the first incomplete fight (highest order = next to fight)
        incompleteFights.sort((a, b) => b.order - a.order);
        const currentFight = incompleteFights[0];
        // Mark it as started (live)
        const fightIndex = fights.findIndex(f => f.fightId === currentFight.fightId);
        if (fightIndex !== -1) {
          fights[fightIndex].hasStarted = true;
        }
      }
    }

    return {
      eventId,
      eventName,
      eventUrl: this.eventUrl,
      venue,
      location,
      eventDate,
      status,
      hasStarted,
      isComplete,
      fights,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detect changes between current and previous state
   */
  private detectChanges(current: OktagonEventData): string[] {
    const changes: string[] = [];

    if (!this.previousState) {
      changes.push('Initial scrape');
      return changes;
    }

    const prev = this.previousState;

    // Event-level changes
    if (current.hasStarted && !prev.hasStarted) {
      changes.push('🔴 EVENT STARTED');
    }
    if (current.isComplete && !prev.isComplete) {
      changes.push('✅ EVENT COMPLETE');
    }

    // Fight-level changes
    for (const fight of current.fights) {
      const prevFight = prev.fights.find(f =>
        f.fighterA.lastName === fight.fighterA.lastName &&
        f.fighterB.lastName === fight.fighterB.lastName
      );

      if (!prevFight) {
        changes.push(`➕ New fight: ${fight.fighterA.lastName} vs ${fight.fighterB.lastName}`);
        continue;
      }

      if (fight.hasStarted && !prevFight.hasStarted) {
        changes.push(`🥊 FIGHT STARTED: ${fight.fighterA.lastName} vs ${fight.fighterB.lastName}`);
      }

      if (fight.isComplete && !prevFight.isComplete) {
        const resultStr = fight.result
          ? ` - ${fight.result.winner || 'Unknown'} wins by ${fight.result.method || 'Unknown'}${fight.result.round ? ` R${fight.result.round}` : ''}`
          : '';
        changes.push(`🏆 FIGHT COMPLETE: ${fight.fighterA.lastName} vs ${fight.fighterB.lastName}${resultStr}`);
      }
    }

    return changes;
  }

  /**
   * Main scrape function
   */
  public async scrape(): Promise<OktagonEventData> {
    const startTime = Date.now();
    console.log(`\n⏰ [${new Date().toISOString()}] Scraping OKTAGON event...`);
    console.log(`   URL: ${this.eventUrl}`);

    try {
      const rawData = await this.fetchEventData();
      const eventData = this.parseEventData(rawData);
      eventData.scrapeDuration = Date.now() - startTime;

      // Detect and log changes
      const changes = this.detectChanges(eventData);

      console.log(`\n📊 Event: ${eventData.eventName}`);
      console.log(`   Status: ${eventData.status}`);
      console.log(`   Fights: ${eventData.fights.length}`);
      console.log(`   Duration: ${eventData.scrapeDuration}ms`);

      if (changes.length > 0 && changes[0] !== 'Initial scrape') {
        console.log('\n📢 CHANGES DETECTED:');
        changes.forEach(c => console.log(`   ${c}`));
      }

      // Log fight card
      console.log('\n🥊 Fight Card:');
      eventData.fights.forEach((fight, i) => {
        const statusIcon = fight.isComplete ? '✅' : fight.hasStarted ? '🔴' : '⏳';
        const resultStr = fight.result
          ? ` → ${fight.result.winner || '?'} by ${fight.result.method || '?'}`
          : '';
        console.log(`   ${i + 1}. ${statusIcon} ${fight.fighterA.lastName} vs ${fight.fighterB.lastName}${resultStr}`);
      });

      // Save snapshot
      this.snapshots.push({ data: eventData, changes });
      this.previousState = eventData;

      return eventData;

    } catch (error: any) {
      console.error(`\n❌ Scrape failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start polling
   */
  public async startPolling(intervalSeconds: number = 60): Promise<void> {
    console.log('\n🚀 Starting OKTAGON Live Scraper...');
    console.log(`📊 Polling every ${intervalSeconds} seconds`);
    console.log(`📁 Output: ${this.outputDir}\n`);

    // Initial scrape
    await this.scrape();

    // Set up interval
    this.intervalId = setInterval(async () => {
      try {
        await this.scrape();

        // Auto-save every 10 snapshots
        if (this.snapshots.length % 10 === 0) {
          this.save();
        }
      } catch (error: any) {
        console.error(`Scrape error: ${error.message}`);
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Stop polling
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.save();
    console.log('\n🛑 Scraper stopped\n');
  }

  /**
   * Save snapshots to file
   */
  public save(): void {
    const eventSlug = this.eventUrl.split('/').filter(Boolean).pop()?.replace('?eventDetail=true', '') || 'unknown';
    const filename = `oktagon-${eventSlug}-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    const output = {
      eventUrl: this.eventUrl,
      totalSnapshots: this.snapshots.length,
      firstScrape: this.snapshots[0]?.data.timestamp,
      lastScrape: this.snapshots[this.snapshots.length - 1]?.data.timestamp,
      snapshots: this.snapshots,
    };

    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved ${this.snapshots.length} snapshots to ${filename}`);
  }

  /**
   * Get current state
   */
  public getCurrentState(): OktagonEventData | null {
    return this.previousState;
  }
}

// ============== EXPORTS ==============

export default OktagonLiveScraper;
export { OktagonEventData, OktagonFightData, OktagonFightResult };

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://oktagonmma.com/en/events/oktagon-81-prague/?eventDetail=true';
  const intervalSeconds = parseInt(process.argv[3] || '60', 10);

  const scraper = new OktagonLiveScraper(eventUrl);

  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    scraper.stop();
    process.exit(0);
  });

  scraper.startPolling(intervalSeconds).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

  console.log('\n💡 Press Ctrl+C to stop and save results\n');
}
