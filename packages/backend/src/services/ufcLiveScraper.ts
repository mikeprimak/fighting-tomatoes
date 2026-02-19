/**
 * UFC.com Live Event Scraper
 *
 * Scrapes live fight data from UFC.com event pages during active events.
 * Targets the live stats API that UFC.com uses internally.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

interface FightData {
  fightId: string;
  status: 'upcoming' | 'live' | 'complete' | string;
  fighters: {
    red: string;
    blue: string;
  };
  weightClass: string;
  // Live round tracking
  currentRound?: number;      // Current round in progress (1-5)
  completedRounds?: number;   // Last completed round (0-5)
  fightStatus: string;        // 'UPCOMING', 'LIVE', 'COMPLETED'
  // Result data (when fight completes)
  result?: {
    winner?: string;
    method?: string;
    round?: number;
    time?: string;
  };
}

interface EventData {
  eventId: string;
  eventName: string;
  eventFmid: string;
  isFinal: boolean;
  fights: FightData[];
  timestamp: string;
}

class UFCLiveScraper {
  private outputDir: string;
  private eventUrl: string;
  private snapshots: EventData[] = [];

  constructor(eventUrl: string) {
    this.eventUrl = eventUrl;
    this.outputDir = path.join(__dirname, '../../test-results/ufc-scraper');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Fetch and parse UFC event page
   */
  private async fetchEventPage(): Promise<string> {
    const response = await axios.get(this.eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    });

    return response.data;
  }

  /**
   * Extract event metadata from page
   */
  private extractEventMetadata(html: string): { eventFmid: string; isFinal: boolean; eventName: string } {
    // Look for eventLiveStats in the Drupal settings JSON
    const match = html.match(/"eventLiveStats":\s*\{[^}]+\}/);

    if (match) {
      const statsMatch = html.match(/"event_fmid":"(\d+)","final":(true|false)/);
      if (statsMatch) {
        return {
          eventFmid: statsMatch[1],
          isFinal: statsMatch[2] === 'true',
          eventName: this.eventUrl.split('/').pop() || 'unknown',
        };
      }
    }

    // Fallback: extract from page title
    const $ = cheerio.load(html);
    const eventName = $('title').text().trim();

    return {
      eventFmid: 'unknown',
      isFinal: false,
      eventName,
    };
  }

  /**
   * Extract fight data from HTML
   */
  private extractFightData(html: string): FightData[] {
    const $ = cheerio.load(html);
    const fights: FightData[] = [];

    // Find all fight cards
    $('.c-listing-fight').each((index, element) => {
      const $fight = $(element);

      const fightId = $fight.attr('data-fmid') || '';
      let status = $fight.attr('data-status') || 'upcoming';

      // Extract fighters
      const redCorner = $fight.find('.c-listing-fight__corner--red .c-listing-fight__corner-name').text().trim();
      const blueCorner = $fight.find('.c-listing-fight__corner--blue .c-listing-fight__corner-name').text().trim();

      // Extract weight class
      const weightClass = $fight.find('.c-listing-fight__class-text').text().trim();

      // Extract result data (if fight is complete)
      const resultText = $fight.find('.c-listing-fight__outcome-wrapper').text().trim();

      let currentRound: number | undefined;
      let completedRounds: number | undefined;
      let fightStatus = 'UPCOMING';

      // Check for live status indicators
      const fightText = $fight.text().toLowerCase();
      const hasLiveIndicator = $fight.find('.live-indicator, [class*="live"]').length > 0;

      if (hasLiveIndicator || fightText.includes('live now') || status === 'live') {
        status = 'live';
        fightStatus = 'LIVE';

        // Try to detect current round: "Round 1", "Round 2", "R1", "R2", etc.
        const roundMatch = fightText.match(/(?:round\s+|r)(\d+)/i);
        if (roundMatch) {
          const detectedRound = parseInt(roundMatch[1], 10);

          // Check if between rounds: "End of Round X", "Round X Complete"
          if (fightText.includes('end') || fightText.includes('complete')) {
            completedRounds = detectedRound;
            currentRound = undefined; // Between rounds
          } else {
            currentRound = detectedRound;
            completedRounds = detectedRound > 1 ? detectedRound - 1 : 0;
          }
        }
      }

      // If we have a result, fight is complete
      if (resultText) {
        status = 'complete';
        fightStatus = 'COMPLETED';
        const parsedResult = this.parseResultText(resultText);
        if (parsedResult?.round) {
          completedRounds = parsedResult.round;
        }

        fights.push({
          fightId,
          status,
          fighters: {
            red: redCorner,
            blue: blueCorner,
          },
          weightClass,
          currentRound,
          completedRounds,
          fightStatus,
          result: parsedResult,
        });
      } else {
        fights.push({
          fightId,
          status,
          fighters: {
            red: redCorner,
            blue: blueCorner,
          },
          weightClass,
          currentRound,
          completedRounds,
          fightStatus,
        });
      }
    });

    return fights;
  }

  /**
   * Parse result text to extract winner, method, round, time
   */
  private parseResultText(text: string): FightData['result'] {
    // Example formats:
    // "Crute defeats Erslan by Submission (Rear Naked Choke) at 3:19 of Round 1"
    // "Ulberg defeats Reyes by TKO (Punches) at 2:34 of Round 3"

    const result: FightData['result'] = {};

    // Extract winner
    const winnerMatch = text.match(/^([^defeats]+)\s+defeats/i);
    if (winnerMatch) {
      result.winner = winnerMatch[1].trim();
    }

    // Extract method
    const methodMatch = text.match(/by\s+([^at]+)\s+at/i);
    if (methodMatch) {
      result.method = methodMatch[1].trim();
    }

    // Extract time
    const timeMatch = text.match(/at\s+([\d:]+)\s+of/i);
    if (timeMatch) {
      result.time = timeMatch[1].trim();
    }

    // Extract round
    const roundMatch = text.match(/Round\s+(\d+)/i);
    if (roundMatch) {
      result.round = parseInt(roundMatch[1], 10);
    }

    return result;
  }

  /**
   * Scrape current event state
   */
  public async scrape(): Promise<EventData> {
    console.log(`\n[${new Date().toISOString()}] Scraping ${this.eventUrl}...`);

    const html = await this.fetchEventPage();
    const metadata = this.extractEventMetadata(html);
    const fights = this.extractFightData(html);

    const eventData: EventData = {
      eventId: metadata.eventName,
      eventName: metadata.eventName,
      eventFmid: metadata.eventFmid,
      isFinal: metadata.isFinal,
      fights,
      timestamp: new Date().toISOString(),
    };

    console.log(`Event: ${eventData.eventName}`);
    console.log(`Event FMID: ${eventData.eventFmid}`);
    console.log(`Final: ${eventData.isFinal}`);
    console.log(`Fights found: ${fights.length}`);

    // Log active fights
    fights.forEach(fight => {
      if (fight.status) {
        console.log(`  - ${fight.fighters.red} vs ${fight.fighters.blue} [Status: ${fight.status}]`);
      }
      if (fight.result) {
        console.log(`    Result: ${fight.result.winner} wins by ${fight.result.method} at ${fight.result.time} of R${fight.result.round}`);
      }
    });

    this.snapshots.push(eventData);
    return eventData;
  }

  /**
   * Start polling
   */
  public async startPolling(intervalSeconds: number = 30): Promise<void> {
    console.log('🚀 Starting UFC.com live scraper...');
    console.log(`📊 Polling every ${intervalSeconds} seconds`);
    console.log(`📁 Results will be saved to: ${this.outputDir}\n`);

    // Initial scrape
    await this.scrape();

    // Set up interval
    setInterval(async () => {
      try {
        await this.scrape();

        // Save every 10 snapshots
        if (this.snapshots.length % 10 === 0) {
          this.save();
        }
      } catch (error: any) {
        console.error(`Error scraping: ${error.message}`);
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Save snapshots to file
   */
  public save(): void {
    const filename = `ufc-320-scrape-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.snapshots, null, 2));
    console.log(`\n💾 Saved ${this.snapshots.length} snapshots to ${filename}\n`);
  }

  /**
   * Stop and save
   */
  public stop(): void {
    this.save();
    console.log('\n🛑 Scraper stopped');
  }
}

// Export for use in other modules
export default UFCLiveScraper;

// CLI usage
if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://www.ufc.com/event/ufc-320';

  const scraper = new UFCLiveScraper(eventUrl);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    scraper.stop();
    process.exit(0);
  });

  // Start scraping
  scraper.startPolling(30);

  console.log('\n💡 Press Ctrl+C to stop and save results\n');
}
