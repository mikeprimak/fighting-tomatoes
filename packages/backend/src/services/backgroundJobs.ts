// Background Jobs Scheduler
// Runs periodic tasks like event completion checking, news scraping, and live event tracking

import * as cron from 'node-cron';
import { MMANewsScraper } from './mmaNewsScraper';
import { startEventLifecycle, stopEventLifecycle, runEventLifecycleCheck } from './eventLifecycle';
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
  runDailyRizinScraper,
  runAllOrganizationScrapers,
  OrganizationScraperResults,
} from './dailyAllScrapers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let newsScraperJobs: cron.ScheduledTask[] = [];
let dailyScraperJob: cron.ScheduledTask | null = null;


/**
 * Start all background jobs
 */
export function startBackgroundJobs(): void {
  console.log('[Background Jobs] Starting background jobs...');

  // ENABLED: Event lifecycle checker (replaces old event scheduler + failsafe + time-based updater)
  // Runs every 5 minutes: UPCOMING→LIVE, section-based fight completion, LIVE→COMPLETED
  startEventLifecycle();

  // DISABLED: News scraper (memory constraints - run manually via POST /api/news/scrape)
  console.log(`[Background Jobs] News scraper DISABLED (memory constraints - run manually via API)`);

  // DISABLED: Daily UFC scraper - runs via GitHub Actions instead
  console.log('[Background Jobs] Daily UFC scraper DISABLED - runs via GitHub Actions instead');

  // DISABLED: Organization scrapers (memory constraints - run manually via API)
  console.log('[Background Jobs] Organization scrapers DISABLED (memory constraints - run manually via API)');

}

/**
 * Stop all background jobs (useful for graceful shutdown)
 */
export function stopBackgroundJobs(): void {
  console.log('[Background Jobs] Stopping background jobs...');

  stopEventLifecycle();

  newsScraperJobs.forEach((job) => {
    job.stop();
  });
  if (newsScraperJobs.length > 0) {
    console.log(`[Background Jobs] ${newsScraperJobs.length} news scraper jobs stopped`);
  }

  if (dailyScraperJob) {
    dailyScraperJob.stop();
    console.log('[Background Jobs] Daily UFC scraper stopped');
  }

  console.log('[Background Jobs] All background jobs stopped');
}

/**
 * Trigger event lifecycle check manually (for testing/admin)
 */
export async function triggerEventLifecycleCheck(): Promise<void> {
  console.log('[Background Jobs] Manual trigger: event lifecycle check');
  const results = await runEventLifecycleCheck();
  console.log(`[Background Jobs] Lifecycle check: ${results.eventsStarted} started, ${results.fightsCompleted} fights completed, ${results.eventsCompleted} events completed`);
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
 * Trigger daily UFC scraper manually (for testing/admin)
 */
export async function triggerDailyUFCScraper(): Promise<DailyScraperResults> {
  console.log('[Background Jobs] Manual trigger: daily UFC scraper');
  return await runDailyUFCScraper();
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
 * Trigger RIZIN scraper manually (for testing/admin)
 */
export async function triggerRizinScraper(): Promise<OrganizationScraperResults> {
  console.log('[Background Jobs] Manual trigger: RIZIN scraper');
  return await runDailyRizinScraper();
}

/**
 * Trigger all organization scrapers manually (for testing/admin)
 * Warning: This runs all scrapers sequentially and may take a long time
 */
export async function triggerAllOrganizationScrapers(): Promise<OrganizationScraperResults[]> {
  console.log('[Background Jobs] Manual trigger: ALL organization scrapers');
  return await runAllOrganizationScrapers();
}
