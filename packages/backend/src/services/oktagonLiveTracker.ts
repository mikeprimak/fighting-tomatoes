/**
 * OKTAGON MMA Live Event Tracker
 * Orchestrates real-time event tracking by running scraper and parser on a schedule
 */

import OktagonLiveScraper, { OktagonEventData } from './oktagonLiveScraper';
import { parseOktagonLiveData, autoCompleteOktagonEvent } from './oktagonLiveParser';

// ============== TYPE DEFINITIONS ==============

interface OktagonTrackerConfig {
  eventId: string;          // UUID of event in database
  eventUrl: string;         // OKTAGON event page URL
  eventName: string;
  intervalSeconds?: number; // Default: 60
}

interface OktagonTrackerStatus {
  isRunning: boolean;
  eventId?: string;
  eventName?: string;
  eventUrl?: string;
  startedAt?: string;
  lastScrapeAt?: string;
  totalScrapes: number;
  fightsUpdated: number;
  lastError?: string;
}

// ============== OKTAGON LIVE TRACKER CLASS ==============

class OktagonLiveTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private config: OktagonTrackerConfig | null = null;
  private scraper: OktagonLiveScraper | null = null;
  private status: OktagonTrackerStatus = {
    isRunning: false,
    totalScrapes: 0,
    fightsUpdated: 0
  };

  /**
   * Start tracking a live OKTAGON event
   */
  async start(config: OktagonTrackerConfig): Promise<void> {
    if (this.intervalId) {
      throw new Error('OKTAGON tracker is already running. Stop it first.');
    }

    this.config = {
      ...config,
      intervalSeconds: config.intervalSeconds || 60
    };

    this.status = {
      isRunning: true,
      eventId: config.eventId,
      eventName: config.eventName,
      eventUrl: config.eventUrl,
      startedAt: new Date().toISOString(),
      totalScrapes: 0,
      fightsUpdated: 0
    };

    // Create scraper instance
    this.scraper = new OktagonLiveScraper(config.eventUrl);

    console.log('\n🥋 [OKTAGON TRACKER] Starting live event tracking');
    console.log(`   Event: ${this.config.eventName} (ID: ${this.config.eventId})`);
    console.log(`   URL: ${this.config.eventUrl}`);
    console.log(`   Interval: ${this.config.intervalSeconds}s\n`);

    // Initial scrape and parse
    await this.scrapeAndParse();

    // Set up interval
    this.intervalId = setInterval(async () => {
      await this.scrapeAndParse();
    }, this.config.intervalSeconds! * 1000);

    console.log('✅ OKTAGON live tracker started\n');
  }

  /**
   * Stop tracking
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Save scraper data
    if (this.scraper) {
      this.scraper.stop();
      this.scraper = null;
    }

    console.log('\n🛑 [OKTAGON TRACKER] Stopped\n');
    console.log(`   Total scrapes: ${this.status.totalScrapes}`);
    console.log(`   Fights updated: ${this.status.fightsUpdated}\n`);

    this.status.isRunning = false;
    this.config = null;
  }

  /**
   * Get current tracker status
   */
  getStatus(): OktagonTrackerStatus {
    return { ...this.status };
  }

  /**
   * Scrape and parse
   */
  private async scrapeAndParse(): Promise<void> {
    if (!this.config || !this.scraper) return;

    try {
      console.log(`\n⏰ [${new Date().toISOString()}] OKTAGON scrape ${this.status.totalScrapes + 1}...`);

      // Run scraper
      const scrapedData = await this.scraper.scrape();

      // Parse and update database
      const result = await parseOktagonLiveData(scrapedData, this.config.eventId);

      this.status.lastScrapeAt = new Date().toISOString();
      this.status.totalScrapes++;
      this.status.fightsUpdated += result.fightsUpdated;
      delete this.status.lastError;

      // Log status
      console.log(`  📊 Fights updated: ${result.fightsUpdated}, Cancelled: ${result.cancelledCount}, Un-cancelled: ${result.unCancelledCount}`);

      // Check if event is complete
      if (scrapedData.isComplete) {
        await autoCompleteOktagonEvent(this.config.eventId);
        console.log('  🎉 Event is complete, stopping tracker...');
        await this.stop();
      }

    } catch (error: any) {
      console.error('  ❌ Scrape/parse error:', error.message);
      this.status.lastError = error.message;
    }
  }
}

// ============== SINGLETON INSTANCE ==============

const oktagonTracker = new OktagonLiveTracker();

export default oktagonTracker;

// ============== CONVENIENCE FUNCTIONS ==============

export async function startOktagonLiveTracking(config: OktagonTrackerConfig): Promise<void> {
  await oktagonTracker.start(config);
}

export async function stopOktagonLiveTracking(): Promise<void> {
  await oktagonTracker.stop();
}

export function getOktagonTrackingStatus(): OktagonTrackerStatus {
  return oktagonTracker.getStatus();
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventId = process.argv[2] || 'test-event-id';
  const eventUrl = process.argv[3] || 'https://oktagonmma.com/en/events/oktagon-81-prague/?eventDetail=true';
  const eventName = process.argv[4] || 'OKTAGON 81';

  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    await stopOktagonLiveTracking();
    process.exit(0);
  });

  startOktagonLiveTracking({
    eventId,
    eventUrl,
    eventName,
    intervalSeconds: 60
  }).catch(error => {
    console.error('Failed to start tracker:', error);
    process.exit(1);
  });

  console.log('\n💡 Press Ctrl+C to stop tracking\n');
}
