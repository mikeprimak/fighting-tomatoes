/**
 * Matchroom Boxing Live Event Tracker
 * Orchestrates real-time event tracking by running scraper and parser on a schedule
 * Similar to liveEventTracker.ts but for Matchroom Boxing events
 */

import MatchroomLiveScraper, { MatchroomEventData } from './matchroomLiveScraper';
import { parseMatchroomLiveData, autoCompleteMatchroomEvent } from './matchroomLiveParser';

// ============== TYPE DEFINITIONS ==============

interface MatchroomTrackerConfig {
  eventId: string;          // UUID of event in database
  eventUrl: string;         // Matchroom event page URL
  eventName: string;
  intervalSeconds?: number; // Default: 60
}

interface MatchroomTrackerStatus {
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

// ============== MATCHROOM LIVE TRACKER CLASS ==============

class MatchroomLiveTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private config: MatchroomTrackerConfig | null = null;
  private scraper: MatchroomLiveScraper | null = null;
  private status: MatchroomTrackerStatus = {
    isRunning: false,
    totalScrapes: 0,
    fightsUpdated: 0
  };

  /**
   * Start tracking a live Matchroom event
   */
  async start(config: MatchroomTrackerConfig): Promise<void> {
    if (this.intervalId) {
      throw new Error('Matchroom tracker is already running. Stop it first.');
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
    this.scraper = new MatchroomLiveScraper(config.eventUrl);

    console.log('\n🥊 [MATCHROOM TRACKER] Starting live event tracking');
    console.log(`   Event: ${this.config.eventName} (ID: ${this.config.eventId})`);
    console.log(`   URL: ${this.config.eventUrl}`);
    console.log(`   Interval: ${this.config.intervalSeconds}s\n`);

    // Initial scrape and parse
    await this.scrapeAndParse();

    // Set up interval
    this.intervalId = setInterval(async () => {
      await this.scrapeAndParse();
    }, this.config.intervalSeconds! * 1000);

    console.log('✅ Matchroom live tracker started\n');
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

    console.log('\n🛑 [MATCHROOM TRACKER] Stopped\n');
    console.log(`   Total scrapes: ${this.status.totalScrapes}`);
    console.log(`   Fights updated: ${this.status.fightsUpdated}\n`);

    this.status.isRunning = false;
    this.config = null;
  }

  /**
   * Get current tracker status
   */
  getStatus(): MatchroomTrackerStatus {
    return { ...this.status };
  }

  /**
   * Scrape and parse
   */
  private async scrapeAndParse(): Promise<void> {
    if (!this.config || !this.scraper) return;

    try {
      console.log(`\n⏰ [${new Date().toISOString()}] Matchroom scrape ${this.status.totalScrapes + 1}...`);

      // Run scraper
      const scrapedData = await this.scraper.scrape();

      // Parse and update database
      const result = await parseMatchroomLiveData(scrapedData, this.config.eventId);

      this.status.lastScrapeAt = new Date().toISOString();
      this.status.totalScrapes++;
      this.status.fightsUpdated += result.fightsUpdated;
      delete this.status.lastError;

      // Log status
      console.log(`  📊 Fights updated this scrape: ${result.fightsUpdated}`);

      // Check if event is complete
      if (scrapedData.isComplete) {
        await autoCompleteMatchroomEvent(this.config.eventId);
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

const matchroomTracker = new MatchroomLiveTracker();

export default matchroomTracker;

// ============== CONVENIENCE FUNCTIONS ==============

export async function startMatchroomLiveTracking(config: MatchroomTrackerConfig): Promise<void> {
  await matchroomTracker.start(config);
}

export async function stopMatchroomLiveTracking(): Promise<void> {
  await matchroomTracker.stop();
}

export function getMatchroomTrackingStatus(): MatchroomTrackerStatus {
  return matchroomTracker.getStatus();
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventId = process.argv[2] || 'a6c6707b-56f6-4b17-a12f-dda5340e4273'; // Inoue vs Picasso
  const eventUrl = process.argv[3] || 'https://www.matchroomboxing.com/events/inoue-vs-picasso/';
  const eventName = process.argv[4] || 'Inoue vs. Picasso';

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    await stopMatchroomLiveTracking();
    process.exit(0);
  });

  // Start tracking
  startMatchroomLiveTracking({
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
