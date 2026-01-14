/**
 * Generalized Wikipedia MMA Historical Results Scraper
 *
 * Scrapes historical fight results from Wikipedia for multiple MMA promotions:
 * - UFC (already covered by dedicated scraper)
 * - Bellator
 * - ONE Championship
 * - Pride FC
 * - WEC
 * - Strikeforce
 * - Invicta
 * - PFL
 *
 * Wikipedia uses "toccolours" class tables with structure:
 * - Weight class | Winner | def. | Loser | Method | Round | Time | Notes
 *
 * Output: JSON files with fight outcomes for merging with production DB
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../../../scraped-data/historical');
const DELAY_BETWEEN_PAGES = 1500; // Be respectful to Wikipedia

// Promotion configurations
const PROMOTIONS = {
  bellator: {
    name: 'Bellator',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_Bellator_MMA_events',
    eventPattern: /^Bellator\s+\d+/i,
    linkPattern: /\/wiki\/Bellator_\d+/
  },
  one: {
    name: 'ONE',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_ONE_Championship_events',
    eventPattern: /^ONE\s+(Championship|FC|Fighting|Friday|on|Warrior)/i,
    linkPattern: /\/wiki\/ONE(_|:)/
  },
  pride: {
    name: 'Pride',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_Pride_FC_events',
    eventPattern: /^Pride\s+\d+|^Bushido\s+\d+|^PRIDE|^Pride\s+FC/i,
    linkPattern: /\/wiki\/Pride_\d+|\/wiki\/Bushido_\d+/
  },
  wec: {
    name: 'WEC',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_WEC_events',
    eventPattern: /^WEC\s+\d+/i,
    linkPattern: /\/wiki\/WEC_\d+/
  },
  strikeforce: {
    name: 'Strikeforce',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_Strikeforce_events',
    eventPattern: /^Strikeforce/i,
    linkPattern: /\/wiki\/Strikeforce/
  },
  pfl: {
    name: 'PFL',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_PFL_events',
    eventPattern: /^PFL\s+\d+|^2\d{3}\s+PFL/i,
    linkPattern: /\/wiki\/PFL_\d+|\/wiki\/2\d{3}_PFL/
  },
  invicta: {
    name: 'Invicta',
    listUrl: 'https://en.wikipedia.org/wiki/List_of_Invicta_FC_events',
    eventPattern: /^Invicta\s+FC\s+\d+/i,
    linkPattern: /\/wiki\/Invicta_FC_\d+/
  }
};

/**
 * Parse fight results from a Wikipedia MMA event page
 * Uses same logic as UFC scraper - toccolours tables with def. pattern
 */
