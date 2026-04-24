/**
 * MVP (Most Valuable Promotions) Scraper - Scrapes event data from Tapology
 *
 * Tapology is used as the data source for consistent live tracking integration.
 * This scraper extracts fight cards from Tapology event pages.
 *
 * Usage:
 * - Manual: node src/services/scrapeMVPTapology.js
 * - Automated: SCRAPER_MODE=automated node src/services/scrapeMVPTapology.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '600000', 10);

// Tapology URLs for MVP
const TAPOLOGY_PROMOTION_URL = 'https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp';
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
  console.log('\n📋 Scraping MVP events from Tapology...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(TAPOLOGY_PROMOTION_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for any event link to appear on the page
    await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const seenUrls = new Set();

      // Find event links ONLY inside #content (the promotion's event list).
      // The sidebar calendar shows events from ALL promotions, but #content
      // and #mainUpcoming only contain events for this specific promotion.
      const contentEl = document.querySelector('#content');
      const upcomingEl = document.querySelector('#mainUpcoming');
      const eventLinks = [
        ...(contentEl ? contentEl.querySelectorAll('a[href*="/fightcenter/events/"]') : []),
        ...(upcomingEl ? upcomingEl.querySelectorAll('a[href*="/fightcenter/events/"]') : []),
      ];

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
          const textContent = container.textContent || '';

          // Match date patterns like "Sunday, March 8, 9:00 PM ET"
          const dateMatch = textContent.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*[A-Z]*)?/i);
          if (dateMatch) {
            dateText = dateMatch[0].trim();
          }

          // Look for venue info
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

    console.log(`✅ Found ${uniqueEvents.length} MVP events\n`);
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

    // Wait for fighter links to appear (resilient to Tapology layout changes)
    await page.waitForSelector('a[href*="/fightcenter/fighters/"]', { timeout: 15000 });

    // Dismiss cookie consent banner if present
    try {
      const consentBtn = await page.$('button[aria-label="Consent"], .fc-cta-consent, button.accept-cookies, [data-testid="consent-accept"]');
      if (consentBtn) {
        await consentBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      // Consent banner not present or already dismissed
    }

    const eventIdMatch = eventUrl.match(/\/events\/(\d+)-/);
    const eventIdFromUrl = eventIdMatch ? eventIdMatch[1] : null;

    const eventData = await page.evaluate((eventId) => {
      const data = {
        eventName: '',
        dateText: '',
        eventDate: null,
        eventStartTime: null,
        eventImageUrl: null,
        venue: '',
        city: '',
        country: '',
        broadcast: '',
        fights: []
      };

      // Tapology poster is a fallback here (MVP's own site is preferred later).
      // Prefer og:image meta; fall back to id-scoped img to avoid sidebar cross-contamination.
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content && ogImage.content.includes('poster_images')) {
        data.eventImageUrl = ogImage.content;
      }
      if (!data.eventImageUrl && eventId) {
        const scopedImg = document.querySelector(`img[src*="poster_images/${eventId}/"]`);
        if (scopedImg && scopedImg.src) data.eventImageUrl = scopedImg.src;
      }

      // Extract event name from header - skip cookie consent banners
      const eventHeader = document.querySelector('.eventPageHeaderTitles h1, .header h1, #main h1, .content h1')
        || document.querySelector('h1:not([class*="consent"]):not([class*="cookie"]):not([class*="modal"])');
      if (eventHeader) {
        const name = eventHeader.textContent.trim();
        if (name && !name.toLowerCase().includes('consent') && !name.toLowerCase().includes('cookie') && !name.toLowerCase().includes('privacy')) {
          data.eventName = name;
        }
      }
      // If we still don't have a name, try the page title
      if (!data.eventName) {
        const titleMatch = document.title.match(/^(.+?)(?:\s*[-|]|\s*\|)/);
        if (titleMatch) {
          data.eventName = titleMatch[1].trim();
        }
      }

      // Extract date from page text
      const pageText = document.body.innerText || '';
      const dateMatch = pageText.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
      if (dateMatch) {
        data.dateText = dateMatch[0].trim();
      }

      // Extract event start time - try targeted CSS selector first, then fall back to page text
      const dateTimeLi = document.querySelector('li span.font-bold');
      if (dateTimeLi && /date\s*\/?\s*time/i.test(dateTimeLi.textContent)) {
        const valueSpan = dateTimeLi.parentElement.querySelector('span.text-neutral-700, span:not(.font-bold)');
        if (valueSpan) {
          const dtText = valueSpan.textContent || '';
          const dtTimeMatch = dtText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:ET|EST|EDT|PT|PST|PDT|CT|CST|CDT)/i);
          if (dtTimeMatch) {
            data.eventStartTime = dtTimeMatch[1].trim().toUpperCase();
          }
          const numDateMatch = dtText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (numDateMatch && !data.dateText) {
            const [, mm, dd, yyyy] = numDateMatch;
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            data.dateText = `${monthNames[parseInt(mm,10)-1]} ${parseInt(dd,10)}, ${yyyy}`;
          }
        }
      }
      if (!data.eventStartTime) {
        const timePatterns = [
          /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:ET|EST|EDT)/i,
          /(\d{1,2}:\d{2}(?:am|pm))\s*(?:ET|EST|EDT)/i,
          /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:PT|PST|PDT|CT|CST|CDT)/i,
        ];
        for (const pattern of timePatterns) {
          const timeMatch = pageText.match(pattern);
          if (timeMatch) {
            data.eventStartTime = timeMatch[1].trim().toUpperCase();
            break;
          }
        }
      }

      // Extract venue/location from page text
      const venueMatch = pageText.match(/(?:Meta APEX|[A-Z][a-zA-Z\s]+(?:Arena|Center|Centre|Garden|Stadium|Hall|Coliseum|Pavilion|Theatre|Theater))\s*[,•·]\s*([^,\n]+)/);
      if (venueMatch) {
        const fullMatch = venueMatch[0];
        const parts = fullMatch.split(/[,•·]/).map(p => p.trim());
        data.venue = parts[0] || '';
        data.city = parts[1] || '';
        data.country = parts.length > 2 ? parts[parts.length - 1] : '';
      }

      // Build a map of fighter ID -> headshot image URL from all images on the page
      const headshots = new Map();
      document.querySelectorAll('img[src*="headshot_images"]').forEach(img => {
        const src = img.src || img.getAttribute('data-src');
        if (!src) return;
        const idMatch = src.match(/headshot_images\/(\d+)\//);
        if (idMatch) {
          headshots.set(idMatch[1], src);
        }
      });

      // SCOPED FIGHT EXTRACTION: iterate fight list items (Tapology uses <li> with
      // border-b styling for each bout). Collect fighter links only from inside each
      // <li> — NOT from the whole page — so sidebar/related-events widgets don't
      // bleed unrelated fights into the card.
      const fightListItems = document.querySelectorAll('li.border-b, li[class*="border-b"]');
      const processedPairs = new Set();

      fightListItems.forEach(li => {
        // Skip <li> inside nav/header/footer/aside
        if (li.closest('nav, header, footer, aside')) return;

        // Collect headshot images scoped to this <li> (positional fallback for
        // legacy-slug fighters whose URL has no numeric ID — e.g. Rousey, Carano).
        // Tapology renders bout rows with fighter images left/right; first img is
        // fighterA, second is fighterB.
        const liHeadshotSrcs = [];
        li.querySelectorAll('img[src*="headshot_images"]').forEach(img => {
          const src = img.src || img.getAttribute('data-src');
          if (src) liHeadshotSrcs.push(src);
        });

        // Collect unique fighter links inside this <li>
        const linksInLi = [];
        const seenUrlsInLi = new Set();
        li.querySelectorAll('a[href*="/fightcenter/fighters/"]').forEach(link => {
          const name = link.textContent.trim();
          const url = link.href;
          if (!name || name.length < 3 || seenUrlsInLi.has(url)) return;
          seenUrlsInLi.add(url);
          const idMatch = url.match(/\/fightcenter\/fighters\/(\d+)-/);
          const fighterId = idMatch ? idMatch[1] : null;
          // Primary match: numeric-id keyed headshot map. Fallback: positional
          // image from within this <li> (index 0 for fighterA, 1 for fighterB).
          let imageUrl = fighterId ? (headshots.get(fighterId) || null) : null;
          if (!imageUrl && liHeadshotSrcs[linksInLi.length]) {
            imageUrl = liHeadshotSrcs[linksInLi.length];
          }
          linksInLi.push({ name, url, fighterId, imageUrl });
        });

        // Need at least 2 fighters per bout
        if (linksInLi.length < 2) return;
        const fighterA = linksInLi[0];
        const fighterB = linksInLi[1];

        // Deduplicate — Tapology may render fight rows multiple times (mobile/desktop)
        const pairKey = [fighterA.url, fighterB.url].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        data.fights.push({
          fightId: `mvp-fight-${data.fights.length + 1}`,
          order: data.fights.length + 1,
          cardType: data.fights.length === 0 ? 'Main Event' : 'Main Card',
          weightClass: '',
          scheduledRounds: 12,
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
      });

      return data;
    }, eventIdFromUrl);

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
 * Scrape event poster images from the official MVP website.
 * Returns a map of normalized keywords → image URL for matching against Tapology events.
 */
