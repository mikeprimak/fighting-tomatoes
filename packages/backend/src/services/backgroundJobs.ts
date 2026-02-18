// Background Jobs Scheduler
// Runs periodic tasks like event completion checking, news scraping, and live event tracking

import * as cron from 'node-cron';
import { checkEventCompletion } from './eventCompletionChecker';
import { MMANewsScraper } from './mmaNewsScraper';
import { checkAndStartLiveEvents } from './liveEventScheduler';
import { scheduleAllUpcomingEvents, safetyCheckEvents, cancelAllScheduledEvents } from './eventBasedScheduler';
import { startScheduledStartTimeChecker, stopScheduledStartTimeChecker } from './timeBasedFightStatusUpdater';
import { runFailsafeCleanup, FailsafeResults } from './failsafeCleanup';
import { runDailyUFCScraper, DailyScraperResults } from './dailyUFCScraper';
import {
  runDailyBKFCScraper,
  runDailyPFLScraper,
  runDailyOneFCScraper,
  runDailyMatchroomScraper,
  runDailyGoldenBoyScraper,
  runDailyTopRankScraper,
  runDailyOktagonScraper,
  runDailyZuffaBoxingScraper,
  runAllOrganizationScrapers,
  OrganizationScraperResults,
} from './dailyAllScrapers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let eventCompletionJob: cron.ScheduledTask | null = null;
let newsScraperJobs: cron.ScheduledTask[] = [];
let liveEventSchedulerJob: cron.ScheduledTask | null = null;
let eventSchedulerSafetyJob: cron.ScheduledTask | null = null;
let dailyScraperJob: cron.ScheduledTask | null = null;
let failsafeCleanupJob: cron.ScheduledTask | null = null;

// Organization scraper jobs (staggered at night to avoid memory issues)
let bkfcScraperJob: cron.ScheduledTask | null = null;
let pflScraperJob: cron.ScheduledTask | null = null;
let oneFCScraperJob: cron.ScheduledTask | null = null;
let matchroomScraperJob: cron.ScheduledTask | null = null;
let goldenBoyScraperJob: cron.ScheduledTask | null = null;
let topRankScraperJob: cron.ScheduledTask | null = null;
let oktagonScraperJob: cron.ScheduledTask | null = null;
let zuffaBoxingScraperJob: cron.ScheduledTask | null = null;

/**
 * Start all background jobs
 */