async function scrapeEventPage(browser, eventUrl, eventName) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Check if page exists
    const title = await page.title();
    if (title.includes('Search results') || title.includes('does not have an article')) {
      await page.close();
      return null;
    }

    const eventData = await page.evaluate((eventNameParam) => {
      const results = {
        eventName: eventNameParam,
        eventDate: null,
        venue: null,
        location: null,
        fights: []
      };

      // Get event date from infobox
      const infobox = document.querySelector('.infobox');
      if (infobox) {
        const rows = infobox.querySelectorAll('tr');
        for (const row of rows) {
          const header = row.querySelector('th');
          const data = row.querySelector('td');
          if (header && data) {
            const headerText = header.textContent.trim().toLowerCase();
            if (headerText.includes('date')) {
              results.eventDate = data.textContent.trim();
            }
            if (headerText.includes('venue')) {
              results.venue = data.textContent.trim();
            }
            if (headerText.includes('city') || headerText.includes('location')) {
              results.location = data.textContent.trim();
            }
          }
        }
      }

      // Find results tables - toccolours class
      const tables = document.querySelectorAll('table.toccolours');

      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        let currentCardType = 'Main Card';

        for (const row of rows) {
          // Check for card type header
          const headerCell = row.querySelector('th[colspan]');
          if (headerCell) {
            const headerText = headerCell.textContent.trim().toLowerCase();
            if (headerText.includes('main')) currentCardType = 'Main Card';
            else if (headerText.includes('prelim')) currentCardType = 'Prelims';
            else if (headerText.includes('early')) currentCardType = 'Early Prelims';
            else if (headerText.includes('undercard')) currentCardType = 'Undercard';
            continue;
          }

          // Skip column header rows
          const thCells = row.querySelectorAll('th');
          if (thCells.length > 2) continue;

          // Get data cells
          const cells = row.querySelectorAll('td');
          if (cells.length < 5) continue;

          const cellTexts = Array.from(cells).map(c => c.textContent.trim());

          // Find "def." cell
          let defIndex = -1;
          for (let i = 0; i < cellTexts.length; i++) {
            if (cellTexts[i].toLowerCase() === 'def.' || cellTexts[i].toLowerCase() === 'def') {
              defIndex = i;
              break;
            }
          }

          if (defIndex === -1) continue;

          const weightClass = defIndex >= 2 ? cellTexts[0] : null;
          const winner = defIndex >= 1 ? cellTexts[defIndex - 1] : null;
          const loser = defIndex < cellTexts.length - 1 ? cellTexts[defIndex + 1] : null;
          const method = cellTexts[defIndex + 2] || null;
          const round = cellTexts[defIndex + 3] || null;
          const time = cellTexts[defIndex + 4] || null;

          if (!winner || !loser) continue;

          const cleanName = (name) => {
            if (!name) return null;
            return name.replace(/\[\d+\]/g, '').replace(/\(c\)/gi, '').replace(/\s+/g, ' ').trim();
          };

          let roundNum = null;
          if (round) {
            const match = round.match(/\d+/);
            if (match) roundNum = parseInt(match[0]);
          }

          // Normalize method
          let normalizedMethod = method;
          if (method) {
            const methodLower = method.toLowerCase();
            if (methodLower.includes('knockout') || methodLower === 'ko') {
              normalizedMethod = 'KO';
            } else if (methodLower.includes('tko') || methodLower.includes('technical knockout')) {
              normalizedMethod = 'TKO';
            } else if (methodLower.includes('submission')) {
              normalizedMethod = 'Submission';
            } else if (methodLower.includes('decision')) {
              if (methodLower.includes('unanimous')) {
                normalizedMethod = 'Decision (Unanimous)';
              } else if (methodLower.includes('split')) {
                normalizedMethod = 'Decision (Split)';
              } else if (methodLower.includes('majority')) {
                normalizedMethod = 'Decision (Majority)';
              } else {
                normalizedMethod = 'Decision';
              }
            } else if (methodLower.includes('draw')) {
              normalizedMethod = 'Draw';
            } else if (methodLower.includes('no contest') || methodLower === 'nc') {
              normalizedMethod = 'No Contest';
            }
          }

          results.fights.push({
            cardType: currentCardType,
            weightClass: cleanName(weightClass),
            winner: cleanName(winner),
            loser: cleanName(loser),
            method: normalizedMethod ? normalizedMethod.replace(/\[\d+\]/g, '').trim() : null,
            round: roundNum,
            time: time ? time.replace(/\[\d+\]/g, '').trim() : null
          });
        }
      }

      return results;
    }, eventName);

    await page.close();
    return eventData;

  } catch (error) {
    try { await page.close(); } catch (e) {}
    return null;
  }
}

/**
 * Scrape list of events from a promotion's Wikipedia list page
 */
