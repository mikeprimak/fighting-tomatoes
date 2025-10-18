// Background Jobs Scheduler
// Runs periodic tasks like event completion checking, news scraping, and live event tracking

import * as cron from 'node-cron';
import { checkEventCompletion } from './eventCompletionChecker';
import { MMANewsScraper } from './mmaNewsScraper';
import { checkAndStartLiveEvents } from './liveEventScheduler';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let eventCompletionJob: cron.ScheduledTask | null = null;
let newsScraperJobs: cron.ScheduledTask[] = [];
let liveEventSchedulerJob: cron.ScheduledTask | null = null;

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

  // ENABLED: News scraper optimized for 512MB RAM (200-300MB peak usage)
  newsScraperTimes.forEach((cronTime, index) => {
    const job = cron.schedule(cronTime, async () => {
      console.log(`[Background Jobs] Running news scraper (schedule ${index + 1}/6)...`);
      try {
        await runNewsScraper();
      } catch (error) {
        console.error('[Background Jobs] News scraper failed:', error);
      }
    });
    newsScraperJobs.push(job);
  });

  console.log(`[Background Jobs] News scraper ENABLED - ${newsScraperTimes.length} daily schedules (${newsScraperTimes.join(', ')})`);

  // ENABLED: Live event scheduler - checks every 5 minutes for events to track
  liveEventSchedulerJob = cron.schedule('*/5 * * * *', async () => {
    console.log('[Background Jobs] Running live event scheduler check...');
    try {
      await checkAndStartLiveEvents();
    } catch (error) {
      console.error('[Background Jobs] Live event scheduler failed:', error);
    }
  });

  console.log('[Background Jobs] Live event scheduler ENABLED - checks every 5 minutes');

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
