/**
 * Wikipedia BKFC Historical Results Scraper
 *
 * BKFC uses a different Wikipedia structure than other MMA promotions:
 * - Instead of individual event pages, fights are listed on YEAR pages
 * - e.g., "2024_in_Bare_Knuckle_Fighting_Championship"
 * - Each year page contains multiple events with wikitable results
 *
 * Output: JSON files with fight outcomes for merging with production DB
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../../../scraped-data/historical');
const DELAY_BETWEEN_PAGES = 2000;

// Year pages to scrape (2018 was first BKFC event)
const YEAR_PAGES = [
  { year: 2018, url: 'https://en.wikipedia.org/wiki/2018_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2019, url: 'https://en.wikipedia.org/wiki/2019_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2020, url: 'https://en.wikipedia.org/wiki/2020_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2021, url: 'https://en.wikipedia.org/wiki/2021_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2022, url: 'https://en.wikipedia.org/wiki/2022_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2023, url: 'https://en.wikipedia.org/wiki/2023_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2024, url: 'https://en.wikipedia.org/wiki/2024_in_Bare_Knuckle_Fighting_Championship' },
  { year: 2025, url: 'https://en.wikipedia.org/wiki/2025_in_Bare_Knuckle_Fighting_Championship' }
];

/**
 * Scrape a BKFC year page - contains multiple events
 */
async function scrapeYearPage(browser, yearUrl, year) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    console.log(`   Fetching: ${yearUrl}`);

    await page.goto(yearUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const title = await page.title();
    if (title.includes('does not have an article')) {
      console.log(`   ⚠️  Page not found for year ${year}`);
      await page.close();
      return [];
    }

    // Extract all events and fights from the year page
    const events = await page.evaluate((yearParam) => {
      const results = [];

      // Find all infobox tables (event headers) and wikitable tables (fight results)
      // They appear in pairs: infobox with event name, then wikitable with fights
      const allTables = document.querySelectorAll('table');
      let currentEventName = null;
      let currentEventDate = null;

      for (let i = 0; i < allTables.length; i++) {
        const table = allTables[i];

        // Check if this is an infobox (event header)
        if (table.className.includes('infobox')) {
          // Extract event name from infobox header
          const header = table.querySelector('th');
          if (header) {
            currentEventName = header.textContent.trim().replace(/\[\d+\]/g, '');
          }

          // Try to extract date from infobox
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            if (th && td && th.textContent.toLowerCase().includes('date')) {
              currentEventDate = td.textContent.trim();
              break;
            }
          }
          continue;
        }

        // Check if this is a wikitable (fight results)
        if (table.className.includes('wikitable') && currentEventName) {
          const fights = [];
          const rows = table.querySelectorAll('tr');

          for (let j = 1; j < rows.length; j++) { // Skip header row
            const row = rows[j];
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) continue;

            const cellTexts = Array.from(cells).map(c => c.textContent.trim());

            // Find "def." cell to identify fight row
            let defIndex = -1;
            for (let k = 0; k < cellTexts.length; k++) {
              if (cellTexts[k].toLowerCase() === 'def.' || cellTexts[k].toLowerCase() === 'def') {
                defIndex = k;
                break;
              }
            }

            if (defIndex === -1) continue;

            // Parse fight data
            // Structure varies but typically: Weight | Winner | def. | Loser | Method | Round | Time
            const weightClass = defIndex >= 2 ? cellTexts[0] : null;
            const winner = defIndex >= 1 ? cellTexts[defIndex - 1] : null;
            const loser = defIndex < cellTexts.length - 1 ? cellTexts[defIndex + 1] : null;
            const method = cellTexts[defIndex + 2] || null;
            const round = cellTexts[defIndex + 3] || null;
            const time = cellTexts[defIndex + 4] || null;

            if (!winner || !loser) continue;

            // Clean names
            const cleanName = (name) => {
              if (!name) return null;
              return name.replace(/\[\d+\]/g, '').replace(/\(c\)/gi, '').replace(/\s+/g, ' ').trim();
            };

            // Parse round number
            let roundNum = null;
            if (round) {
              const match = round.match(/\d+/);
              if (match) roundNum = parseInt(match[0]);
            }

            // Normalize method for bare-knuckle boxing
            let normalizedMethod = method;
            if (method) {
              const methodLower = method.toLowerCase();
              if (methodLower.includes('knockout') || methodLower === 'ko') {
                normalizedMethod = 'KO';
              } else if (methodLower.includes('tko') || methodLower.includes('technical')) {
                normalizedMethod = 'TKO';
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
              } else if (methodLower.includes('disqualification') || methodLower.includes('dq')) {
                normalizedMethod = 'DQ';
              }
            }

            fights.push({
              weightClass: cleanName(weightClass),
              winner: cleanName(winner),
              loser: cleanName(loser),
              method: normalizedMethod ? normalizedMethod.replace(/\[\d+\]/g, '').trim() : null,
              round: roundNum,
              time: time ? time.replace(/\[\d+\]/g, '').trim() : null
            });
          }

          if (fights.length > 0) {
            results.push({
              eventName: currentEventName,
              eventDate: currentEventDate,
              year: yearParam,
              fights
            });
          }

          // Reset for next event
          currentEventName = null;
          currentEventDate = null;
        }
      }

      return results;
    }, year);

    await page.close();

    const totalFights = events.reduce((sum, e) => sum + e.fights.length, 0);
    console.log(`   ✅ Found ${events.length} events, ${totalFights} fights`);

    return events;

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    try { await page.close(); } catch (e) {}
    return [];
  }
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('\n🥊 BKFC Wikipedia Historical Results Scraper\n');
  console.log('='.repeat(60));
  console.log('Note: BKFC uses year-based Wikipedia pages instead of event pages\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const allEvents = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < YEAR_PAGES.length; i++) {
      const yearPage = YEAR_PAGES[i];
      console.log(`[${i + 1}/${YEAR_PAGES.length}] Year ${yearPage.year}`);

      const events = await scrapeYearPage(browser, yearPage.url, yearPage.year);

      if (events.length > 0) {
        allEvents.push(...events);
        successCount++;
      } else {
        failCount++;
      }

      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES));
    }

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(OUTPUT_DIR, `bkfc-historical-${timestamp}.json`);

    const output = {
      scrapeDate: new Date().toISOString(),
      promotion: 'BKFC',
      totalEvents: allEvents.length,
      totalFights: allEvents.reduce((sum, e) => sum + e.fights.length, 0),
      events: allEvents
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    const latestFile = path.join(OUTPUT_DIR, 'bkfc-historical-latest.json');
    fs.writeFileSync(latestFile, JSON.stringify(output, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('\n📈 BKFC SUMMARY\n');
    console.log(`   Years scraped: ${successCount} (${failCount} failed/not found)`);
    console.log(`   Total events: ${output.totalEvents}`);
    console.log(`   Total fights: ${output.totalFights}`);
    console.log(`\n   Output file: ${outputFile}`);
    console.log('\n✅ BKFC scraping complete!\n');

    return output;

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    return null;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, scrapeYearPage };