export function startBackgroundJobs(): void {
  console.log('[Background Jobs] Starting background jobs...');

  // DISABLED: Event completion checker to reduce memory usage on Render
  // Re-enable when needed or after upgrading to a larger instance
  // eventCompletionJob = cron.schedule('*/10 * * * *', async () => {
  //   console.log('[Background Jobs] Running event completion check...');
  //   try {
  //     const results = await checkEventCompletion();
  //     if (results.length > 0) {
  //       console.log(`[Background Jobs] Completed ${results.length} events:`, results);
  //     }
  //   } catch (error) {
  //     console.error('[Background Jobs] Event completion check failed:', error);
  //   }
  // });

  console.log('[Background Jobs] Event completion checker DISABLED (memory constraints)');

  // News scraper - runs at 6am, 9:30am, 1pm, 3:30pm, 4pm, and 7pm EDT
  // Note: node-cron uses server time, so we need to convert EDT to UTC
  // EDT is UTC-4, so: 6am EDT = 10am UTC, 3:30pm EDT = 7:30pm UTC (19:30 UTC), etc.

  const newsScraperTimes = [
    '0 10 * * *',   // 6am EDT = 10am UTC
    '30 13 * * *',  // 9:30am EDT = 1:30pm UTC
    '0 17 * * *',   // 1pm EDT = 5pm UTC
    '30 19 * * *',  // 3:30pm EDT = 7:30pm UTC (19:30 UTC) - TESTING (far from deployment)
    '0 20 * * *',   // 4pm EDT = 8pm UTC
    '0 23 * * *',   // 7pm EDT = 11pm UTC (Note: during EST, this will be off by 1 hour)
  ];

  // DISABLED: News scraper (causes memory crashes on Render free tier when running concurrently with other scrapers)
  // To run manually: POST /api/news/scrape
  // newsScraperTimes.forEach((cronTime, index) => {
  //   const job = cron.schedule(cronTime, async () => {
  //     console.log(`[Background Jobs] Running news scraper (schedule ${index + 1}/6)...`);
  //     try {
  //       await runNewsScraper();
  //     } catch (error) {
  //       console.error('[Background Jobs] News scraper failed:', error);
  //     }
  //   });
  //   newsScraperJobs.push(job);
  // });

  console.log(`[Background Jobs] News scraper DISABLED (memory constraints - run manually via API)`);

  // ENABLED: Event-based scheduler - schedules events at exact times with 15-min safety check
  // On startup, schedule all upcoming events
  setTimeout(async () => {
    console.log('[Background Jobs] Initializing event-based scheduler...');
    try {
      await scheduleAllUpcomingEvents();
    } catch (error) {
      console.error('[Background Jobs] Initial event scheduling failed:', error);
    }

    // Start the per-fight scheduled start time checker (checks every 60s)
    startScheduledStartTimeChecker();
  }, 5000); // Wait 5 seconds after server starts

  // Safety check every 15 minutes for missed events
  eventSchedulerSafetyJob = cron.schedule('*/15 * * * *', async () => {
    console.log('[Background Jobs] Running event scheduler safety check...');
    try {
      await safetyCheckEvents();
    } catch (error) {
      console.error('[Background Jobs] Event scheduler safety check failed:', error);
    }
  });

  console.log('[Background Jobs] Event-based scheduler ENABLED - safety check every 15 minutes');

  // DISABLED: Daily UFC scraper - UFC.com blocks Render IPs
  // The UFC scraper now runs via GitHub Actions workflow (.github/workflows/ufc-scraper.yml)
  // which uses GitHub's IPs that aren't blocked by UFC.com's CDN
  //
  // dailyScraperJob = cron.schedule('0 17 * * *', async () => {
  //   console.log('[Background Jobs] Running daily UFC scraper...');
  //   try {
  //     await runDailyUFCScraper();
  //
  //     // After scraper completes, re-schedule all upcoming events
  //     console.log('[Background Jobs] Re-scheduling events after daily scrape...');
  //     await scheduleAllUpcomingEvents();
  //   } catch (error) {
  //     console.error('[Background Jobs] Daily UFC scraper failed:', error);
  //   }
  // });

  console.log('[Background Jobs] Daily UFC scraper DISABLED - runs via GitHub Actions instead');

  // ENABLED: Failsafe cleanup - runs every hour
  failsafeCleanupJob = cron.schedule('0 * * * *', async () => {
    console.log('[Background Jobs] Running failsafe cleanup...');
    try {
      const results = await runFailsafeCleanup();
      if (results.fightsCompleted > 0 || results.eventsCompleted > 0) {
        console.log(`[Background Jobs] Failsafe: Completed ${results.fightsCompleted} fights, ${results.eventsCompleted} events`);
      }
    } catch (error) {
      console.error('[Background Jobs] Failsafe cleanup failed:', error);
    }
  });

  console.log('[Background Jobs] Failsafe cleanup ENABLED - runs every hour');

  // ============================================
  // ORGANIZATION SCRAPERS - DISABLED FOR MEMORY CONSTRAINTS
  // Puppeteer scrapers use 300-400MB each, causing OOM on Render free tier (512MB)
  // Run manually via API when needed: POST /api/admin/scrape/:org
  // ============================================

  // DISABLED: All organization scrapers (BKFC, PFL, ONE FC, Matchroom, Golden Boy, Top Rank, OKTAGON)
  // To run manually:
  //   - POST /api/admin/scrape/bkfc
  //   - POST /api/admin/scrape/pfl
  //   - POST /api/admin/scrape/onefc
  //   - POST /api/admin/scrape/matchroom
  //   - POST /api/admin/scrape/goldenboy
  //   - POST /api/admin/scrape/toprank
  //   - POST /api/admin/scrape/oktagon
  //   - POST /api/admin/scrape/zuffa-boxing
  console.log('[Background Jobs] Organization scrapers DISABLED (memory constraints - run manually via API)');

  // DISABLED: Initial startup check (also disabled for memory constraints)
  // setTimeout(async () => {
  //   console.log('[Background Jobs] Running initial event completion check...');
  //   try {
  //     const results = await checkEventCompletion();
  //     if (results.length > 0) {
  //       console.log(`[Background Jobs] Initial check completed ${results.length} events:`, results);
  //     } else {
  //       console.log('[Background Jobs] Initial check: no events to complete');
  //     }
  //   } catch (error) {
  //     console.error('[Background Jobs] Initial event completion check failed:', error);
  //   }
  // }, 5000); // Wait 5 seconds after server starts
}

