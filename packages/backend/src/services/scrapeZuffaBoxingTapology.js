/**
 * Zuffa Boxing Scraper - Scrapes event data from Tapology
 *
 * Tapology is used because Zuffa Boxing doesn't have their own website yet.
 * This scraper extracts fight cards from Tapology event pages.
 *
 * Usage:
 * - Manual: node src/services/scrapeZuffaBoxingTapology.js
 * - Automated: SCRAPER_MODE=automated node src/services/scrapeZuffaBoxingTapology.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '600000', 10);

// Tapology URLs for Zuffa Boxing
const TAPOLOGY_PROMOTION_URL = 'https://www.tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb';
const TAPOLOGY_BASE_URL = 'https://www.tapology.com';

// Delays in milliseconds
const DELAYS = {
  manual: {
    betweenPages: 2000,
    betweenFighters: 500,
  },
  automated: {
    betweenPages: 1000,
    betweenFighters: 200,
  }
};

const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

// Month name to number mapping
const MONTHS = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11,
};

/**
 * Parse date string from Tapology format
 * Examples: "Friday, January 23, 2026", "January 23, 2026"
 */
function parseTapologyDate(dateStr) {
  if (!dateStr) return null;

  // Remove day name if present
  const cleanDate = dateStr.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '');

  // Match pattern: "Month Day, Year"
  const match = cleanDate.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  const month = MONTHS[monthName];
  if (month === undefined) return null;

  return new Date(year, month, day);
}

/**
 * Extract event slug from Tapology URL
 */
