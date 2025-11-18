/**
 * Test scraper to analyze ONE FC website structure
 * This will help us understand the HTML structure before building the full scraper
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    // Test 1: Scrape events list page
    console.log('\n📄 Loading ONE FC events page...');
    await page.goto('https://www.onefc.com/events', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ Events page loaded, extracting structure...\n');

    // Save page HTML for inspection
    const eventsHtml = await page.content();
    const outputDir = path.join(__dirname, '../../test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outputDir, 'onefc-events-page.html'), eventsHtml);

    // Try to extract events
    const eventsData = await page.evaluate(() => {
      const eventCards = document.querySelectorAll('.simple-post-card.is-event, .box-post-event');
      const events = [];

      eventCards.forEach((card, index) => {
        if (index > 2) return; // Only get first 3 events for testing

        const link = card.querySelector('a');
        const eventUrl = link ? link.href : '';

        const title = card.querySelector('.title, h3, h2');
        const eventName = title ? title.textContent.trim() : '';

        const datetime = card.querySelector('.datetime, .event-datetime, [data-timestamp]');
        const dateText = datetime ? datetime.textContent.trim() : '';
        const timestamp = datetime ? datetime.getAttribute('data-timestamp') : '';

        const location = card.querySelector('.location, .event-location');
        const locationText = location ? location.textContent.trim() : '';

        const image = card.querySelector('img');
        const imageUrl = image ? (image.src || image.getAttribute('data-src')) : '';

        events.push({
          eventName,
          eventUrl,
          dateText,
          timestamp,
          locationText,
          imageUrl
        });
      });

      return {
        totalEventCards: eventCards.length,
        sampleEvents: events
      };
    });

    console.log('Events page structure:', JSON.stringify(eventsData, null, 2));
    fs.writeFileSync(
      path.join(outputDir, 'onefc-events-structure.json'),
      JSON.stringify(eventsData, null, 2)
    );

    // Test 2: Scrape a specific event page
    console.log('\n📄 Loading ONE FC Fight Night 38 page...');
    await page.goto('https://www.onefc.com/events/onefightnight38/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ Event page loaded, extracting structure...\n');

    // Save page HTML
    const eventHtml = await page.content();
    fs.writeFileSync(path.join(outputDir, 'onefc-event-detail-page.html'), eventHtml);

    // Try to extract fight card
    const eventData = await page.evaluate(() => {
      // Look for event details
      const eventTitle = document.querySelector('h1, .event-title, .page-title');
      const eventName = eventTitle ? eventTitle.textContent.trim() : '';

      const eventImage = document.querySelector('.event-banner img, .hero img, picture img');
      const eventImageUrl = eventImage ? (eventImage.src || eventImage.getAttribute('data-src')) : '';

      // Try multiple selectors for fight cards
      const fightSelectors = [
        '.matchup',
        '.fight',
        '.bout',
        '[class*="matchup"]',
        '[class*="fight"]',
        'article.fight'
      ];

      let fights = [];
      let usedSelector = null;

      for (const selector of fightSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          usedSelector = selector;
          elements.forEach((fightEl, index) => {
            if (index > 2) return; // Only get first 3 for testing

            // Try to extract fighter names
            const fighters = fightEl.querySelectorAll('.fighter-name, .athlete-name, h3, h4, .name');
            const fighterA = fighters[0] ? fighters[0].textContent.trim() : '';
            const fighterB = fighters[1] ? fighters[1].textContent.trim() : '';

            // Try to extract weight class
            const weightClassEl = fightEl.querySelector('.weight-class, .division, .category');
            const weightClass = weightClassEl ? weightClassEl.textContent.trim() : '';

            fights.push({
              fighterA,
              fighterB,
              weightClass,
              sampleHTML: fightEl.outerHTML.substring(0, 300)
            });
          });
          break;
        }
      }

      return {
        eventName,
        eventImageUrl,
        usedSelector,
        totalFights: fights.length,
        sampleFights: fights,
        pageTitle: document.title
      };
    });

    console.log('Event detail structure:', JSON.stringify(eventData, null, 2));
    fs.writeFileSync(
      path.join(outputDir, 'onefc-event-detail-structure.json'),
      JSON.stringify(eventData, null, 2)
    );

    console.log('\n✅ Structure analysis complete!');
    console.log(`📁 Check test-results folder for HTML and structure files`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
})();