/**
 * Stop all background jobs (useful for graceful shutdown)
 */
export function stopBackgroundJobs(): void {
  console.log('[Background Jobs] Stopping background jobs...');

  if (eventCompletionJob) {
    eventCompletionJob.stop();
    console.log('[Background Jobs] Event completion checker stopped');
  }

  newsScraperJobs.forEach((job, index) => {
    job.stop();
  });
  if (newsScraperJobs.length > 0) {
    console.log(`[Background Jobs] ${newsScraperJobs.length} news scraper jobs stopped`);
  }

  if (liveEventSchedulerJob) {
    liveEventSchedulerJob.stop();
    console.log('[Background Jobs] Live event scheduler stopped');
  }

  if (eventSchedulerSafetyJob) {
    eventSchedulerSafetyJob.stop();
    console.log('[Background Jobs] Event scheduler safety check stopped');
  }

  // Cancel all scheduled event timers
  cancelAllScheduledEvents();

  // Stop the per-fight scheduled start time checker
  stopScheduledStartTimeChecker();

  if (dailyScraperJob) {
    dailyScraperJob.stop();
    console.log('[Background Jobs] Daily UFC scraper stopped');
  }

  if (failsafeCleanupJob) {
    failsafeCleanupJob.stop();
    console.log('[Background Jobs] Failsafe cleanup stopped');
  }

  // Stop organization scrapers
  const orgScraperJobs = [
    { job: bkfcScraperJob, name: 'BKFC' },
    { job: pflScraperJob, name: 'PFL' },
    { job: oneFCScraperJob, name: 'ONE FC' },
    { job: matchroomScraperJob, name: 'Matchroom' },
    { job: goldenBoyScraperJob, name: 'Golden Boy' },
    { job: topRankScraperJob, name: 'Top Rank' },
    { job: oktagonScraperJob, name: 'OKTAGON' },
    { job: zuffaBoxingScraperJob, name: 'Zuffa Boxing' },
  ];

  orgScraperJobs.forEach(({ job, name }) => {
    if (job) {
      job.stop();
      console.log(`[Background Jobs] ${name} scraper stopped`);
    }
  });

  console.log('[Background Jobs] All background jobs stopped');
}

/**
 * Trigger event completion check manually (for testing/admin)
 */
export async function triggerEventCompletionCheck(): Promise<void> {
  console.log('[Background Jobs] Manual trigger: event completion check');
  const results = await checkEventCompletion();
  console.log(`[Background Jobs] Manual check completed ${results.length} events:`, results);
}

/**
 * Run news scraper and save to database
 */
