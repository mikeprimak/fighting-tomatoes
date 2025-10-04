/**
 * Debug script to find correct selectors for UFC events page
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  console.log('📄 Loading UFC events page...');
  await page.goto('https://www.ufc.com/events', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/ufc-events-debug.png', fullPage: true });

  const debug = await page.evaluate(() => {
    // Find all tab-related elements
    const tabs = Array.from(document.querySelectorAll('a[href^="#"]')).map(a => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim(),
      classes: a.className
    }));

    // Find all sections with IDs
    const sections = Array.from(document.querySelectorAll('[id]')).map(el => ({
      id: el.id,
      tagName: el.tagName,
      classes: el.className
    }));

    // Count event cards in different contexts
    const allCards = document.querySelectorAll('.l-listing__item').length;
    const cardsInUpcoming = document.querySelector('#upcoming')
      ? document.querySelector('#upcoming').querySelectorAll('.l-listing__item').length
      : 0;

    // Check for tab content divs
    const tabPanes = Array.from(document.querySelectorAll('.views-element-container, [role="tabpanel"], .view-content'))
      .map(el => ({
        classes: el.className,
        id: el.id,
        cardCount: el.querySelectorAll('.l-listing__item').length
      }));

    return {
      tabs,
      sections: sections.slice(0, 20), // Limit output
      allCards,
      cardsInUpcoming,
      tabPanes
    };
  });

  console.log('\n=== DEBUG INFO ===\n');
  console.log('Tabs found:', JSON.stringify(debug.tabs, null, 2));
  console.log('\nAll event cards:', debug.allCards);
  console.log('Cards in #upcoming:', debug.cardsInUpcoming);
  console.log('\nTab panes:', JSON.stringify(debug.tabPanes, null, 2));

  fs.writeFileSync('test-results/ufc-events-debug.json', JSON.stringify(debug, null, 2));

  console.log('\n💾 Screenshot saved to: test-results/ufc-events-debug.png');
  console.log('💾 Debug data saved to: test-results/ufc-events-debug.json');

  await browser.close();
})().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
