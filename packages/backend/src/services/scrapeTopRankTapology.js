/**
 * Top Rank Scraper - Scrapes event data from Tapology
 *
 * Top Rank events are listed on Tapology. This scraper extracts
 * fight cards from Tapology event pages.
 *
 * Usage:
 * - Manual: node src/services/scrapeTopRankTapology.js
 * - Automated: SCRAPER_MODE=automated node src/services/scrapeTopRankTapology.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '600000', 10);

// Tapology URLs for Top Rank
const TAPOLOGY_PROMOTION_URL = 'https://www.tapology.com/fightcenter/promotions/2487-top-rank-tr';
const TAPOLOGY_BASE_URL = 'https://www.tapology.com';

// Delays in milliseconds
const DELAYS = {
  manual: { betweenPages: 2000, betweenFighters: 500 },
  automated: { betweenPages: 1000, betweenFighters: 200 }
};

const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

const MONTHS = {
  'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
  'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
  'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11,
};

function parseTapologyDate(dateStr) {
  if (!dateStr) return null;
  const cleanDate = dateStr.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '');
  const match = cleanDate.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  return new Date(parseInt(match[3], 10), month, parseInt(match[2], 10));
}

function getEventSlug(url) {
  const match = url.match(/events\/\d+-([^/]+)/);
  return match ? match[1] : null;
}

async function scrapeEventsList(browser) {
  console.log('\n📋 Scraping Top Rank events from Tapology...\n');
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(TAPOLOGY_PROMOTION_URL, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const seenUrls = new Set();
      document.querySelectorAll('a[href*="/fightcenter/events/"]').forEach(link => {
        const eventUrl = link.href;
        const eventName = link.textContent.trim();
        if (!eventUrl || !eventName || eventName.length < 3) return;
        if (seenUrls.has(eventUrl)) return;
        // Top Rank events typically contain fighter names in slugs, not a consistent prefix.
        // Filter out obviously non-Top-Rank sidebar events by checking common other orgs.
        const urlLower = eventUrl.toLowerCase();
        const nonTopRank = ['ufc-', 'bellator-', 'pfl-', 'one-', 'rizin-', 'oktagon-', 'bkfc-', 'cage-warriors', 'ksw-', 'lfa-', 'aca-', 'acb-', 'karate-combat', 'dirty-boxing', 'zuffa-boxing', 'gold-star', 'golden-boy', 'matchroom'];
        if (nonTopRank.some(prefix => urlLower.includes(prefix))) return;
        seenUrls.add(eventUrl);

        const container = link.closest('div, li, section, tr') || link.parentElement;
        let dateText = '';
        if (container) {
          const textContent = container.textContent || '';
          const dateMatch = textContent.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*[A-Z]*)?/i);
          if (dateMatch) dateText = dateMatch[0].trim();
        }
        extractedEvents.push({ eventName, eventUrl, dateText, venue: '', status: 'Upcoming' });
      });
      return extractedEvents;
    });

    await page.close();
    const uniqueEvents = [];
    const seenUrls = new Set();
    for (const event of events) {
      if (!seenUrls.has(event.eventUrl)) { seenUrls.add(event.eventUrl); uniqueEvents.push(event); }
    }
    console.log(`✅ Found ${uniqueEvents.length} Top Rank events\n`);
    return uniqueEvents;
  } catch (error) {
    console.error('Error scraping events list:', error.message);
    await page.close();
    return [];
  }
}

async function scrapeEventPage(browser, eventUrl) {
  console.log(`   📄 Scraping: ${eventUrl}`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('a[href*="/fightcenter/fighters/"]', { timeout: 15000 });

    try {
      const consentBtn = await page.$('button[aria-label="Consent"], .fc-cta-consent, button.accept-cookies');
      if (consentBtn) { await consentBtn.click(); await new Promise(r => setTimeout(r, 500)); }
    } catch (e) {}

    const eventIdMatch = eventUrl.match(/\/events\/(\d+)-/);
    const eventIdFromUrl = eventIdMatch ? eventIdMatch[1] : null;

    const eventData = await page.evaluate((eventId) => {
      const data = { eventName: '', dateText: '', eventDate: null, eventStartTime: null, venue: '', city: '', country: '', eventImageUrl: null, fights: [] };

      // Extract event poster image from Tapology.
      // Prefer og:image meta (authoritative for the page). Fall back to an img whose
      // src contains this event's numeric id, to avoid sidebar posters for other events.
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content && ogImage.content.includes('poster_images')) {
        data.eventImageUrl = ogImage.content;
      }
      if (!data.eventImageUrl && eventId) {
        const scopedImg = document.querySelector(`img[src*="poster_images/${eventId}/"]`);
        if (scopedImg && scopedImg.src) data.eventImageUrl = scopedImg.src;
      }

      const eventHeader = document.querySelector('.eventPageHeaderTitles h1, .header h1, #main h1, .content h1')
        || document.querySelector('h1:not([class*="consent"]):not([class*="cookie"])');
      if (eventHeader) {
        const name = eventHeader.textContent.trim();
        if (name && !name.toLowerCase().includes('consent') && !name.toLowerCase().includes('cookie'))
          data.eventName = name;
      }
      if (!data.eventName) {
        const titleMatch = document.title.match(/^(.+?)(?:\s*[-|])/);
        if (titleMatch) data.eventName = titleMatch[1].trim();
      }

      const pageText = document.body.innerText || '';
      const dateMatch = pageText.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
      if (dateMatch) data.dateText = dateMatch[0].trim();

      // Extract event start time - iterate ALL li > span.font-bold to find the
      // one labeled "Date/Time:". Tapology's fight-row labels (e.g. "[W]",
      // "[Main Event]") are also `li span.font-bold`, and on some renderings
      // appear earlier in DOM order than the sidebar Date/Time row. Using
      // querySelector (first match) lands on the wrong span and skips extraction.
      const fontBoldLabels_dt = document.querySelectorAll('li span.font-bold');
      let dateTimeLi = null;
      for (const lbl_dt of fontBoldLabels_dt) {
        if (/date\s*\/?\s*time/i.test(lbl_dt.textContent)) { dateTimeLi = lbl_dt; break; }
      }
      if (dateTimeLi) {
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
        const timePatterns = [/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:ET|EST|EDT)/i, /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:PT|PST|PDT|CT|CST|CDT)/i];
        for (const pattern of timePatterns) {
          const m = pageText.match(pattern);
          if (m) { data.eventStartTime = m[1].trim().toUpperCase(); break; }
        }
      }

      const headshots = new Map();
      document.querySelectorAll('img[src*="headshot_images"]').forEach(img => {
        const src = img.src || img.getAttribute('data-src');
        if (!src) return;
        const idMatch = src.match(/headshot_images\/(\d+)\//);
        if (idMatch) headshots.set(idMatch[1], src);
      });

      // SCOPED FIGHT EXTRACTION: iterate <li> fight rows so sidebar/related-event
      // widgets can't bleed unrelated fighters into the card.
      const fightListItems = document.querySelectorAll('li.border-b, li[class*="border-b"]');
      const processedPairs = new Set();
      fightListItems.forEach(li => {
        if (li.closest('nav, header, footer, aside')) return;
        const linksInLi = [];
        const seenUrlsInLi = new Set();
        li.querySelectorAll('a[href*="/fightcenter/fighters/"]').forEach(link => {
          const name = link.textContent.trim();
          const url = link.href;
          if (!name || name.length < 3 || seenUrlsInLi.has(url)) return;
          seenUrlsInLi.add(url);
          const idMatch = url.match(/\/fightcenter\/fighters\/(\d+)-/);
          const fighterId = idMatch ? idMatch[1] : null;
          const imageUrl = fighterId ? (headshots.get(fighterId) || null) : null;
          linksInLi.push({ name, url, fighterId, imageUrl });
        });
        if (linksInLi.length < 2) return;
        const a = linksInLi[0], b = linksInLi[1];
        const pairKey = [a.url, b.url].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
        data.fights.push({
          fightId: `top-rank-fight-${data.fights.length + 1}`,
          order: data.fights.length + 1,
          cardType: data.fights.length === 0 ? 'Main Event' : 'Main Card',
          weightClass: '', scheduledRounds: 12, isTitle: false,
          fighterA: { name: a.name, athleteUrl: a.url || '', fighterId: a.fighterId, imageUrl: a.imageUrl, record: '', country: '' },
          fighterB: { name: b.name, athleteUrl: b.url || '', fighterId: b.fighterId, imageUrl: b.imageUrl, record: '', country: '' }
        });
      });
      return data;
    }, eventIdFromUrl);

    await page.close();
    console.log(`      ✅ Found ${eventData.fights.length} fights${eventData.eventStartTime ? `, start: ${eventData.eventStartTime}` : ''}`);
    return eventData;
  } catch (error) {
    console.error(`      ❌ Error: ${error.message}`);
    await page.close();
    return { fights: [] };
  }
}

async function main() {
  console.log('\n🚀 Starting Top Rank Tapology Scraper\n');
  console.log('='.repeat(60));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const discoveredEvents = await scrapeEventsList(browser);
    if (discoveredEvents.length === 0) { console.log('⚠ No events found. Exiting.'); await browser.close(); return; }

    const allEvents = [];
    const athleteMap = new Map();

    // Pre-filter: skip events whose date (from hub page listing) is clearly old
    const MAX_AGE_DAYS = 14;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);
    let skippedOld = 0;

    for (const discovered of discoveredEvents) {
      // Check hub-level date text — if parseable and too old, skip the detail scrape
      if (discovered.dateText) {
        const hubDate = parseTapologyDate(discovered.dateText);
        if (hubDate && hubDate < cutoffDate) {
          skippedOld++;
          continue;
        }
      }

      console.log(`\n📄 Processing event: ${discovered.eventName}`);
      await new Promise(r => setTimeout(r, delays.betweenPages));
      const eventData = await scrapeEventPage(browser, discovered.eventUrl);

      if (eventData.dateText) {
        const parsedDate = parseTapologyDate(eventData.dateText);
        if (parsedDate) {
          // Double-check after detail scrape: skip if event date is too old
          if (parsedDate < cutoffDate) {
            console.log(`   ⏭ Skipping old event: ${discovered.eventName} (${eventData.dateText})`);
            skippedOld++;
            continue;
          }
          eventData.eventDate = parsedDate.toISOString();
        }
      }

      const eventSlug = getEventSlug(discovered.eventUrl) || discovered.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const event = {
        eventName: eventData.eventName || discovered.eventName, eventType: 'Regular',
        eventUrl: discovered.eventUrl, eventSlug, venue: eventData.venue || '',
        city: eventData.city || '', state: '', country: eventData.country || '',
        dateText: eventData.dateText || discovered.dateText || '',
        eventDate: eventData.eventDate || null, eventImageUrl: eventData.eventImageUrl || null,
        eventStartTime: eventData.eventStartTime || null,
        status: discovered.status || 'Upcoming', fights: eventData.fights
      };
      allEvents.push(event);

      for (const fight of event.fights) {
        for (const f of [fight.fighterA, fight.fighterB]) {
          if (!athleteMap.has(f.name)) athleteMap.set(f.name, { name: f.name, url: f.athleteUrl, fighterId: f.fighterId, imageUrl: f.imageUrl });
        }
      }
    }

    const outputDir = path.join(__dirname, '../../scraped-data/toprank');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputData = { events: allEvents };
    fs.writeFileSync(path.join(outputDir, `events-${timestamp}.json`), JSON.stringify(outputData, null, 2));
    fs.writeFileSync(path.join(outputDir, 'latest-events.json'), JSON.stringify(outputData, null, 2));
    const athletes = Array.from(athleteMap.values());
    fs.writeFileSync(path.join(outputDir, 'latest-athletes.json'), JSON.stringify({ athletes }, null, 2));

    const totalFights = allEvents.reduce((sum, e) => sum + e.fights.length, 0);
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');
    console.log(`   Events: ${allEvents.length} (${skippedOld} old events skipped)`);
    allEvents.forEach(e => console.log(`     - ${e.eventName} (${e.dateText}) - ${e.fights.length} fights`));
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

async function runWithTimeout() {
  return Promise.race([main(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${OVERALL_TIMEOUT}ms`)), OVERALL_TIMEOUT))]);
}

if (require.main === module) {
  const startTime = Date.now();
  console.log(`🚀 Starting Top Rank scraper in ${SCRAPER_MODE} mode...`);
  runWithTimeout()
    .then(() => { console.log(`✅ Completed in ${Math.floor((Date.now() - startTime) / 1000)}s`); process.exit(0); })
    .catch(error => { console.error(`\n❌ Failed after ${Math.floor((Date.now() - startTime) / 1000)}s:`, error.message); process.exit(1); });
}

module.exports = { main, runWithTimeout };
