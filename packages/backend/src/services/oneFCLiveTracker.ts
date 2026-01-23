/**
 * ONE FC Live Event Tracker
 * Orchestrates real-time event tracking by running scraper and parser on a schedule
 *
 * Usage:
 *   npx ts-node src/services/oneFCLiveTracker.ts [eventId] [eventUrl] [eventName]
 */

import OneFCLiveScraper, { OneFCEventData } from './oneFCLiveScraper';
import { parseOneFCLiveData, autoCompleteOneFCEvent } from './oneFCLiveParser';

// ============== TYPE DEFINITIONS ==============

interface OneFCTrackerConfig {
  eventId: string;          // UUID of event in database
  eventUrl: string;         // ONE FC event page URL
  eventName: string;
  intervalSeconds?: number; // Default: 60
}

interface OneFCTrackerStatus {
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

// ============== ONE FC LIVE TRACKER CLASS ==============

class OneFCLiveTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private config: OneFCTrackerConfig | null = null;
  private scraper: OneFCLiveScraper | null = null;
  private status: OneFCTrackerStatus = {
    isRunning: false,
    totalScrapes: 0,
    fightsUpdated: 0
  };

  /**
   * Start tracking a live ONE FC event
   */
  async start(config: OneFCTrackerConfig): Promise<void> {
    if (this.intervalId) {
      throw new Error('ONE FC tracker is already running. Stop it first.');
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
    this.scraper = new OneFCLiveScraper(config.eventUrl);

    console.log('\n🥋 [ONE FC TRACKER] Starting live event tracking');
    console.log(`   Event: ${this.config.eventName} (ID: ${this.config.eventId})`);
    console.log(`   URL: ${this.config.eventUrl}`);
    console.log(`   Interval: ${this.config.intervalSeconds}s\n`);

    // Initial scrape and parse
    await this.scrapeAndParse();

    // Set up interval
    this.intervalId = setInterval(async () => {
      await this.scrapeAndParse();
    }, this.config.intervalSeconds! * 1000);

    console.log('✅ ONE FC live tracker started\n');
  }

  /**
   * Stop tracking
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Save scraper data and close browser
    if (this.scraper) {
      await this.scraper.stop();
      this.scraper = null;
    }

    console.log('\n🛑 [ONE FC TRACKER] Stopped\n');
    console.log(`   Total scrapes: ${this.status.totalScrapes}`);
    console.log(`   Fights updated: ${this.status.fightsUpdated}\n`);

    this.status.isRunning = false;
    this.config = null;
  }

  /**
   * Get current tracker status
   */
  getStatus(): OneFCTrackerStatus {
    return { ...this.status };
  }

  /**
   * Scrape and parse
   */
  private async scrapeAndParse(): Promise<void> {
    if (!this.config || !this.scraper) return;

    try {
      console.log(`\n⏰ [${new Date().toISOString()}] ONE FC scrape ${this.status.totalScrapes + 1}...`);

      // Run scraper
      const scrapedData = await this.scraper.scrape();

      // Parse and update database
      const result = await parseOneFCLiveData(scrapedData, this.config.eventId);

      this.status.lastScrapeAt = new Date().toISOString();
      this.status.totalScrapes++;
      this.status.fightsUpdated += result.fightsUpdated;
      delete this.status.lastError;

      // Log status
      console.log(`  📊 Fights updated: ${result.fightsUpdated}, Cancelled: ${result.cancelledCount}, Un-cancelled: ${result.unCancelledCount}`);

      // Check if event should be auto-completed (all non-cancelled fights in DB are complete)
      const eventCompleted = await autoCompleteOneFCEvent(this.config.eventId);
      if (eventCompleted) {
        console.log('  🎉 All fights complete - event marked complete, stopping tracker...');
        await this.stop();
      }

    } catch (error: any) {
      console.error('  ❌ Scrape/parse error:', error.message);
      this.status.lastError = error.message;
    }
  }
}

// ============== SINGLETON INSTANCE ==============

const oneFCTracker = new OneFCLiveTracker();

export default oneFCTracker;

// ============== CONVENIENCE FUNCTIONS ==============

export async function startOneFCLiveTracking(config: OneFCTrackerConfig): Promise<void> {
  await oneFCTracker.start(config);
}

export async function stopOneFCLiveTracking(): Promise<void> {
  await oneFCTracker.stop();
}

export function getOneFCTrackingStatus(): OneFCTrackerStatus {
  return oneFCTracker.getStatus();
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventId = process.argv[2] || 'test-event-id';
  const eventUrl = process.argv[3] || 'https://www.onefc.com/events/one-friday-fights-139/';
  const eventName = process.argv[4] || 'ONE Friday Fights 139';

  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    await stopOneFCLiveTracking();
    process.exit(0);
  });

  startOneFCLiveTracking({
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