function getEventSlug(url) {
  const match = url.match(/events\/\d+-([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Scrape upcoming events list from Tapology promotion page
 */
async function scrapeEventsList(browser) {
  console.log('\n📋 Scraping Zuffa Boxing events from Tapology...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(TAPOLOGY_PROMOTION_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for events table to load
    await page.waitForSelector('.fcListing', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      // Find event rows in the promotion's event listing
      const eventRows = document.querySelectorAll('.fcListing tr, .eventList li, [class*="event"]');

      eventRows.forEach(row => {
        // Look for event links
        const eventLink = row.querySelector('a[href*="/fightcenter/events/"]');
        if (!eventLink) return;

        const eventUrl = eventLink.href;
        const eventName = eventLink.textContent.trim();

        // Skip if no valid URL or name
        if (!eventUrl || !eventName || eventName.length < 3) return;

        // Extract date if visible
        const dateEl = row.querySelector('.eventDate, .date, time, td:nth-child(2)');
        const dateText = dateEl ? dateEl.textContent.trim() : '';

        // Extract venue if visible
        const venueEl = row.querySelector('.venue, .location, td:nth-child(3)');
        const venueText = venueEl ? venueEl.textContent.trim() : '';

        extractedEvents.push({
          eventName,
          eventUrl,
          dateText,
          venue: venueText,
          status: 'Upcoming'
        });
      });

      return extractedEvents;
    });

    await page.close();

    // Deduplicate by URL
    const uniqueEvents = [];
    const seenUrls = new Set();
    for (const event of events) {
      if (!seenUrls.has(event.eventUrl)) {
        seenUrls.add(event.eventUrl);
        uniqueEvents.push(event);
      }
    }

    console.log(`✅ Found ${uniqueEvents.length} Zuffa Boxing events\n`);
    return uniqueEvents;

  } catch (error) {
    console.error('Error scraping events list:', error.message);
    await page.close();
    return [];
  }
}

/**
 * Scrape individual event page for fight card
 */
async function scrapeEventPage(browser, eventUrl) {
  console.log(`   📄 Scraping: ${eventUrl}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for fight card to load
    await page.waitForSelector('.fightCard, .fightCardBout, [class*="bout"]', { timeout: 15000 });

    const eventData = await page.evaluate(() => {
      const data = {
        eventName: '',
        dateText: '',
        eventDate: null,
        venue: '',
        city: '',
        country: '',
        broadcast: '',
        fights: []
      };

      // Extract event name from header
      const eventHeader = document.querySelector('h1, .eventName, .eventHeader');
      if (eventHeader) {
        data.eventName = eventHeader.textContent.trim();
      }

      // Extract date
      const dateEl = document.querySelector('.eventDate, [class*="date"], .details li:first-child');
      if (dateEl) {
        data.dateText = dateEl.textContent.trim();
      }

      // Extract venue/location
      const locationEl = document.querySelector('.eventVenue, .venue, .details li:contains("Venue")');
      if (locationEl) {
        const locationText = locationEl.textContent.trim();
        const parts = locationText.split(',').map(p => p.trim());
        data.venue = parts[0] || '';
        data.city = parts[1] || '';
        data.country = parts[parts.length - 1] || 'USA';
      }

      // Find all fight bouts
      const boutRows = document.querySelectorAll('.fightCardBout, .bout, tr[class*="bout"], .fightCard li');
      let fightOrder = 1;

      boutRows.forEach(row => {
        // Find fighter names - they're usually in links or specific elements
        const fighterLinks = row.querySelectorAll('a[href*="/fightcenter/fighters/"]');
        const fighterNames = [];

        fighterLinks.forEach(link => {
          const name = link.textContent.trim();
          if (name && name.length > 2 && !fighterNames.includes(name)) {
            fighterNames.push(name);
          }
        });

        // If we don't have 2 fighters from links, try other selectors
        if (fighterNames.length < 2) {
          const nameEls = row.querySelectorAll('.fighterName, .name, .fighter');
          nameEls.forEach(el => {
            const name = el.textContent.trim();
            if (name && name.length > 2 && !fighterNames.includes(name)) {
              fighterNames.push(name);
            }
          });
        }

        if (fighterNames.length < 2) return;

        // Extract weight class
        let weightClass = '';
        const weightEl = row.querySelector('.weight, .weightClass, [class*="weight"]');
        if (weightEl) {
          weightClass = weightEl.textContent.trim();
        }

        // Check if title fight
        const isTitleFight = row.textContent.toLowerCase().includes('title') ||
                            row.textContent.toLowerCase().includes('championship');

        // Extract scheduled rounds
        let scheduledRounds = 10; // Default for boxing
        const roundsMatch = row.textContent.match(/(\d+)\s*x\s*3/i);
        if (roundsMatch) {
          scheduledRounds = parseInt(roundsMatch[1], 10);
        }

        // Determine card type based on position
        const cardType = fightOrder === 1 ? 'Main Card' : 'Main Card';

        data.fights.push({
          fightId: `zuffa-fight-${fightOrder}`,
          order: fightOrder++,
          cardType,
          weightClass,
          scheduledRounds,
          isTitle: isTitleFight,
          fighterA: {
            name: fighterNames[0],
            athleteUrl: '',
            imageUrl: null,
            record: '',
            country: ''
          },
          fighterB: {
            name: fighterNames[1],
            athleteUrl: '',
            imageUrl: null,
            record: '',
            country: ''
          }
        });
      });

      return data;
    });

    await page.close();

    console.log(`      ✅ Found ${eventData.fights.length} fights`);
    return eventData;

  } catch (error) {
    console.error(`      ❌ Error: ${error.message}`);
    await page.close();
    return { fights: [] };
  }
}

/**
 * Main scraper function
 */
async function main() {
  console.log('\n🚀 Starting Zuffa Boxing Tapology Scraper\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // For now, scrape the specific event URL directly
    const eventUrl = 'https://www.tapology.com/fightcenter/events/137070-zuffa-boxing';

    const eventData = await scrapeEventPage(browser, eventUrl);

    // Parse the date
    if (eventData.dateText) {
      const parsedDate = parseTapologyDate(eventData.dateText);
      if (parsedDate) {
        eventData.eventDate = parsedDate.toISOString();
      }
    }

    // Build complete event object
    const event = {
      eventName: eventData.eventName || 'Zuffa Boxing 1: Walsh vs. Ocampo',
      eventType: 'Regular',
      eventUrl: eventUrl,
      eventSlug: 'zuffa-boxing-1-walsh-vs-ocampo',
      venue: eventData.venue || 'UFC APEX',
      city: eventData.city || 'Las Vegas',
      state: 'NV',
      country: eventData.country || 'USA',
      dateText: eventData.dateText || 'January 23, 2026',
      eventDate: eventData.eventDate || new Date(2026, 0, 23).toISOString(),
      eventImageUrl: null,
      status: 'Upcoming',
      fights: eventData.fights
    };

    // Save scraped data
    const outputDir = path.join(__dirname, '../../scraped-data/zuffa-boxing');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `events-${timestamp}.json`);
    const latestPath = path.join(outputDir, 'latest-events.json');

    const outputData = { events: [event] };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(outputData, null, 2));

    console.log('\n💾 Saved data:');
    console.log(`   ✅ ${outputPath}`);
    console.log(`   ✅ ${latestPath}`);

    // Also save athletes
    const athletes = [];
    const seenNames = new Set();
    for (const fight of event.fights) {
      if (!seenNames.has(fight.fighterA.name)) {
        seenNames.add(fight.fighterA.name);
        athletes.push({ name: fight.fighterA.name, url: fight.fighterA.athleteUrl, imageUrl: null });
      }
      if (!seenNames.has(fight.fighterB.name)) {
        seenNames.add(fight.fighterB.name);
        athletes.push({ name: fight.fighterB.name, url: fight.fighterB.athleteUrl, imageUrl: null });
      }
    }

    const athletesPath = path.join(outputDir, 'latest-athletes.json');
    fs.writeFileSync(athletesPath, JSON.stringify({ athletes }, null, 2));
    console.log(`   ✅ ${athletesPath}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');
    console.log(`   Event: ${event.eventName}`);
    console.log(`   Date: ${event.dateText}`);
    console.log(`   Venue: ${event.venue}, ${event.city}`);
    console.log(`   Fights: ${event.fights.length}`);
    console.log(`   Athletes: ${athletes.length}`);

    console.log('\n✅ Scraper completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run with timeout protection
async function runWithTimeout() {
  return Promise.race([
    main(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Scraper timed out after ${OVERALL_TIMEOUT}ms`)), OVERALL_TIMEOUT)
    )
  ]);
}

// Run if called directly
if (require.main === module) {
  const startTime = Date.now();
  console.log(`🚀 Starting Zuffa Boxing scraper in ${SCRAPER_MODE} mode...`);

  runWithTimeout()
    .then(() => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.log(`✅ Scraper completed in ${duration}s`);
      process.exit(0);
    })
    .catch(error => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.error(`\n❌ Scraper failed after ${duration}s:`, error.message);
      process.exit(1);
    });
}

module.exports = { main, runWithTimeout };