async function scrapeMVPWebsiteImages(browser) {
  console.log('\n🖼️  Scraping event images from mostvaluablepromotions.com...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto('https://www.mostvaluablepromotions.com/events/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const eventImages = await page.evaluate(() => {
      const results = [];
      // Each event card is an <a> containing an <img alt="Event Poster"> and text with fighter names
      document.querySelectorAll('a[href*="/event/"]').forEach(link => {
        const img = link.querySelector('img[alt="Event Poster"]');
        if (!img || !img.src) return;

        const href = link.href;
        const text = link.textContent.trim();
        const imageUrl = img.src;

        // Extract slug from URL: /event/dubois-vs-harper-scotney-vs-flores/ → dubois-vs-harper-scotney-vs-flores
        const slugMatch = href.match(/\/event\/([^/]+)\/?$/);
        const slug = slugMatch ? slugMatch[1] : '';

        results.push({ imageUrl, text, slug, href });
      });
      return results;
    });

    await page.close();

    console.log(`   Found ${eventImages.length} event images from MVP website`);
    eventImages.forEach(e => {
      console.log(`     ${e.slug} → ${e.imageUrl.substring(0, 80)}...`);
    });

    return eventImages;

  } catch (error) {
    console.error(`   ❌ Error scraping MVP website: ${error.message}`);
    try { await page.close(); } catch (e) {}
    return [];
  }
}

