/**
 * Wikipedia UFC Historical Results Scraper
 *
 * Scrapes historical fight results from Wikipedia UFC event pages.
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

/**
 * Generate list of UFC events to scrape (numbered events)
 */
function generateUFCEventList() {
  const events = [];

  // Numbered events: UFC 1 through UFC 310
  for (let i = 1; i <= 310; i++) {
    events.push({
      name: `UFC ${i}`,
      wikiUrl: `https://en.wikipedia.org/wiki/UFC_${i}`
    });
  }

  return events;
}

/**
 * Parse a single Wikipedia UFC event page
 */
async function scrapeUFCEventPage(browser, eventUrl, eventName) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log(`   Fetching: ${eventUrl}`);

    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Check if page exists
    const title = await page.title();
    if (title.includes('Search results') || title.includes('does not have an article') || title.includes('Wikipedia does not have')) {
      console.log(`   ⚠️  Page not found: ${eventName}`);
      await page.close();
      return null;
    }

    // Extract fight results from the page
    const eventData = await page.evaluate((eventNameParam) => {
      const results = {
        eventName: eventNameParam,
        eventDate: null,
        venue: null,
        location: null,
        fights: []
      };

      // Try to get event date from infobox
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

      // Find results tables - they use "toccolours" class on Wikipedia
      // Structure: Weight class | Winner | def. | Loser | Method | Round | Time | Notes
      const tables = document.querySelectorAll('table.toccolours');

      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        let currentCardType = 'Main Card';

        for (const row of rows) {
          // Check for card type header (Main card, Prelims, etc.)
          const headerCell = row.querySelector('th[colspan]');
          if (headerCell) {
            const headerText = headerCell.textContent.trim().toLowerCase();
            if (headerText.includes('main')) {
              currentCardType = 'Main Card';
            } else if (headerText.includes('prelim')) {
              currentCardType = 'Prelims';
            } else if (headerText.includes('early')) {
              currentCardType = 'Early Prelims';
            }
            continue;
          }

          // Check if this is a column header row
          const thCells = row.querySelectorAll('th');
          if (thCells.length > 2) {
            continue; // Skip header rows
          }

          // Get data cells
          const cells = row.querySelectorAll('td');
          if (cells.length < 5) continue;

          // Expected structure: Weight | Winner | def. | Loser | Method | Round | Time | [Notes]
          const cellTexts = Array.from(cells).map(c => c.textContent.trim());

          // Find the "def." cell to understand structure
          let defIndex = -1;
          for (let i = 0; i < cellTexts.length; i++) {
            if (cellTexts[i].toLowerCase() === 'def.' || cellTexts[i].toLowerCase() === 'def') {
              defIndex = i;
              break;
            }
          }

          if (defIndex === -1) continue; // Not a fight row

          // Parse based on "def." position
          // Typically: [0]=Weight, [1]=Winner, [2]=def., [3]=Loser, [4]=Method, [5]=Round, [6]=Time, [7]=Notes
          const weightClass = defIndex >= 1 ? cellTexts[defIndex - 2] || cellTexts[0] : cellTexts[0];
          const winner = defIndex >= 1 ? cellTexts[defIndex - 1] : null;
          const loser = defIndex < cellTexts.length - 1 ? cellTexts[defIndex + 1] : null;
          const method = cellTexts[defIndex + 2] || null;
          const round = cellTexts[defIndex + 3] || null;
          const time = cellTexts[defIndex + 4] || null;
          const notes = cellTexts[defIndex + 5] || null;

          if (!winner || !loser) continue;

          // Clean up names - remove (c), [1], etc.
          const cleanName = (name) => {
            if (!name) return null;
            return name
              .replace(/\[\d+\]/g, '')
              .replace(/\(c\)/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
          };

          // Parse round number
          let roundNum = null;
          if (round) {
            const match = round.match(/\d+/);
            if (match) {
              roundNum = parseInt(match[0]);
            }
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
            method: normalizedMethod,
            round: roundNum,
            time: time ? time.replace(/\[\d+\]/g, '').trim() : null,
            notes: notes ? notes.replace(/\[\d+\]/g, '').trim() : null
          });
        }
      }

      return results;
    }, eventName);

    await page.close();

    if (eventData.fights.length > 0) {
      console.log(`   ✅ Found ${eventData.fights.length} fights`);
    } else {
      console.log(`   ⚠️  No fights found`);
    }

    return eventData;

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    try {
      await page.close();
    } catch (e) {}
    return null;
  }
}

