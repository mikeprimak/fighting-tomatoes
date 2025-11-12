/**
 * Live Event Tracker
 * Orchestrates real-time event tracking by running scraper and parser on a schedule
 * Manages scraping intervals and graceful shutdown
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { parseLiveEventData, getEventStatus, autoCompleteEvent } from './ufcLiveParser';

const execAsync = promisify(exec);

// ============== TYPE DEFINITIONS ==============

interface LiveEventConfig {
  eventId: string;          // UUID of event in database
  eventUrl: string;
  eventName: string;
  intervalSeconds?: number;  // Default: 30
  preEventMinutes?: number;  // Start scraping X minutes before event
}

interface TrackerStatus {
  isRunning: boolean;
  eventId?: string;
  eventName?: string;
  eventUrl?: string;
  startedAt?: string;
  lastScrapeAt?: string;
  totalScrapes: number;
  lastError?: string;
}

// ============== LIVE EVENT TRACKER CLASS ==============

class LiveEventTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private config: LiveEventConfig | null = null;
  private status: TrackerStatus = {
    isRunning: false,
    totalScrapes: 0
  };

  /**
   * Start tracking a live event
   */
  async start(config: LiveEventConfig): Promise<void> {
    if (this.intervalId) {
      throw new Error('Tracker is already running. Stop it first.');
    }

    this.config = {
      ...config,
      intervalSeconds: config.intervalSeconds || 30,
      preEventMinutes: config.preEventMinutes || 60
    };

    this.status = {
      isRunning: true,
      eventId: config.eventId,
      eventName: config.eventName,
      eventUrl: config.eventUrl,
      startedAt: new Date().toISOString(),
      totalScrapes: 0
    };

    console.log('\n🚀 [LIVE TRACKER] Starting live event tracking');
    console.log(`   Event: ${this.config.eventName} (ID: ${this.config.eventId})`);
    console.log(`   URL: ${this.config.eventUrl}`);
    console.log(`   Interval: ${this.config.intervalSeconds}s\n`);

    // Initial scrape
    await this.scrapeAndParse();

    // Set up interval
    this.intervalId = setInterval(async () => {
      await this.scrapeAndParse();
    }, this.config.intervalSeconds! * 1000);

    console.log('✅ Live tracker started\n');
  }

  /**
   * Stop tracking
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('\n🛑 [LIVE TRACKER] Stopped\n');

    this.status.isRunning = false;
    this.config = null;
  }

  /**
   * Get current tracker status
   */
  getStatus(): TrackerStatus {
    return { ...this.status };
  }

  /**
   * Scrape UFC.com and parse results
   */
  private async scrapeAndParse(): Promise<void> {
    if (!this.config) return;

    try {
      console.log(`\n⏰ [${new Date().toISOString()}] Running scrape ${this.status.totalScrapes + 1}...`);

      // Run the live event scraper
      // In production (dist/), go up to find src/services/scrapeLiveEvent.js
      // In dev (src/), it's in the same directory
      const isProduction = process.env.NODE_ENV === 'production';
      const scraperPath = isProduction
        ? path.join(__dirname, '../../src/services/scrapeLiveEvent.js')  // From dist/services/ to src/services/
        : path.join(__dirname, 'scrapeLiveEvent.js');                    // Same directory in dev
      const outputDir = path.join(__dirname, '../../live-event-data');

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Run scraper with node (it's a .js file)
      const command = `node "${scraperPath}" "${this.config.eventUrl}" "${outputDir}"`;

      console.log(`  📡 Scraping: ${this.config.eventUrl}`);

      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 1 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stderr) {
        console.warn('  ⚠️  Scraper warnings:', stderr);
      }

      // Find the most recent scraped data file
      const files = await fs.readdir(outputDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

      if (jsonFiles.length === 0) {
        throw new Error('No scrape data found');
      }

      const latestFile = path.join(outputDir, jsonFiles[0]);
      const scrapedDataRaw = await fs.readFile(latestFile, 'utf-8');
      const scrapedData = JSON.parse(scrapedDataRaw);

      console.log(`  ✓ Scrape complete: ${scrapedData.events?.length || 0} events found`);

      // Parse the scraped data
      if (scrapedData.events && scrapedData.events.length > 0) {
        const eventData = scrapedData.events[0]; // First event in the scrape

        // Convert scraped format to parser format
        const liveUpdate = this.convertScrapedToLiveUpdate(eventData);

        // Parse and update database using UUID
        await parseLiveEventData(liveUpdate, this.config.eventId);

        // Check if event should be marked complete
        const eventStatus = await getEventStatus(this.config.eventId);
        if (eventStatus && !eventStatus.isComplete) {
          await autoCompleteEvent(eventStatus.eventId);
        }

        // Log current status
        if (eventStatus) {
          console.log(`  📊 Status: ${eventStatus.completeFights}/${eventStatus.totalFights} fights complete`);
          if (eventStatus.currentFights.length > 0) {
            eventStatus.currentFights.forEach(f => {
              console.log(`     🥊 LIVE: ${f.fighters} - Round ${f.currentRound || '?'}`);
            });
          }
        }
      }

      this.status.lastScrapeAt = new Date().toISOString();
      this.status.totalScrapes++;
      delete this.status.lastError;

    } catch (error: any) {
      console.error('  ❌ Scrape/parse error:', error.message);
      this.status.lastError = error.message;
    }
  }

  /**
   * Convert scraped data format to live update format
   */
  private convertScrapedToLiveUpdate(eventData: any): any {
    const hasStarted = eventData.status === 'Live' || eventData.hasStarted;
    const isComplete = eventData.status === 'Complete' || eventData.isComplete;

    const fights = (eventData.fights || []).map((fight: any) => {
      // Determine fight status from various indicators
      let fightStatus: 'upcoming' | 'live' | 'complete' = 'upcoming';
      let currentRound: number | null = null;
      let completedRounds: number | null = null;

      // Check if fight is complete (based on status or having a winner)
      if (fight.status === 'complete' || fight.isComplete || fight.winner || fight.result?.winner) {
        fightStatus = 'complete';
        completedRounds = fight.completedRounds || fight.result?.round || fight.round || null;
      }
      // Check if fight is live (based on status or hasStarted flag)
      else if (fight.status === 'live' || fight.isLive || fight.hasStarted) {
        fightStatus = 'live';
        currentRound = fight.currentRound || null;
        completedRounds = fight.completedRounds || (currentRound ? currentRound - 1 : null);
      }

      return {
        fighterAName: fight.fighterA?.name || fight.fighter1Name || '',
        fighterBName: fight.fighterB?.name || fight.fighter2Name || '',
        order: fight.order || null, // Fight order on card (1 = first fight, higher = later fights)
        cardType: fight.cardType || null,  // "Main Card", "Prelims", "Early Prelims"
        weightClass: fight.weightClass || null,  // Weight class string from UFC.com
        isTitle: fight.isTitle || false,  // Championship fight flag
        status: fightStatus,
        currentRound,
        completedRounds,
        currentTime: fight.currentTime || null, // Live round time (e.g., "3:45")
        hasStarted: fightStatus !== 'upcoming',
        isComplete: fightStatus === 'complete',
        winner: fight.result?.winner || fight.winner || null,
        method: fight.result?.method || fight.method || null,
        winningRound: fight.result?.round || fight.round || null,
        winningTime: fight.result?.time || fight.time || null
      };
    });

    return {
      eventName: eventData.eventName || eventData.name,
      hasStarted,
      isComplete,
      fights
    };
  }
}

// ============== SINGLETON INSTANCE ==============

const liveTracker = new LiveEventTracker();

export default liveTracker;

// ============== CONVENIENCE FUNCTIONS ==============

export async function startLiveTracking(config: LiveEventConfig): Promise<void> {
  await liveTracker.start(config);
}

export async function stopLiveTracking(): Promise<void> {
  await liveTracker.stop();
}

export function getLiveTrackingStatus(): TrackerStatus {
  return liveTracker.getStatus();
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventId = process.argv[2] || 'c68b1e85-b3cf-499d-86e7-a413bee893f5'; // UFC 320 ID
  const eventUrl = process.argv[3] || 'https://www.ufc.com/event/ufc-320';
  const eventName = process.argv[4] || 'UFC 320';

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    await stopLiveTracking();
    process.exit(0);
  });

  // Start tracking
  startLiveTracking({
    eventId,
    eventUrl,
    eventName,
    intervalSeconds: 30
  }).catch(error => {
    console.error('Failed to start tracker:', error);
    process.exit(1);
  });

  console.log('\n💡 Press Ctrl+C to stop tracking\n');
}
