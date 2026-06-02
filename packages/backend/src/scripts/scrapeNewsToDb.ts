#!/usr/bin/env node
// Scrape MMA/combat-sports news from all sources and upsert into the database.
// This is the entry point used by the `news-scraper` GitHub Actions workflow
// (run on GHA, not Render, because Puppeteer exceeds Render's 512MB limit).
// Local: `pnpm tsx src/scripts/scrapeNewsToDb.ts` (writes to the DB in .env).

import { newsScraperService } from '../services/newsScraperService';

async function main() {
  console.log('=== MMA News Scraper → Database ===\n');

  const result = await newsScraperService.scrapeAndSave();

  console.log('\n=== Result ===');
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('\n✗ Scrape did not succeed.');
    process.exit(1);
  }

  console.log(
    `\n✓ ${result.newArticles} new article(s) from ${result.sources.length} source(s): ${result.sources.join(', ')}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Scraping failed:', err);
  process.exit(1);
});
