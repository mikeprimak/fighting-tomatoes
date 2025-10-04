import UFCPuppeteerScraper from './ufcPuppeteerScraper';
import * as fs from 'fs';
import * as path from 'path';

async function scrapeOnce() {
  const eventUrl = process.argv[2] || 'https://www.ufc.com/event/ufc-320';

  console.log('🚀 Starting one-time scrape...');
  console.log(`📄 Event URL: ${eventUrl}\n`);

  const scraper = new UFCPuppeteerScraper(eventUrl);

  try {
    // Scrape once
    const result = await scraper.scrape();

    // Save to a readable output file
    const outputDir = path.join(__dirname, '../../test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `ufc-scrape-result-${Date.now()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    console.log(`\n✅ Scrape complete!`);
    console.log(`📁 Output saved to: ${outputFile}\n`);

    // Print summary
    console.log('=== SCRAPE SUMMARY ===');
    console.log(`Event: ${result.eventName}`);
    console.log(`Event Start Time: ${result.eventStartTime || 'Not found'}`);
    console.log(`Total Fights: ${result.fights.length}\n`);

    console.log('=== FIGHT START TIMES ===');
    result.fights.forEach((fight, index) => {
      const { red, blue } = fight.fighters;
      console.log(`Fight ${index + 1}: ${red.name} vs ${blue.name}`);
      console.log(`  Start Time: ${fight.startTime || 'Not calculated'}`);
      console.log(`  Weight Class: ${fight.weightClass}`);
      console.log(`  Title Fight: ${fight.isTitle ? 'Yes' : 'No'}`);
      if (fight.result) {
        console.log(`  Result: ${fight.result.winner} wins by ${fight.result.method}`);
      }
      console.log('');
    });

    await scraper.stop();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await scraper.stop();
    process.exit(1);
  }
}

scrapeOnce();