async function scrapeEventsList(browser, config) {
  console.log(`\n📋 Fetching ${config.name} events list from Wikipedia...\n`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(config.listUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const events = await page.evaluate((linkPatternStr) => {
      const eventList = [];
      const seen = new Set();
      const linkPattern = new RegExp(linkPatternStr);

      // Find all tables that might have events
      const tables = document.querySelectorAll('table.wikitable, table.sortable');

      for (const table of tables) {
        const rows = table.querySelectorAll('tr');

        for (const row of rows) {
          const links = row.querySelectorAll('a');

          for (const link of links) {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();

            if (!href || href.includes(':') || href.includes('#')) continue;
            if (!href.startsWith('/wiki/')) continue;

            // Check if this looks like an event link
            if (linkPattern.test(href) && !seen.has(href)) {
              seen.add(href);
              eventList.push({
                name: text.replace(/\[\d+\]/g, '').trim(),
                wikiUrl: `https://en.wikipedia.org${href}`
              });
            }
          }
        }
      }

      // Also check main content links
      const contentLinks = document.querySelectorAll('#mw-content-text a');
      for (const link of contentLinks) {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();

        if (!href || href.includes(':') || href.includes('#')) continue;
        if (!href.startsWith('/wiki/')) continue;

        if (linkPattern.test(href) && !seen.has(href)) {
          seen.add(href);
          eventList.push({
            name: text.replace(/\[\d+\]/g, '').trim(),
            wikiUrl: `https://en.wikipedia.org${href}`
          });
        }
      }

      return eventList;
    }, config.linkPattern.source);

    await page.close();
    console.log(`✅ Found ${events.length} ${config.name} events\n`);
    return events;

  } catch (error) {
    console.error(`Error fetching ${config.name} events list:`, error.message);
    try { await page.close(); } catch (e) {}
    return [];
  }
}

/**
 * Scrape a single promotion
 */
async function scrapePromotion(promotionKey) {
  const config = PROMOTIONS[promotionKey];
  if (!config) {
    console.error(`Unknown promotion: ${promotionKey}`);
    return null;
  }

  console.log(`\n🥊 ${config.name} Wikipedia Historical Results Scraper\n`);
  console.log('='.repeat(60));

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const events = await scrapeEventsList(browser, config);

    if (events.length === 0) {
      console.log(`No events found for ${config.name}`);
      await browser.close();
      return null;
    }

    console.log(`📊 Total events to scrape: ${events.length}\n`);

    const allResults = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`[${i + 1}/${events.length}] ${event.name}`);

      const result = await scrapeEventPage(browser, event.wikiUrl, event.name);

      if (result && result.fights.length > 0) {
        allResults.push(result);
        successCount++;
        console.log(`   ✅ Found ${result.fights.length} fights`);
      } else {
        failCount++;
        console.log(`   ⚠️  No fights found`);
      }

      // Save progress every 25 events
      if ((i + 1) % 25 === 0) {
        const progressFile = path.join(OUTPUT_DIR, `${promotionKey}-progress-${i + 1}.json`);
        fs.writeFileSync(progressFile, JSON.stringify(allResults, null, 2));
        console.log(`\n💾 Progress saved: ${progressFile}\n`);
      }

      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES));
    }

    // Save final results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `${promotionKey}-historical-${timestamp}.json`);

    const output = {
      scrapeDate: new Date().toISOString(),
      promotion: config.name,
      totalEvents: allResults.length,
      totalFights: allResults.reduce((sum, e) => sum + e.fights.length, 0),
      events: allResults
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    const latestFile = path.join(OUTPUT_DIR, `${promotionKey}-historical-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(output, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log(`\n📈 ${config.name} SUMMARY\n`);
    console.log(`   Events scraped successfully: ${successCount}`);
    console.log(`   Events failed/not found: ${failCount}`);
    console.log(`   Total fights extracted: ${output.totalFights}`);
    console.log(`\n   Output file: ${outputFile}`);
    console.log(`\n✅ ${config.name} scraping complete!\n`);

    await browser.close();
    return output;

  } catch (error) {
    console.error(`\n❌ Fatal error for ${config.name}:`, error);
    await browser.close();
    return null;
  }
}

/**
 * Scrape all promotions
 */
async function scrapeAll() {
  console.log('\n🥊 Wikipedia MMA Historical Results Scraper - All Promotions\n');
  console.log('='.repeat(60));

  const results = {};

  for (const promotionKey of Object.keys(PROMOTIONS)) {
    try {
      const result = await scrapePromotion(promotionKey);
      if (result) {
        results[promotionKey] = {
          events: result.totalEvents,
          fights: result.totalFights
        };
      }
    } catch (error) {
      console.error(`Error scraping ${promotionKey}:`, error.message);
    }
  }

  // Save combined summary
  const summaryFile = path.join(OUTPUT_DIR, 'mma-historical-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify({
    scrapeDate: new Date().toISOString(),
    promotions: results
  }, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('\n📈 OVERALL SUMMARY\n');
  for (const [key, stats] of Object.entries(results)) {
    console.log(`   ${PROMOTIONS[key].name}: ${stats.events} events, ${stats.fights} fights`);
  }
  console.log(`\n✅ All promotions complete!\n`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const promotion = args[0];

  if (promotion === 'all') {
    scrapeAll().catch(console.error);
  } else if (promotion && PROMOTIONS[promotion]) {
    scrapePromotion(promotion).catch(console.error);
  } else {
    console.log('Usage: node scrapeWikipediaMMA.js <promotion|all>');
    console.log('\nAvailable promotions:');
    for (const key of Object.keys(PROMOTIONS)) {
      console.log(`  - ${key}`);
    }
    console.log('  - all (scrape all promotions)');
  }
}

module.exports = { scrapePromotion, scrapeAll, scrapeEventPage, PROMOTIONS };
