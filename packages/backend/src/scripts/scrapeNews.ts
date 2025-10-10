#!/usr/bin/env node
import { MMANewsScraper } from '../services/mmaNewsScraper';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const scraper = new MMANewsScraper();

  try {
    console.log('=== MMA News Scraper ===\n');

    const articles = await scraper.scrapeAll();

    // Save to JSON file
    const outputDir = path.join(process.cwd(), 'scraped-data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `mma-news-${timestamp}.json`);

    fs.writeFileSync(outputFile, JSON.stringify(articles, null, 2));

    console.log(`\n✓ Saved ${articles.length} articles to: ${outputFile}`);

    // Print summary by source
    console.log('\n=== Summary by Source ===');
    const sources = [...new Set(articles.map(a => a.source))];
    sources.forEach(source => {
      const count = articles.filter(a => a.source === source).length;
      console.log(`${source}: ${count} articles`);
    });

    // Print first 3 articles as preview
    console.log('\n=== Preview (First 3 Articles) ===');
    articles.slice(0, 3).forEach((article, idx) => {
      console.log(`\n${idx + 1}. ${article.headline}`);
      console.log(`   Source: ${article.source}`);
      console.log(`   URL: ${article.url}`);
      console.log(`   Description: ${article.description.substring(0, 100)}...`);
      console.log(`   Image: ${article.imageUrl}`);
      console.log(`   Local Image: ${article.localImagePath || 'N/A'}`);
    });

  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

main();
