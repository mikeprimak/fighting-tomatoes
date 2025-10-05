/**
 * Debug script to check where live banners appear on UFC page
 */

const puppeteer = require('puppeteer');

async function debugLiveBanner() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto('https://www.ufc.com/event/ufc-320', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('.c-listing-fight', { timeout: 10000 });

    const debug = await page.evaluate(() => {
      const results = [];

      // Count total live banners on page
      const allLiveBanners = document.querySelectorAll('.c-listing-fight__banner--live');
      results.push(`Total .c-listing-fight__banner--live elements on page: ${allLiveBanners.length}`);

      // Check each fight
      const fightElements = document.querySelectorAll('.c-listing-fight');
      results.push(`\nTotal fights: ${fightElements.length}\n`);

      fightElements.forEach((element, index) => {
        const detailsContainer = element.querySelector('.c-listing-fight__details');
        const redName = detailsContainer?.querySelector('.c-listing-fight__corner-name--red')?.textContent?.trim() || '';
        const blueName = detailsContainer?.querySelector('.c-listing-fight__corner-name--blue')?.textContent?.trim() || '';

        if (detailsContainer) {
          const liveBanner = detailsContainer.querySelector('.c-listing-fight__banner--live');
          const hasLiveBanner = liveBanner !== null;
          const isVisible = hasLiveBanner && !liveBanner.classList.contains('hidden');

          if (hasLiveBanner) {
            results.push(`Fight ${index + 1}: ${redName} vs ${blueName}`);
            results.push(`  Has banner: YES`);
            results.push(`  Has 'hidden' class: ${liveBanner.classList.contains('hidden') ? 'YES' : 'NO'}`);
            results.push(`  Is actually live: ${isVisible ? 'YES' : 'NO'}`);
          }
        } else {
          results.push(`Fight ${index + 1}: NO DETAILS CONTAINER`);
        }
      });

      return results.join('\n');
    });

    console.log(debug);

  } finally {
    await browser.close();
  }
}

debugLiveBanner().catch(console.error);
