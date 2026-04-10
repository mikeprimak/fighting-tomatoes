/**
 * Gold Star Scraper - Scrapes event data from Tapology
 *
 * Gold Star Promotions events are listed on Tapology. This scraper extracts
 * fight cards from Tapology event pages.
 *
 * Usage:
 * - Manual: node src/services/scrapeGoldStarTapology.js
 * - Automated: SCRAPER_MODE=automated node src/services/scrapeGoldStarTapology.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '600000', 10);

// Tapology URLs for Gold Star Promotions
const TAPOLOGY_PROMOTION_URL = 'https://www.tapology.com/fightcenter/promotions/6908-gold-star-promotions-gsp';
const TAPOLOGY_BASE_URL = 'https://www.tapology.com';

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

// How many days in the past to still consider "recent" — events older than
// this are skipped entirely (Gold Star only cares about upcoming cards).
const STALE_DAYS = 3;

function parseTapologyDate(dateStr) {
  if (!dateStr) return null;
  const cleanDate = dateStr.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '');
  const match = cleanDate.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  return new Date(parseInt(match[3], 10), month, parseInt(match[2], 10));
}

function isStale(eventDate) {
  if (!eventDate) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);
  return eventDate < cutoff;
}

function getEventSlug(url) {
  const match = url.match(/events\/\d+-([^/]+)/);
  return match ? match[1] : null;
}

async function scrapeEventsList(browser) {
  console.log('\n📋 Scraping Gold Star events from Tapology...\n');
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(TAPOLOGY_PROMOTION_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const seenUrls = new Set();
      // Gold Star events use fighter-vs-fighter slugs (no org marker), so
      // scope to #content to avoid the sidebar's other-org events.
      const scope = document.querySelector('#content') || document;
      scope.querySelectorAll('a[href*="/fightcenter/events/"]').forEach(link => {
        const eventUrl = link.href;
        const eventName = link.textContent.trim();
        if (!eventUrl || !eventName || eventName.length < 3) return;
        if (seenUrls.has(eventUrl)) return;
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
    let skippedStale = 0;
    for (const event of events) {
      if (seenUrls.has(event.eventUrl)) continue;
      seenUrls.add(event.eventUrl);
      // Skip clearly-past events early to avoid a slow per-page scrape.
      const parsedDate = parseTapologyDate(event.dateText);
      if (parsedDate && isStale(parsedDate)) {
        skippedStale++;
        continue;
      }
      uniqueEvents.push(event);
    }
    if (skippedStale > 0) {
      console.log(`⏭  Skipped ${skippedStale} past events (>${STALE_DAYS} days old)`);
    }
    console.log(`✅ Found ${uniqueEvents.length} upcoming Gold Star events\n`);
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

    const eventData = await page.evaluate(() => {
      const data = { eventName: '', dateText: '', eventDate: null, eventStartTime: null, venue: '', city: '', country: '', eventImageUrl: null, fights: [] };

      // Extract event poster image from Tapology
      const posterImg = document.querySelector('img[src*="poster_images"]');
      if (posterImg && posterImg.src) {
        data.eventImageUrl = posterImg.src;
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

      const allFighterLinks = document.querySelectorAll('a[href*="/fightcenter/fighters/"]');
      const fightersFound = [];
      const seenUrls = new Set();
      allFighterLinks.forEach(link => {
        const name = link.textContent.trim();
        const url = link.href;
        if (!name || name.length < 3 || link.closest('nav, header, footer')) return;
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        const idMatch = url.match(/\/fightcenter\/fighters\/(\d+)-/);
        const fighterId = idMatch ? idMatch[1] : null;
        const imageUrl = fighterId ? (headshots.get(fighterId) || null) : null;
        fightersFound.push({ name, url, fighterId, imageUrl });
      });

      for (let i = 0; i < fightersFound.length - 1; i += 2) {
        const a = fightersFound[i], b = fightersFound[i + 1];
        if (!a || !b) break;
        data.fights.push({
          fightId: `gold-star-fight-${data.fights.length + 1}`,
          order: data.fights.length + 1,
          cardType: data.fights.length === 0 ? 'Main Event' : 'Main Card',
          weightClass: '', scheduledRounds: 12, isTitle: false,
          fighterA: { name: a.name, athleteUrl: a.url || '', fighterId: a.fighterId, imageUrl: a.imageUrl, record: '', country: '' },
          fighterB: { name: b.name, athleteUrl: b.url || '', fighterId: b.fighterId, imageUrl: b.imageUrl, record: '', country: '' }
        });
      }
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

async function main() {
  console.log('\n🚀 Starting Gold Star Tapology Scraper\n');
  console.log('='.repeat(60));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const discoveredEvents = await scrapeEventsList(browser);
    if (discoveredEvents.length === 0) { console.log('⚠ No events found. Exiting.'); await browser.close(); return; }

    const allEvents = [];
    const athleteMap = new Map();

    for (const discovered of discoveredEvents) {
      console.log(`\n📄 Processing event: ${discovered.eventName}`);
      await new Promise(r => setTimeout(r, delays.betweenPages));
      const eventData = await scrapeEventPage(browser, discovered.eventUrl);

      if (eventData.dateText) {
        const parsedDate = parseTapologyDate(eventData.dateText);
        if (parsedDate) eventData.eventDate = parsedDate.toISOString();
      }

      // Backup staleness check — catches events whose listing-page date had
      // no year so they couldn't be filtered in scrapeEventsList.
      if (eventData.eventDate && isStale(new Date(eventData.eventDate))) {
        console.log(`      ⏭  Skipping past event (${eventData.dateText})`);
        continue;
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

    const outputDir = path.join(__dirname, '../../scraped-data/goldstar');
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
    console.log(`   Events: ${allEvents.length}`);
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
  console.log(`🚀 Starting Gold Star scraper in ${SCRAPER_MODE} mode...`);
  runWithTimeout()
    .then(() => { console.log(`✅ Completed in ${Math.floor((Date.now() - startTime) / 1000)}s`); process.exit(0); })
    .catch(error => { console.error(`\n❌ Failed after ${Math.floor((Date.now() - startTime) / 1000)}s:`, error.message); process.exit(1); });
}

module.exports = { main, runWithTimeout };
