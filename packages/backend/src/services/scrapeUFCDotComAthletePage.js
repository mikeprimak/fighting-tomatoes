/**
 * Scrape UFC athlete page for W-L-D record and headshot image
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapeAthletePage(athleteUrl) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(athleteUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const athleteData = await page.evaluate(() => {
      // Extract W-L-D record
      let record = null;
      const recordEl = document.querySelector('.hero-profile__division-body');
      if (recordEl) {
        const recordText = recordEl.textContent.trim();
        // Format: "8-1-0 (W-L-D)" or similar
        const recordMatch = recordText.match(/(\d+-\d+-\d+)/);
        if (recordMatch) {
          record = recordMatch[1];
        }
      }

      // Extract headshot image URL
      let headshotUrl = null;

      // Try to find headshot in athlete results cards (recent fights)
      const athleteResultImages = document.querySelectorAll(
        '.c-card-event--athlete-results__image img, ' +
        '.c-card-event--athlete-results__red-image img, ' +
        '.c-card-event--athlete-results__blue-image img'
      );

      if (athleteResultImages.length > 0) {
        // Get the first image found
        headshotUrl = athleteResultImages[0].src;
      }

      // If not found in results, try hero profile image
      if (!headshotUrl) {
        const heroImage = document.querySelector('.hero-profile__image img, .c-bio__image img');
        if (heroImage && heroImage.src) {
          headshotUrl = heroImage.src;
        }
      }

      return {
        record,
        headshotUrl
      };
    });

    await browser.close();
    return athleteData;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// If run directly, test with a sample athlete URL
if (require.main === module) {
  (async () => {
    const testUrl = process.argv[2] || 'https://www.ufc.com/athlete/alex-pereira';

    console.log(`\n🌐 Scraping athlete page: ${testUrl}\n`);

    const data = await scrapeAthletePage(testUrl);

    console.log('=== ATHLETE DATA ===');
    console.log(`Record (W-L-D): ${data.record || 'Not found'}`);
    console.log(`Headshot URL: ${data.headshotUrl || 'Not found'}`);

    // Save to file
    const outputDir = path.join(__dirname, '../../test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const athleteName = testUrl.split('/').pop();
    const outputPath = path.join(outputDir, `athlete-${athleteName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`\n💾 Saved to: ${outputPath}`);
    console.log('✅ Done!');
  })().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { scrapeAthletePage };
