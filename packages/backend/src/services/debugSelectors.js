/**
 * Debug UFC page selectors to find correct ones
 */

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.goto('https://www.ufc.com/event/ufc-320', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.c-listing-fight', { timeout: 10000 });

  // Get HTML of first fight to analyze structure
  const firstFightHTML = await page.evaluate(() => {
    const firstFight = document.querySelector('.c-listing-fight');
    return firstFight ? firstFight.innerHTML : 'No fight found';
  });

  // Take a screenshot to see the structure
  await page.screenshot({ path: require('path').join(__dirname, '../../test-results/ufc-320-page.png'), fullPage: true });

  // Try to find card sections and timing info
  const cardInfo = await page.evaluate(() => {
    const listContainer = document.querySelector('.fight-card');
    if (!listContainer) return { error: 'No fight-card container found' };

    const sections = [];
    Array.from(listContainer.children).forEach(child => {
      // Look for section title/time
      const headline = child.querySelector('.c-card-event--fight-card__headline');
      const dateTime = child.querySelector('.c-card-event--fight-card__date');
      const fights = child.querySelectorAll('.c-listing-fight');

      sections.push({
        className: child.className,
        sectionName: headline?.textContent?.trim() || null,
        startTime: dateTime?.textContent?.trim() || null,
        fightCount: fights.length,
        sampleHTML: child.innerHTML.substring(0, 800)
      });
    });

    return {
      totalSections: sections.length,
      sections
    };
  });

  console.log('\n=== CARD SECTIONS INFO ===\n');
  console.log(JSON.stringify(cardInfo, null, 2));

  await browser.close();
})();
