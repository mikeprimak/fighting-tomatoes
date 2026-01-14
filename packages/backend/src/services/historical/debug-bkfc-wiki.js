/**
 * Debug BKFC Wikipedia structure
 */

const puppeteer = require('puppeteer');

async function debugBKFC() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    console.log('Fetching BKFC main page...\n');

    await page.goto('https://en.wikipedia.org/wiki/Bare_Knuckle_Fighting_Championship', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Find all links that might be year pages or event pages
    const links = await page.evaluate(() => {
      const results = [];
      const allLinks = document.querySelectorAll('a[href*="/wiki/"]');

      for (const link of allLinks) {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();

        // Look for BKFC-related links
        if (href && (
          href.includes('BKFC') ||
          href.includes('Bare_Knuckle') ||
          text.match(/^20\d{2}/) || // Year pages like "2024 in..."
          text.match(/BKFC\s*\d+/i)
        )) {
          results.push({ href, text });
        }
      }

      return results;
    });

    console.log('Found BKFC-related links:\n');
    for (const link of links.slice(0, 30)) {
      console.log(`  ${link.text} -> ${link.href}`);
    }

    // Now let's check one of the year pages
    console.log('\n\nChecking 2024 BKFC page structure...\n');

    await page.goto('https://en.wikipedia.org/wiki/2024_in_Bare_Knuckle_Fighting_Championship', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const tableInfo = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const info = [];

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const headerRow = table.querySelector('tr');
        const headers = headerRow ? Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim()) : [];
        const rowCount = table.querySelectorAll('tr').length;

        // Get first data row sample
        const dataRows = table.querySelectorAll('tr');
        let sampleRow = [];
        if (dataRows.length > 1) {
          const cells = dataRows[1].querySelectorAll('td');
          sampleRow = Array.from(cells).map(c => c.textContent.trim().substring(0, 40));
        }

        if (headers.length > 0 || rowCount > 2) {
          info.push({
            index: i,
            className: table.className,
            headers,
            rowCount,
            sampleRow
          });
        }
      }

      return info;
    });

    console.log('Tables found on 2024 page:\n');
    for (const t of tableInfo) {
      console.log(`Table ${t.index}: ${t.rowCount} rows`);
      console.log(`  Class: ${t.className}`);
      console.log(`  Headers: ${t.headers.join(' | ')}`);
      if (t.sampleRow.length > 0) {
        console.log(`  Sample: ${t.sampleRow.join(' | ')}`);
      }
      console.log('');
    }

    // Get year page links
    console.log('\n\nLooking for all year pages...\n');

    await page.goto('https://en.wikipedia.org/wiki/Bare_Knuckle_Fighting_Championship', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const yearLinks = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="in_Bare_Knuckle"]');

      for (const link of links) {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();
        if (href && !results.some(r => r.href === href)) {
          results.push({
            href: `https://en.wikipedia.org${href}`,
            text
          });
        }
      }

      return results;
    });

    console.log('Year pages found:\n');
    for (const link of yearLinks) {
      console.log(`  ${link.text} -> ${link.href}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugBKFC();
