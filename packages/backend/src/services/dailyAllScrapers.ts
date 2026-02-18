/**
 * Daily Scrapers for All Organizations
 *
 * Runs scrapers for each combat sports organization on a schedule
 * - Each org has its own scraper + import pipeline
 * - Staggered throughout the day to avoid memory issues on Render
 *
 * Organizations:
 * - UFC (already has dedicated dailyUFCScraper.ts at 12pm EST)
 * - BKFC, PFL, ONE FC, Matchroom, Golden Boy, Top Rank, Oktagon
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { EmailService } from '../utils/email';

// Import functions from each parser
import { importBKFCData } from './bkfcDataParser';
import { importPFLData } from './pflDataParser';
import { importOneFCData } from './oneFCDataParser';
import { importMatchroomData } from './matchroomDataParser';
import { importGoldenBoyData } from './goldenBoyDataParser';
import { importTopRankData } from './topRankDataParser';
import { importOktagonData } from './oktagonDataParser';
import { importRizinData } from './rizinDataParser';

const execAsync = promisify(exec);

export interface OrganizationScraperResults {
  organization: string;
  success: boolean;
  eventsScraped: number;
  fightersScraped: number;
  duration: number;
  error?: string;
}

type OrganizationType = 'BKFC' | 'PFL' | 'ONEFC' | 'MATCHROOM' | 'GOLDENBOY' | 'TOPRANK' | 'OKTAGON' | 'RIZIN';

// Config for each organization's scraper
const SCRAPER_CONFIG: Record<OrganizationType, {
  scraperFile: string;
  importFn: (options?: any) => Promise<void>;
  displayName: string;
  timeout: number; // in ms
}> = {
  BKFC: {
    scraperFile: 'scrapeAllBKFCData.js',
    importFn: importBKFCData,
    displayName: 'BKFC (Bare Knuckle FC)',
    timeout: 1500000, // 25 minutes
  },
  PFL: {
    scraperFile: 'scrapeAllPFLData.js',
    importFn: importPFLData,
    displayName: 'PFL (Professional Fighters League)',
    timeout: 1500000, // 25 minutes
  },
  ONEFC: {
    scraperFile: 'scrapeAllOneFCData.js',
    importFn: importOneFCData,
    displayName: 'ONE Championship',
    timeout: 1500000, // 25 minutes
  },
  MATCHROOM: {
    scraperFile: 'scrapeAllMatchroomData.js',
    importFn: importMatchroomData,
    displayName: 'Matchroom Boxing',
    timeout: 1500000, // 25 minutes
  },
  GOLDENBOY: {
    scraperFile: 'scrapeAllGoldenBoyData.js',
    importFn: importGoldenBoyData,
    displayName: 'Golden Boy Promotions',
    timeout: 1500000, // 25 minutes
  },
  TOPRANK: {
    scraperFile: 'scrapeAllTopRankData.js',
    importFn: importTopRankData,
    displayName: 'Top Rank Boxing',
    timeout: 1500000, // 25 minutes
  },
  OKTAGON: {
    scraperFile: 'scrapeAllOktagonData.js',
    importFn: importOktagonData,
    displayName: 'OKTAGON MMA',
    timeout: 1500000, // 25 minutes
  },
  RIZIN: {
    scraperFile: 'scrapeAllRizinData.js',
    importFn: importRizinData,
    displayName: 'RIZIN Fighting Federation',
    timeout: 1500000, // 25 minutes
  },
};

/**
 * Run scraper for a specific organization
 */