/**
 * Match MVP website images to Tapology events.
 * Uses multiple strategies: slug-based "vs" matching, text matching, and
 * "prospects" number matching for the MVP Prospects series.
 */
function matchEventImages(tapologyEvents, mvpWebsiteImages) {
  let matched = 0;

  for (const event of tapologyEvents) {
    // MVP website images take priority over Tapology poster_images
    const hadTapologyFallback = !!event.eventImageUrl;
    const eventNameLower = event.eventName.toLowerCase();

    for (const mvpImg of mvpWebsiteImages) {
      const slugLower = mvpImg.slug.toLowerCase();

      // Strategy 1: Extract "vs" pairs from slug and match against event name
      const vsMatch = slugLower.match(/([a-z]+)-vs-([a-z]+)/);
      if (vsMatch) {
        const name1 = vsMatch[1];
        const name2 = vsMatch[2];
        if (eventNameLower.includes(name1) && eventNameLower.includes(name2)) {
          event.eventImageUrl = mvpImg.imageUrl;
          matched++;
          console.log(`   ✅ Matched: "${event.eventName}" → ${mvpImg.imageUrl.split('/').pop()}`);
          break;
        }
      }

      // Strategy 2: Match MVP website text content against Tapology event name
      const mvpTextLower = mvpImg.text.toLowerCase().replace(/\s+/g, ' ');
      const tapologyVsMatch = eventNameLower.match(/(\w+)\s+vs\.?\s+(\w+)/);
      if (tapologyVsMatch) {
        const tName1 = tapologyVsMatch[1];
        const tName2 = tapologyVsMatch[2];
        if (mvpTextLower.includes(tName1) && mvpTextLower.includes(tName2)) {
          event.eventImageUrl = mvpImg.imageUrl;
          matched++;
          console.log(`   ✅ Matched: "${event.eventName}" → ${mvpImg.imageUrl.split('/').pop()}`);
          break;
        }
      }

      // Strategy 3: Match "Prospects" series by number
      // Tapology: "MVP Prospects 16" or "Most Valuable Prospects VII"
      // MVP site: "prospects-16-championship-edition" or "most-valuable-prospects-iv"
      const romanNumerals = { 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12, 'xiii': 13, 'xiv': 14, 'xv': 15, 'xvi': 16 };
      const eventProspectsMatch = eventNameLower.match(/prospects?\s+(\d+|[ivxl]+)/i);
      if (eventProspectsMatch && slugLower.includes('prospects')) {
        let eventNum = parseInt(eventProspectsMatch[1], 10);
        if (isNaN(eventNum)) {
          eventNum = romanNumerals[eventProspectsMatch[1].toLowerCase()] || 0;
        }

        // Check slug for number
        const slugNumMatch = slugLower.match(/prospects?-(\d+|[ivxl]+)/i);
        if (slugNumMatch && eventNum > 0) {
          let slugNum = parseInt(slugNumMatch[1], 10);
          if (isNaN(slugNum)) {
            slugNum = romanNumerals[slugNumMatch[1].toLowerCase()] || 0;
          }
          if (eventNum === slugNum) {
            event.eventImageUrl = mvpImg.imageUrl;
            matched++;
            console.log(`   ✅ Matched: "${event.eventName}" → ${mvpImg.imageUrl.split('/').pop()}`);
            break;
          }
        }
      }
    }
  }

  console.log(`   Matched ${matched}/${tapologyEvents.length} events with images\n`);
}

/**
 * Main scraper function
 */
async function main() {
  console.log('\n🚀 Starting MVP Tapology Scraper\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Discover events from the MVP promotion page
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
        country: eventData.country || '',
        dateText: eventData.dateText || discovered.dateText || '',
        eventDate: eventData.eventDate || null,
        eventImageUrl: eventData.eventImageUrl || null,
        eventStartTime: eventData.eventStartTime || null,
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

    // Scrape event images from MVP website and match to Tapology events
    const mvpWebsiteImages = await scrapeMVPWebsiteImages(browser);
    if (mvpWebsiteImages.length > 0) {
      matchEventImages(allEvents, mvpWebsiteImages);
    }

    // Save scraped data
    const outputDir = path.join(__dirname, '../../scraped-data/mvp');
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

    // Save athletes
    const athletes = Array.from(athleteMap.values());
    const athletesPath = path.join(outputDir, 'latest-athletes.json');
    fs.writeFileSync(athletesPath, JSON.stringify({ athletes }, null, 2));

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
  console.log(`🚀 Starting MVP scraper in ${SCRAPER_MODE} mode...`);

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
