/**
 * Test UFC Wikipedia scraper on a few events
 */

const puppeteer = require('puppeteer');

async function testSingleEvent(browser, url, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${name}`);
    console.log(`URL: ${url}`);
    console.log('='.repeat(60));

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Extract fights using the corrected logic
    const result = await page.evaluate((eventNameParam) => {
      const results = {
        eventName: eventNameParam,
        eventDate: null,
        fights: []
      };

      // Get date from infobox
      const infobox = document.querySelector('.infobox');
      if (infobox) {
        const rows = infobox.querySelectorAll('tr');
        for (const row of rows) {
          const header = row.querySelector('th');
          const data = row.querySelector('td');
          if (header && data && header.textContent.toLowerCase().includes('date')) {
            results.eventDate = data.textContent.trim();
            break;
          }
        }
      }

      // Find results tables with "toccolours" class
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

          // Parse: [0]=Weight, [1]=Winner, [2]=def., [3]=Loser, [4]=Method, [5]=Round, [6]=Time
          const weightClass = defIndex >= 2 ? cellTexts[0] : null;
          const winner = defIndex >= 1 ? cellTexts[defIndex - 1] : null;
          const loser = defIndex < cellTexts.length - 1 ? cellTexts[defIndex + 1] : null;
          const method = cellTexts[defIndex + 2] || null;
          const round = cellTexts[defIndex + 3] || null;
          const time = cellTexts[defIndex + 4] || null;

          if (!winner || !loser) continue;

          // Clean up names
          const cleanName = (name) => {
            if (!name) return null;
            return name.replace(/\[\d+\]/g, '').replace(/\(c\)/gi, '').replace(/\s+/g, ' ').trim();
          };

          results.fights.push({
            cardType: currentCardType,
            weightClass: cleanName(weightClass),
            winner: cleanName(winner),
            loser: cleanName(loser),
            method: method ? method.replace(/\[\d+\]/g, '').trim() : null,
            round: round ? round.replace(/\[\d+\]/g, '').trim() : null,
            time: time ? time.replace(/\[\d+\]/g, '').trim() : null
          });
        }
      }

      return results;
    }, name);

    console.log(`\nEvent Date: ${result.eventDate}`);
    console.log(`Fights Found: ${result.fights.length}\n`);

    if (result.fights.length > 0) {
      console.log('Fights:');
      for (const f of result.fights) {
        console.log(`  [${f.cardType}] ${f.winner} def. ${f.loser}`);
        console.log(`    Method: ${f.method} | Round: ${f.round} | Time: ${f.time}`);
      }
    }

    await page.close();
    return result;

  } catch (error) {
    console.error(`Error: ${error.message}`);
    await page.close();
    return null;
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    // Test a few different events
    await testSingleEvent(browser, 'https://en.wikipedia.org/wiki/UFC_1', 'UFC 1');
    await testSingleEvent(browser, 'https://en.wikipedia.org/wiki/UFC_100', 'UFC 100');
    await testSingleEvent(browser, 'https://en.wikipedia.org/wiki/UFC_300', 'UFC 300');

  } finally {
    await browser.close();
  }
}

main();