export async function runOrganizationScraper(org: OrganizationType): Promise<OrganizationScraperResults> {
  const config = SCRAPER_CONFIG[org];
  const startTime = Date.now();

  console.log('\n========================================');
  console.log(`🗓️  DAILY ${org} SCRAPER - Starting`);
  console.log(`   Organization: ${config.displayName}`);
  console.log(`   Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
  console.log('========================================\n');

  const results: OrganizationScraperResults = {
    organization: org,
    success: false,
    eventsScraped: 0,
    fightersScraped: 0,
    duration: 0,
  };

  try {
    // STEP 1: Run the Puppeteer scraper
    console.log(`[Daily ${org} Scraper] Step 1: Running scraper...\n`);

    const scraperPath = path.join(__dirname, config.scraperFile);

    // Set environment variables for automated mode
    const env = {
      ...process.env,
      SCRAPER_MODE: 'automated',
      SCRAPER_TIMEOUT: config.timeout.toString(),
    };

    const { stdout, stderr } = await execAsync(`node "${scraperPath}"`, {
      env,
      timeout: config.timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    if (stderr && !stderr.includes('DeprecationWarning') && !stderr.includes('ExperimentalWarning')) {
      console.warn(`[Daily ${org} Scraper] Scraper warnings:`, stderr);
    }

    console.log(`[Daily ${org} Scraper] ✓ Scraper completed\n`);

    // Parse scraper output for stats (patterns vary by scraper)
    const eventsMatch = stdout.match(/(\d+)\s+events?\s+(scraped|found)/i);
    const fightersMatch = stdout.match(/(\d+)\s+(unique\s+)?athletes?/i) || stdout.match(/(\d+)\s+fighters?/i);

    if (eventsMatch) results.eventsScraped = parseInt(eventsMatch[1], 10);
    if (fightersMatch) results.fightersScraped = parseInt(fightersMatch[1], 10);

    // STEP 2: Import scraped data to database
    console.log(`[Daily ${org} Scraper] Step 2: Importing to database...\n`);

    await config.importFn();

    console.log(`[Daily ${org} Scraper] ✓ Import completed\n`);

    results.success = true;
    results.duration = Math.floor((Date.now() - startTime) / 1000);

    console.log('========================================');
    console.log(`✅ DAILY ${org} SCRAPER - Complete`);
    console.log(`   Duration: ${results.duration}s`);
    console.log(`   Events scraped: ${results.eventsScraped}`);
    console.log(`   Fighters scraped: ${results.fightersScraped}`);
    console.log('========================================\n');

  } catch (error: any) {
    results.success = false;
    results.error = error.message;
    results.duration = Math.floor((Date.now() - startTime) / 1000);

    console.error('\n========================================');
    console.error(`❌ DAILY ${org} SCRAPER - Failed`);
    console.error(`   Duration: ${results.duration}s`);
    console.error(`   Error: ${error.message}`);
    console.error('========================================\n');

    // Send email alert for scraper failure
    EmailService.sendScraperFailureAlert(org, error.message).catch((emailErr) => {
      console.error(`[${org}] Failed to send failure alert email:`, emailErr);
    });

    // Don't throw - let the scheduler continue with other scrapers
  }

  return results;
}

// Convenience functions for each organization
export async function runDailyBKFCScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('BKFC');
}

export async function runDailyPFLScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('PFL');
}

export async function runDailyOneFCScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('ONEFC');
}

export async function runDailyMatchroomScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('MATCHROOM');
}

export async function runDailyGoldenBoyScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('GOLDENBOY');
}

export async function runDailyTopRankScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('TOPRANK');
}

export async function runDailyOktagonScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('OKTAGON');
}

export async function runDailyRizinScraper(): Promise<OrganizationScraperResults> {
  return runOrganizationScraper('RIZIN');
}

/**
 * Run all organization scrapers sequentially
 * Used for manual full refresh
 */
export async function runAllOrganizationScrapers(): Promise<OrganizationScraperResults[]> {
  console.log('\n🌐 Starting FULL SCRAPE of all organizations...\n');
  const startTime = Date.now();

  const results: OrganizationScraperResults[] = [];
  const organizations: OrganizationType[] = ['BKFC', 'PFL', 'ONEFC', 'MATCHROOM', 'GOLDENBOY', 'TOPRANK', 'OKTAGON', 'RIZIN'];

  for (const org of organizations) {
    const result = await runOrganizationScraper(org);
    results.push(result);

    // Wait 10 seconds between scrapers to let memory settle
    if (organizations.indexOf(org) < organizations.length - 1) {
      console.log('[All Scrapers] Waiting 10s before next scraper...\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  const totalDuration = Math.floor((Date.now() - startTime) / 1000);
  const successCount = results.filter(r => r.success).length;

  console.log('\n========================================');
  console.log('🌐 FULL SCRAPE COMPLETE');
  console.log(`   Total Duration: ${totalDuration}s`);
  console.log(`   Success: ${successCount}/${results.length}`);
  results.forEach(r => {
    console.log(`   ${r.organization}: ${r.success ? '✅' : '❌'} (${r.duration}s)`);
  });
  console.log('========================================\n');

  return results;
}

/**
 * Get list of all organizations and their scraper status
 */
export function getAllOrganizations(): { org: OrganizationType; displayName: string }[] {
  return Object.entries(SCRAPER_CONFIG).map(([org, config]) => ({
    org: org as OrganizationType,
    displayName: config.displayName,
  }));
}
