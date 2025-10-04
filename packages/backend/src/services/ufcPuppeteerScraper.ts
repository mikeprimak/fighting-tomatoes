/**
 * UFC.com Live Event Scraper - Puppeteer Version
 *
 * Uses headless Chrome to scrape live fight data from UFC.com
 * Bypasses bot protection and captures dynamic content
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

interface FightData {
  fightId: string;
  status: string;
  fighters: {
    red: { name: string; record?: string };
    blue: { name: string; record?: string };
  };
  weightClass: string;
  isTitle: boolean;
  round?: number;
  time?: string;
  startTime?: string; // Calculated fight start time
  result?: {
    winner?: string;
    method?: string;
    round?: number;
    time?: string;
  };
}

interface EventData {
  eventName: string;
  eventFmid: string;
  isFinal: boolean;
  eventStartTime?: string; // Event start time from page
  fights: FightData[];
  timestamp: string;
  screenshotPath?: string;
}

class UFCPuppeteerScraper {
  private browser?: Browser;
  private page?: Page;
  private eventUrl: string;
  private outputDir: string;
  private snapshots: EventData[] = [];
  private isRunning: boolean = false;

  constructor(eventUrl: string) {
    this.eventUrl = eventUrl;
    this.outputDir = path.join(__dirname, '../../test-results/ufc-puppeteer');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize browser
   */
  private async initBrowser(): Promise<void> {
    console.log('🌐 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    this.page = await this.browser.newPage();

    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('✅ Browser ready');
  }

  /**
   * Navigate to event page
   */
  private async navigateToEvent(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    console.log(`📄 Loading ${this.eventUrl}...`);
    await this.page.goto(this.eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for fight card to load
    await this.page.waitForSelector('.c-listing-fight', { timeout: 10000 });
    console.log('✅ Page loaded');
  }

  /**
   * Extract event metadata from page
   */
  private async extractEventMetadata(): Promise<{ eventFmid: string; isFinal: boolean; eventName: string; eventStartTime?: string }> {
    if (!this.page) throw new Error('Page not initialized');

    const metadata = await this.page.evaluate(() => {
      // Extract from Drupal settings
      // @ts-ignore - runs in browser context
      const scriptTags = document.querySelectorAll('script');
      let eventFmid = 'unknown';
      let isFinal = false;
      let eventStartTime: string | undefined;

      // @ts-ignore
      scriptTags.forEach((script) => {
        const content = script.textContent || '';
        const match = content.match(/"eventLiveStats":\s*\{[^}]+\}/);
        if (match) {
          const statsMatch = content.match(/"event_fmid":"(\d+)","final":(true|false)/);
          if (statsMatch) {
            eventFmid = statsMatch[1];
            isFinal = statsMatch[2] === 'true';
          }
        }
      });

      // Extract event start time from page
      // @ts-ignore
      const timeElements = document.querySelectorAll('.c-hero__headline-suffix, .field--name-field-main-card-start-time, [class*="time"]');
      // @ts-ignore
      timeElements.forEach((el) => {
        const text = el.textContent?.trim() || '';
        // Look for patterns like "10:00 PM EDT", "8:00 PM", etc.
        const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s+[A-Z]{2,4})?)/i);
        if (timeMatch && !eventStartTime) {
          eventStartTime = timeMatch[1].trim();
        }
      });

      // @ts-ignore
      const eventName = document.title.trim();

      return { eventFmid, isFinal, eventName, eventStartTime };
    });

    return metadata;
  }

  /**
   * Extract fight data from page
   */
  private async extractFightData(): Promise<FightData[]> {
    if (!this.page) throw new Error('Page not initialized');

    const fights = await this.page.evaluate(() => {
      // @ts-ignore - runs in browser context
      const fightElements = document.querySelectorAll('.c-listing-fight');
      const fightsData: any[] = [];

      // @ts-ignore
      fightElements.forEach((element) => {
        const fightId = element.getAttribute('data-fmid') || '';
        const status = element.getAttribute('data-status') || '';

        // Extract fighters
        const redCorner = element.querySelector('.c-listing-fight__corner--red .c-listing-fight__corner-name');
        const blueCorner = element.querySelector('.c-listing-fight__corner--blue .c-listing-fight__corner-name');

        const redRecord = element.querySelector('.c-listing-fight__corner--red .c-listing-fight__corner-stat-record');
        const blueRecord = element.querySelector('.c-listing-fight__corner--blue .c-listing-fight__corner-stat-record');

        // Extract weight class
        const weightClassElement = element.querySelector('.c-listing-fight__class-text');
        const weightClass = weightClassElement?.textContent?.trim() || '';
        const isTitle = weightClass.toLowerCase().includes('title');

        // Extract result
        const outcomeElement = element.querySelector('.c-listing-fight__outcome-wrapper');
        const resultText = outcomeElement?.textContent?.trim() || '';

        // Extract live round/time info
        const roundElement = element.querySelector('.c-listing-fight__live-round');
        const timeElement = element.querySelector('.c-listing-fight__live-time');

        fightsData.push({
          fightId,
          status,
          fighters: {
            red: {
              name: redCorner?.textContent?.trim() || '',
              record: redRecord?.textContent?.trim() || undefined,
            },
            blue: {
              name: blueCorner?.textContent?.trim() || '',
              record: blueRecord?.textContent?.trim() || undefined,
            },
          },
          weightClass,
          isTitle,
          round: roundElement ? parseInt(roundElement.textContent?.trim() || '0', 10) : undefined,
          time: timeElement?.textContent?.trim() || undefined,
          resultText,
        });
      });

      return fightsData;
    });

    // Parse results
    return fights.map(fight => ({
      ...fight,
      result: fight.resultText ? this.parseResultText(fight.resultText) : undefined,
      resultText: undefined, // Remove raw text
    }));
  }

  /**
   * Parse result text
   */
  private parseResultText(text: string): FightData['result'] {
    const result: FightData['result'] = {};

    // "Crute defeats Erslan by Submission (Rear Naked Choke) at 3:19 of Round 1"
    const winnerMatch = text.match(/^([^defeats]+)\s+defeats/i);
    if (winnerMatch) {
      result.winner = winnerMatch[1].trim();
    }

    const methodMatch = text.match(/by\s+([^at]+)\s+at/i);
    if (methodMatch) {
      result.method = methodMatch[1].trim();
    }

    const timeMatch = text.match(/at\s+([\d:]+)\s+of/i);
    if (timeMatch) {
      result.time = timeMatch[1].trim();
    }

    const roundMatch = text.match(/Round\s+(\d+)/i);
    if (roundMatch) {
      result.round = parseInt(roundMatch[1], 10);
    }

    return result;
  }

  /**
   * Calculate fight start times based on event start time
   * First fight starts at event time, each subsequent fight is 30 mins later
   */
  private calculateFightStartTimes(fights: FightData[], eventStartTime?: string): FightData[] {
    if (!eventStartTime) return fights;

    // Parse event start time (e.g., "10:00 PM EDT")
    const baseTimeMatch = eventStartTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!baseTimeMatch) return fights;

    let hours = parseInt(baseTimeMatch[1], 10);
    const minutes = parseInt(baseTimeMatch[2], 10);
    const period = baseTimeMatch[3].toUpperCase();

    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    // Calculate start time for each fight
    return fights.map((fight, index) => {
      const minutesOffset = index * 30;
      let fightHours = hours + Math.floor((minutes + minutesOffset) / 60);
      let fightMinutes = (minutes + minutesOffset) % 60;

      // Handle day overflow
      if (fightHours >= 24) {
        fightHours = fightHours % 24;
      }

      // Convert back to 12-hour format
      const fightPeriod = fightHours >= 12 ? 'PM' : 'AM';
      const displayHours = fightHours === 0 ? 12 : fightHours > 12 ? fightHours - 12 : fightHours;
      const startTime = `${displayHours}:${fightMinutes.toString().padStart(2, '0')} ${fightPeriod}`;

      return {
        ...fight,
        startTime,
      };
    });
  }

  /**
   * Take screenshot
   */
  private async takeScreenshot(filename: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    const screenshotPath = path.join(this.outputDir, filename) as `${string}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  /**
   * Scrape current state
   */
  public async scrape(): Promise<EventData> {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] Scraping event...`);

    if (!this.page) {
      await this.initBrowser();
      await this.navigateToEvent();
    } else {
      // Reload page to get fresh data
      await this.page.reload({ waitUntil: 'networkidle2' });
    }

    const metadata = await this.extractEventMetadata();
    let fights = await this.extractFightData();

    // Calculate fight start times
    fights = this.calculateFightStartTimes(fights, metadata.eventStartTime);

    // Take screenshot every scrape
    const screenshotFilename = `screenshot-${Date.now()}.png`;
    const screenshotPath = await this.takeScreenshot(screenshotFilename);

    const eventData: EventData = {
      eventName: metadata.eventName,
      eventFmid: metadata.eventFmid,
      isFinal: metadata.isFinal,
      eventStartTime: metadata.eventStartTime,
      fights,
      timestamp,
      screenshotPath,
    };

    console.log(`Event: ${eventData.eventName}`);
    console.log(`Event FMID: ${eventData.eventFmid}`);
    console.log(`Event Start Time: ${eventData.eventStartTime || 'Not found'}`);
    console.log(`Final: ${eventData.isFinal}`);
    console.log(`Fights: ${fights.length}`);
    console.log(`Screenshot: ${screenshotFilename}`);

    // Log active/completed fights
    fights.forEach(fight => {
      const { red, blue } = fight.fighters;
      if (fight.status) {
        console.log(`  [${fight.status}] ${red.name} vs ${blue.name}${fight.startTime ? ` - Start: ${fight.startTime}` : ''}`);
      }
      if (fight.round && fight.time) {
        console.log(`    🔴 LIVE: Round ${fight.round}, ${fight.time}`);
      }
      if (fight.result) {
        const { winner, method, round, time } = fight.result;
        console.log(`    ✅ ${winner} wins by ${method} at ${time} of R${round}`);
      }
    });

    this.snapshots.push(eventData);
    return eventData;
  }

  /**
   * Start polling
   */
  public async start(intervalSeconds: number = 30): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Already running!');
      return;
    }

    console.log('🚀 Starting UFC Puppeteer scraper...');
    console.log(`📊 Polling every ${intervalSeconds} seconds`);
    console.log(`📁 Results: ${this.outputDir}\n`);

    this.isRunning = true;

    // Initial scrape
    try {
      await this.scrape();
    } catch (error: any) {
      console.error(`Error on initial scrape: ${error.message}`);
    }

    // Set up interval
    setInterval(async () => {
      if (!this.isRunning) return;

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
   * Save snapshots
   */
  public save(): void {
    const filename = `ufc-320-scrape-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.snapshots, null, 2));
    console.log(`\n💾 Saved ${this.snapshots.length} snapshots to ${filename}\n`);
  }

  /**
   * Stop scraper
   */
  public async stop(): Promise<void> {
    console.log('\n🛑 Stopping scraper...');
    this.isRunning = false;

    this.save();

    if (this.browser) {
      await this.browser.close();
      console.log('🌐 Browser closed');
    }

    console.log('✅ Stopped');
  }
}

// Export
export default UFCPuppeteerScraper;

// CLI usage
if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://www.ufc.com/event/ufc-320';
  const scraper = new UFCPuppeteerScraper(eventUrl);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT...');
    await scraper.stop();
    process.exit(0);
  });

  // Start
  scraper.start(30);

  console.log('\n💡 Press Ctrl+C to stop and save results\n');
}
