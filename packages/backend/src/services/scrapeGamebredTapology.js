/**
 * Gamebred Fighting Championship Scraper - Scrapes event data from Tapology
 *
 * Tapology is the source because Gamebred FC doesn't expose a structured event
 * page on their own site. This mirrors the Dirty Boxing / Karate Combat /
 * Zuffa Boxing pattern (single Tapology hub, org-prefixed event slugs).
 *
 * Usage:
 * - Manual: node src/services/scrapeGamebredTapology.js
 * - Automated: SCRAPER_MODE=automated node src/services/scrapeGamebredTapology.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '600000', 10);

const TAPOLOGY_PROMOTION_URL = 'https://www.tapology.com/fightcenter/promotions/3931-gamebred-fighting-championship-gbfc';

const DELAYS = {
  manual: { betweenPages: 2000, betweenFighters: 500 },
  automated: { betweenPages: 1000, betweenFighters: 200 },
};
const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

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

function parseTapologyDate(dateStr) {
  if (!dateStr) return null;
  const cleanDate = dateStr.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '');
  const match = cleanDate.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!match) return null;
  const monthName = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const month = MONTHS[monthName];
  if (month === undefined) return null;
  return new Date(year, month, day);
}

function getEventSlug(url) {
  const match = url.match(/events\/\d+-([^/]+)/);
  return match ? match[1] : null;
}

async function scrapeEventsList(browser) {
  console.log('\n📋 Scraping Gamebred events from Tapology...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(TAPOLOGY_PROMOTION_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 });

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const seenUrls = new Set();
      const eventLinks = document.querySelectorAll('a[href*="/fightcenter/events/"]');

      eventLinks.forEach(link => {
        const eventUrl = link.href;
        const eventName = link.textContent.trim();
        if (!eventUrl || !eventName || eventName.length < 3) return;
        if (seenUrls.has(eventUrl)) return;

        // Tapology promotion pages render a sidebar of cross-promotion events.
        // Filter by slug to keep this scoped to Gamebred only.
        const urlLower = eventUrl.toLowerCase();
        if (!urlLower.includes('gamebred') && !urlLower.includes('gbfc')) return;

        seenUrls.add(eventUrl);

        const container = link.closest('div, li, section, tr') || link.parentElement;
        let dateText = '';
        let venueText = '';

        if (container) {
          const textContent = container.textContent || '';
          const dateMatch = textContent.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?(?:,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*[A-Z]*)?/i);
          if (dateMatch) dateText = dateMatch[0].trim();
          const venueMatch = textContent.match(/(?:•|·|\|)\s*([^•·|\n]+(?:,\s*[A-Z]{2})?)/);
          if (venueMatch) venueText = venueMatch[1].trim();
        }

        extractedEvents.push({
          eventName,
          eventUrl,
          dateText,
          venue: venueText,
          status: 'Upcoming',
        });
      });

      return extractedEvents;
    });

    await page.close();

    const uniqueEvents = [];
    const seenUrls = new Set();
    for (const event of events) {
      if (!seenUrls.has(event.eventUrl)) {
        seenUrls.add(event.eventUrl);
        uniqueEvents.push(event);
      }
    }

    console.log(`✅ Found ${uniqueEvents.length} Gamebred events\n`);
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
      const consentBtn = await page.$('button[aria-label="Consent"], .fc-cta-consent, button.accept-cookies, [data-testid="consent-accept"]');
      if (consentBtn) {
        await consentBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      // Consent banner not present
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
        fights: [],
      };

      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content && ogImage.content.includes('poster_images')) {
        data.eventImageUrl = ogImage.content;
      }
      if (!data.eventImageUrl && eventId) {
        const scopedImg = document.querySelector(`img[src*="poster_images/${eventId}/"]`);
        if (scopedImg && scopedImg.src) data.eventImageUrl = scopedImg.src;
      }

      const eventHeader = document.querySelector('.eventPageHeaderTitles h1, .header h1, #main h1, .content h1')
        || document.querySelector('h1:not([class*="consent"]):not([class*="cookie"]):not([class*="modal"])');
      if (eventHeader) {
        const name = eventHeader.textContent.trim();
        if (name && !name.toLowerCase().includes('consent') && !name.toLowerCase().includes('cookie') && !name.toLowerCase().includes('privacy')) {
          data.eventName = name;
        }
      }
      if (!data.eventName) {
        const titleMatch = document.title.match(/^(.+?)(?:\s*[-|]|\s*\|)/);
        if (titleMatch) data.eventName = titleMatch[1].trim();
      }

      const pageText = document.body.innerText || '';
      const dateMatch = pageText.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
      if (dateMatch) data.dateText = dateMatch[0].trim();

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
          if (dtTimeMatch) data.eventStartTime = dtTimeMatch[1].trim().toUpperCase();
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

      const venueMatch = pageText.match(/(?:Meta APEX|[A-Z][a-zA-Z\s]+(?:Arena|Center|Centre|Garden|Stadium|Hall|Coliseum|Pavilion))\s*[,•·]\s*([^,\n]+)/);
      if (venueMatch) {
        const fullMatch = venueMatch[0];
        const parts = fullMatch.split(/[,•·]/).map(p => p.trim());
        data.venue = parts[0] || '';
        data.city = parts[1] || '';
        data.country = parts.length > 2 ? parts[parts.length - 1] : '';
      }

      const headshots = new Map();
      document.querySelectorAll('img[src*="headshot_images"]').forEach(img => {
        const src = img.src || img.getAttribute('data-src');
        if (!src) return;
        const idMatch = src.match(/headshot_images\/(\d+)\//);
        if (idMatch) headshots.set(idMatch[1], src);
      });

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
        const fighterA = linksInLi[0];
        const fighterB = linksInLi[1];

        const pairKey = [fighterA.url, fighterB.url].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        data.fights.push({
          fightId: `gamebred-fight-${data.fights.length + 1}`,
          order: data.fights.length + 1,
          cardType: data.fights.length === 0 ? 'Main Event' : 'Main Card',
          weightClass: '',
          scheduledRounds: 3,
          isTitle: false,
          fighterA: {
            name: fighterA.name,
            athleteUrl: fighterA.url || '',
            fighterId: fighterA.fighterId,
            imageUrl: fighterA.imageUrl,
            record: '',
            country: '',
          },
          fighterB: {
            name: fighterB.name,
            athleteUrl: fighterB.url || '',
            fighterId: fighterB.fighterId,
            imageUrl: fighterB.imageUrl,
            record: '',
            country: '',
          },
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

async function main() {
  console.log('\n🚀 Starting Gamebred Tapology Scraper\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const discoveredEvents = await scrapeEventsList(browser);

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

      if (eventData.dateText) {
        const parsedDate = parseTapologyDate(eventData.dateText);
        if (parsedDate) eventData.eventDate = parsedDate.toISOString();
      }

      const eventSlug = getEventSlug(discovered.eventUrl) || discovered.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
        fights: eventData.fights,
      };

      allEvents.push(event);

      for (const fight of event.fights) {
        if (!athleteMap.has(fight.fighterA.name)) {
          athleteMap.set(fight.fighterA.name, {
            name: fight.fighterA.name,
            url: fight.fighterA.athleteUrl,
            fighterId: fight.fighterA.fighterId,
            imageUrl: fight.fighterA.imageUrl,
          });
        }
        if (!athleteMap.has(fight.fighterB.name)) {
          athleteMap.set(fight.fighterB.name, {
            name: fight.fighterB.name,
            url: fight.fighterB.athleteUrl,
            fighterId: fight.fighterB.fighterId,
            imageUrl: fight.fighterB.imageUrl,
          });
        }
      }
    }

    const outputDir = path.join(__dirname, '../../scraped-data/gamebred');
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

    const athletes = Array.from(athleteMap.values());
    const athletesPath = path.join(outputDir, 'latest-athletes.json');
    fs.writeFileSync(athletesPath, JSON.stringify({ athletes }, null, 2));

    console.log(`   ✅ ${athletesPath}`);

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

async function runWithTimeout() {
  return Promise.race([
    main(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Scraper timed out after ${OVERALL_TIMEOUT}ms`)), OVERALL_TIMEOUT)
    ),
  ]);
}

if (require.main === module) {
  const startTime = Date.now();
  console.log(`🚀 Starting Gamebred scraper in ${SCRAPER_MODE} mode...`);

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