/**
 * Scrape the main UFC events list page to get all event URLs including Fight Nights
 */
async function scrapeUFCEventsList(browser) {
  console.log('\n📋 Fetching UFC events list from Wikipedia...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto('https://en.wikipedia.org/wiki/List_of_UFC_events', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const events = await page.evaluate(() => {
      const eventList = [];
      const seen = new Set();

      // Find all links that look like UFC event pages
      const links = document.querySelectorAll('a[href*="/wiki/UFC_"]');

      for (const link of links) {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();

        if (!href || href.includes(':') || href.includes('#')) continue;

        // Match various UFC event patterns
        const isUFCEvent =
          text.match(/^UFC\s+\d+/i) ||
          text.match(/^UFC\s+Fight\s+Night/i) ||
          text.match(/^UFC\s+on\s+/i) ||
          text.match(/^The\s+Ultimate\s+Fighter.*Finale/i);

        if (isUFCEvent && !seen.has(href)) {
          seen.add(href);
          const fullUrl = `https://en.wikipedia.org${href}`;
          eventList.push({
            name: text.replace(/\[\d+\]/g, '').trim(),
            wikiUrl: fullUrl
          });
        }
      }

      return eventList;
    });

    await page.close();
    console.log(`✅ Found ${events.length} UFC events from list page\n`);
    return events;

  } catch (error) {
    console.error('Error fetching events list:', error.message);
    try {
      await page.close();
    } catch (e) {}
    return [];
  }
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('\n🥊 UFC Wikipedia Historical Results Scraper\n');
  console.log('='.repeat(60));

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Get list of all UFC events from the list page
    const listEvents = await scrapeUFCEventsList(browser);

    // Also generate numbered events to ensure we don't miss any
    const numberedEvents = generateUFCEventList();

    // Merge lists (avoid duplicates by URL)
    const eventMap = new Map();
    for (const e of listEvents) {
      eventMap.set(e.wikiUrl, e);
    }
    for (const e of numberedEvents) {
      if (!eventMap.has(e.wikiUrl)) {
        eventMap.set(e.wikiUrl, e);
      }
    }

    const events = Array.from(eventMap.values());
    console.log(`📊 Total events to scrape: ${events.length}\n`);

    // Scrape each event
    const allResults = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`[${i + 1}/${events.length}] ${event.name}`);

      const result = await scrapeUFCEventPage(browser, event.wikiUrl, event.name);

      if (result && result.fights.length > 0) {
        allResults.push(result);
        successCount++;
      } else {
        failCount++;
      }

      // Save progress every 50 events
      if ((i + 1) % 50 === 0) {
        const progressFile = path.join(OUTPUT_DIR, `ufc-progress-${i + 1}.json`);
        fs.writeFileSync(progressFile, JSON.stringify(allResults, null, 2));
        console.log(`\n💾 Progress saved: ${progressFile}\n`);
      }

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES));
    }

    // Save final results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `ufc-historical-${timestamp}.json`);

    const output = {
      scrapeDate: new Date().toISOString(),
      promotion: 'UFC',
      totalEvents: allResults.length,
      totalFights: allResults.reduce((sum, e) => sum + e.fights.length, 0),
      events: allResults
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    // Also save as latest
    const latestFile = path.join(OUTPUT_DIR, 'ufc-historical-latest.json');
    fs.writeFileSync(latestFile, JSON.stringify(output, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');
    console.log(`   Events scraped successfully: ${successCount}`);
    console.log(`   Events failed/not found: ${failCount}`);
    console.log(`   Total fights extracted: ${output.totalFights}`);
    console.log(`\n   Output file: ${outputFile}`);
    console.log(`   Latest file: ${latestFile}`);
    console.log('\n✅ UFC scraping complete!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, scrapeUFCEventPage, scrapeUFCEventsList };