async function runNewsScraper(): Promise<void> {
  const startTime = Date.now();
  console.log('[News Scraper] Starting scrape...');

  try {
    const scraper = new MMANewsScraper();
    const articles = await scraper.scrapeAll();

    if (!articles || articles.length === 0) {
      console.log('[News Scraper] No articles found');
      return;
    }

    console.log(`[News Scraper] Scraped ${articles.length} articles, saving to database...`);

    // Filter out existing articles first
    const existingUrls = await prisma.newsArticle.findMany({
      where: { url: { in: articles.map(a => a.url) } },
      select: { url: true },
    });
    const existingUrlSet = new Set(existingUrls.map((a: any) => a.url));
    const newArticles = articles.filter((a: any) => !existingUrlSet.has(a.url));

    // Create all new articles in bulk (preserves randomized order)
    if (newArticles.length > 0) {
      const baseTime = new Date();

      await prisma.newsArticle.createMany({
        data: newArticles.map((article, index) => ({
          headline: article.headline,
          description: article.description || '',
          url: article.url,
          source: article.source,
          imageUrl: article.imageUrl,
          localImagePath: article.localImagePath,
          scrapedAt: article.scrapedAt,
          createdAt: new Date(baseTime.getTime() + index),
        })),
      });

      const duration = Math.floor((Date.now() - startTime) / 1000);
      const sources = [...new Set(newArticles.map((a: any) => a.source))];
      console.log(`[News Scraper] Completed in ${duration}s - ${newArticles.length} new articles from ${sources.length} sources`);
    } else {
      console.log('[News Scraper] No new articles to save (all already exist)');
    }
  } catch (error) {
    console.error('[News Scraper] Error:', error);
    throw error;
  }
}

/**
 * Trigger news scraper manually (for testing/admin)
 */
export async function triggerNewsScraper(): Promise<void> {
  console.log('[Background Jobs] Manual trigger: news scraper');
  await runNewsScraper();
}

/**
 * Trigger live event scheduler check manually (for testing/admin)
 */
export async function triggerLiveEventScheduler(): Promise<void> {
  console.log('[Background Jobs] Manual trigger: live event scheduler');
  await checkAndStartLiveEvents();
}

/**
 * Trigger daily UFC scraper manually (for testing/admin)
 */
export async function triggerDailyUFCScraper(): Promise<DailyScraperResults> {
  console.log('[Background Jobs] Manual trigger: daily UFC scraper');
  return await runDailyUFCScraper();
}

/**
 * Trigger failsafe cleanup manually (for testing/admin)
 */
export async function triggerFailsafeCleanup(): Promise<FailsafeResults> {
  console.log('[Background Jobs] Manual trigger: failsafe cleanup');
  return await runFailsafeCleanup();
}

// ============================================
// ORGANIZATION SCRAPER MANUAL TRIGGERS
// ============================================

/**
 * Trigger BKFC scraper manually (for testing/admin)
 */
export async function triggerBKFCScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: BKFC scraper');
  return await runDailyBKFCScraper();
}

/**
 * Trigger PFL scraper manually (for testing/admin)
 */
export async function triggerPFLScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: PFL scraper');
  return await runDailyPFLScraper();
}

/**
 * Trigger ONE FC scraper manually (for testing/admin)
 */
export async function triggerOneFCScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: ONE FC scraper');
  return await runDailyOneFCScraper();
}

/**
 * Trigger Matchroom scraper manually (for testing/admin)
 */
export async function triggerMatchroomScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: Matchroom scraper');
  return await runDailyMatchroomScraper();
}

/**
 * Trigger Golden Boy scraper manually (for testing/admin)
 */
export async function triggerGoldenBoyScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: Golden Boy scraper');
  return await runDailyGoldenBoyScraper();
}

/**
 * Trigger Top Rank scraper manually (for testing/admin)
 */
export async function triggerTopRankScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: Top Rank scraper');
  return await runDailyTopRankScraper();
}

/**
 * Trigger OKTAGON scraper manually (for testing/admin)
 */
export async function triggerOktagonScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: OKTAGON scraper');
  return await runDailyOktagonScraper();
}

/**
 * Trigger Zuffa Boxing scraper manually (for testing/admin)
 */
export async function triggerZuffaBoxingScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: Zuffa Boxing scraper');
  return await runDailyZuffaBoxingScraper();
}

/**
 * Trigger all organization scrapers manually (for testing/admin)
 * Warning: This runs all scrapers sequentially and may take a long time
 */
export async function triggerAllOrganizationScrapers(): Promise<OrganizationScraperResults[]> {
  console.log('[Background Jobs] Manual trigger: ALL organization scrapers');
  return await runAllOrganizationScrapers();
}
