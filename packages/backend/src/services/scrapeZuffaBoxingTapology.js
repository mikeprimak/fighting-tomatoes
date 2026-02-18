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

    // Wait for any event link to appear on the page
    // Tapology removed .fcListing class - now uses plain divs with event links
    await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const seenUrls = new Set();

      // Find all event links on the promotion page
      const eventLinks = document.querySelectorAll('a[href*="/fightcenter/events/"]');

      eventLinks.forEach(link => {
        const eventUrl = link.href;
        const eventName = link.textContent.trim();

        // Skip if no valid URL or name, or duplicate
        if (!eventUrl || !eventName || eventName.length < 3) return;
        if (seenUrls.has(eventUrl)) return;
        seenUrls.add(eventUrl);

        // Walk up to the parent container to find date and venue info
        const container = link.closest('div, li, section, tr') || link.parentElement;
        let dateText = '';
        let venueText = '';

        if (container) {
          // Look for date text in nearby elements
          const textContent = container.textContent || '';

          // Match date patterns like "Sunday, March 8, 9:00 PM ET" or "Mar 8, 2026"
          const dateMatch = textContent.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*[A-Z]*)?/i);
          if (dateMatch) {
            dateText = dateMatch[0].trim();
          }

          // Look for venue info (text with bullet separator or location patterns)
          const venueMatch = textContent.match(/(?:•|·|\|)\s*([^•·|\n]+(?:,\s*[A-Z]{2})?)/);
          if (venueMatch) {
            venueText = venueMatch[1].trim();
          }
        }

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
      const locationEl = document.querySelector('.eventVenue, .venue, [class*="location"]');
      if (locationEl) {
        const locationText = locationEl.textContent.trim();
        const parts = locationText.split(',').map(p => p.trim());
        data.venue = parts[0] || '';
        data.city = parts[1] || '';
        data.country = parts[parts.length - 1] || 'USA';
      }

      // Tapology uses ul/li structure for fight cards
      // Try multiple selectors to find bout containers
      let boutRows = document.querySelectorAll('ul.fightCard > li, .fightCardBout, section li');

      // If no bouts found, try finding by fighter links and grouping
      if (boutRows.length === 0) {
        // Alternative approach: find all fighter links and group them into pairs
        const allFighterLinks = document.querySelectorAll('a[href*="/fightcenter/fighters/"]');
        const fightersFound = [];

        allFighterLinks.forEach(link => {
          const name = link.textContent.trim();
          const url = link.href;
          // Skip navigation/menu links (they're usually shorter or have certain classes)
          if (name && name.length > 3 && !name.includes('Tapology') && !link.closest('nav, header, footer')) {
            // Extract fighter ID from URL
            const idMatch = url.match(/\/fightcenter\/fighters\/(\d+)-/);
            const fighterId = idMatch ? idMatch[1] : null;

            // Find associated image (look for img near this link)
            let imageUrl = null;
            const container = link.closest('div, li, td, section');
            if (container) {
              const img = container.querySelector('img[src*="headshot"], img[src*="tapology"]');
              if (img) {
                imageUrl = img.src || img.getAttribute('data-src');
              }
            }

            // Avoid duplicates
            if (!fightersFound.some(f => f.url === url)) {
              fightersFound.push({ name, url, fighterId, imageUrl });
            }
          }
        });

        // Group fighters into pairs (assuming they appear in bout order)
        for (let i = 0; i < fightersFound.length - 1; i += 2) {
          const fighterA = fightersFound[i];
          const fighterB = fightersFound[i + 1];
          if (fighterA && fighterB) {
            data.fights.push({
              fightId: `zuffa-fight-${data.fights.length + 1}`,
              order: data.fights.length + 1,
              cardType: data.fights.length === 0 ? 'Main Event' : 'Main Card',
              weightClass: '',
              scheduledRounds: 10,
              isTitle: false,
              fighterA: {
                name: fighterA.name,
                athleteUrl: fighterA.url || '',
                fighterId: fighterA.fighterId,
                imageUrl: fighterA.imageUrl,
                record: '',
                country: ''
              },
              fighterB: {
                name: fighterB.name,
                athleteUrl: fighterB.url || '',
                fighterId: fighterB.fighterId,
                imageUrl: fighterB.imageUrl,
                record: '',
                country: ''
              }
            });
          }
        }

        return data;
      }

      // Original approach if bout containers found
      let fightOrder = 1;
      boutRows.forEach(row => {
        // Find fighter links with both name and URL
        const fighterLinks = row.querySelectorAll('a[href*="/fightcenter/fighters/"]');
        const fighters = [];

        fighterLinks.forEach(link => {
          const name = link.textContent.trim();
          const url = link.href;
          if (name && name.length > 2 && !fighters.some(f => f.name === name)) {
            const idMatch = url.match(/\/fightcenter\/fighters\/(\d+)-/);
            const fighterId = idMatch ? idMatch[1] : null;
            fighters.push({ name, url, fighterId });
          }
        });

        if (fighters.length < 2) return;

        // Try to find fighter images in the row
        const images = row.querySelectorAll('img[src*="headshot"]');
        const imageUrls = [];
        images.forEach(img => {
          const src = img.src || img.getAttribute('data-src');
          if (src) {
            imageUrls.push(src);
          }
        });

        // Extract weight class and rounds from text
        const rowText = row.textContent;
        let weightClass = '';
        const weightMatch = rowText.match(/(\d{3})\s*lbs?/i);
        if (weightMatch) {
          weightClass = `${weightMatch[1]} lbs`;
        }

        let scheduledRounds = 10;
        const roundsMatch = rowText.match(/(\d+)\s*x\s*3/i);
        if (roundsMatch) {
          scheduledRounds = parseInt(roundsMatch[1], 10);
        }

        const isTitleFight = rowText.toLowerCase().includes('title') ||
                            rowText.toLowerCase().includes('championship');

        data.fights.push({
          fightId: `zuffa-fight-${fightOrder}`,
          order: fightOrder++,
          cardType: fightOrder === 1 ? 'Main Event' : 'Main Card',
          weightClass,
          scheduledRounds,
          isTitle: isTitleFight,
          fighterA: {
            name: fighters[0].name,
            athleteUrl: fighters[0].url || '',
            fighterId: fighters[0].fighterId,
            imageUrl: imageUrls[0] || null,
            record: '',
            country: ''
          },
          fighterB: {
            name: fighters[1].name,
            athleteUrl: fighters[1].url || '',
            fighterId: fighters[1].fighterId,
            imageUrl: imageUrls[1] || null,
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
 * Scrape fighter image from their Tapology profile page
 */
async function scrapeFighterImage(browser, fighterUrl) {
  if (!fighterUrl) return null;

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(fighterUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for the page to load
    await page.waitForSelector('img', { timeout: 5000 });

    const imageUrl = await page.evaluate(() => {
      // Look for the fighter's profile image
      // Tapology uses letterbox_images for fighter photos on profile pages
      const allImages = document.querySelectorAll('img[src*="images.tapology.com"]');
      for (const img of allImages) {
        const src = img.src;
        // Prefer letterbox_images (main profile photo) over logo_squares
        if (src && src.includes('letterbox_images')) {
          return src;
        }
      }

      // Fallback: try headshot_images
      for (const img of allImages) {
        const src = img.src;
        if (src && src.includes('headshot_images')) {
          return src;
        }
      }

      return null;
    });

    await page.close();
    return imageUrl;
  } catch (error) {
    console.log(`      ⚠ Could not get image for ${fighterUrl}: ${error.message}`);
    await page.close();
    return null;
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
    // Discover events from the Zuffa Boxing promotion page
    const discoveredEvents = await scrapeEventsList(browser);

    // If no events discovered, there's nothing to scrape
    if (discoveredEvents.length === 0) {
      console.log('⚠ No events found on Tapology promotion page. Exiting.');
      await browser.close();
      return;
    }

    const allEvents = [];
    const athleteMap = new Map();

    for (const discovered of discoveredEvents) {
      console.log(`\n📄 Processing event: ${discovered.eventName}`);
      await new Promise(r => setTimeout(r, delays.betweenPages));

      const eventData = await scrapeEventPage(browser, discovered.eventUrl);

      // Parse the date
      if (eventData.dateText) {
        const parsedDate = parseTapologyDate(eventData.dateText);
        if (parsedDate) {
          eventData.eventDate = parsedDate.toISOString();
        }
      }

      // Build event slug from URL
      const eventSlug = getEventSlug(discovered.eventUrl) || discovered.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // Build complete event object
      const event = {
        eventName: eventData.eventName || discovered.eventName,
        eventType: 'Regular',
        eventUrl: discovered.eventUrl,
        eventSlug,
        venue: eventData.venue || '',
        city: eventData.city || '',
        state: '',
        country: eventData.country || 'USA',
        dateText: eventData.dateText || discovered.dateText || '',
        eventDate: eventData.eventDate || null,
        eventImageUrl: null,
        status: discovered.status || 'Upcoming',
        fights: eventData.fights
      };

      allEvents.push(event);

      // Collect unique athletes
      for (const fight of event.fights) {
        if (!athleteMap.has(fight.fighterA.name)) {
          athleteMap.set(fight.fighterA.name, {
            name: fight.fighterA.name,
            url: fight.fighterA.athleteUrl,
            fighterId: fight.fighterA.fighterId,
            imageUrl: fight.fighterA.imageUrl
          });
        }
        if (!athleteMap.has(fight.fighterB.name)) {
          athleteMap.set(fight.fighterB.name, {
            name: fight.fighterB.name,
            url: fight.fighterB.athleteUrl,
            fighterId: fight.fighterB.fighterId,
            imageUrl: fight.fighterB.imageUrl
          });
        }
      }
    }

    // Save scraped data
    const outputDir = path.join(__dirname, '../../scraped-data/zuffa-boxing');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `events-${timestamp}.json`);
    const latestPath = path.join(outputDir, 'latest-events.json');

    const outputData = { events: allEvents };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(outputData, null, 2));

    console.log('\n💾 Saved data:');
    console.log(`   ✅ ${outputPath}`);
    console.log(`   ✅ ${latestPath}`);

    // Scrape images for athletes that don't have one yet
    // Time-budget: stop after 3 minutes to avoid hitting the overall timeout
    const IMAGE_FETCH_BUDGET_MS = 3 * 60 * 1000;
    const imageFetchStart = Date.now();
    console.log('\n🖼️  Fetching fighter images (3 min budget)...');
    const athletes = Array.from(athleteMap.values());
    let imagesFetched = 0;
    let imagesSkipped = 0;
    for (const athlete of athletes) {
      if (Date.now() - imageFetchStart > IMAGE_FETCH_BUDGET_MS) {
        imagesSkipped = athletes.filter(a => !a.imageUrl && a.url).length - imagesFetched;
        console.log(`   ⏱️  Time budget reached, skipping ${imagesSkipped} remaining fighters`);
        break;
      }
      if (!athlete.imageUrl && athlete.url) {
        console.log(`   📸 Getting image for ${athlete.name}...`);
        await new Promise(r => setTimeout(r, delays.betweenFighters)); // Rate limit
        athlete.imageUrl = await scrapeFighterImage(browser, athlete.url);
        if (athlete.imageUrl) {
          console.log(`      ✅ Found image`);
        } else {
          console.log(`      ⚠ No image found`);
        }
        imagesFetched++;
      }
    }
    console.log(`   ✅ Fetched ${imagesFetched} images in ${Math.floor((Date.now() - imageFetchStart) / 1000)}s`);

    // Update fights with scraped images
    for (const event of allEvents) {
      for (const fight of event.fights) {
        const athleteA = athleteMap.get(fight.fighterA.name);
        const athleteB = athleteMap.get(fight.fighterB.name);
        if (athleteA && athleteA.imageUrl) {
          fight.fighterA.imageUrl = athleteA.imageUrl;
        }
        if (athleteB && athleteB.imageUrl) {
          fight.fighterB.imageUrl = athleteB.imageUrl;
        }
      }
    }

    // Re-save events with updated image URLs
    const updatedOutputData = { events: allEvents };
    fs.writeFileSync(outputPath, JSON.stringify(updatedOutputData, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(updatedOutputData, null, 2));

    const athletesPath = path.join(outputDir, 'latest-athletes.json');
    fs.writeFileSync(athletesPath, JSON.stringify({ athletes }, null, 2));

    console.log('\n💾 Saved updated data with images:');
    console.log(`   ✅ ${outputPath}`);
    console.log(`   ✅ ${latestPath}`);
    console.log(`   ✅ ${athletesPath}`);

    // Summary
    const totalFights = allEvents.reduce((sum, e) => sum + e.fights.length, 0);
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');
    console.log(`   Events: ${allEvents.length}`);
    allEvents.forEach(e => {
      console.log(`     - ${e.eventName} (${e.dateText}) - ${e.fights.length} fights`);
    });
    console.log(`   Total Fights: ${totalFights}`);
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
