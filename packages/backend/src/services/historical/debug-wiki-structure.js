/**
 * Debug Wikipedia page structure
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function debugPage(browser, url, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log(`\nDebug: ${name} (${url})\n`);

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Response status:', response.status());

    // Get page title
    const title = await page.title();
    console.log('Page title:', title);

    // Check for any tables
    const tableCount = await page.evaluate(() => {
      return document.querySelectorAll('table').length;
    });
    console.log('Total tables on page:', tableCount);

    // Get all table classes
    const tableClasses = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      return Array.from(tables).map((t, i) => ({
        index: i,
        className: t.className,
        id: t.id,
        rowCount: t.querySelectorAll('tr').length
      }));
    });
    console.log('\nTable info:');
    for (const t of tableClasses) {
      console.log(`  Table ${t.index}: class="${t.className}" id="${t.id}" rows=${t.rowCount}`);
    }

    // Look for the results section
    const hasResultsSection = await page.evaluate(() => {
      const headings = document.querySelectorAll('h2, h3');
      const resultsHeadings = [];
      for (const h of headings) {
        const text = h.textContent.toLowerCase();
        if (text.includes('result') || text.includes('fight card') || text.includes('bout')) {
          resultsHeadings.push(h.textContent.trim());
        }
      }
      return resultsHeadings;
    });
    console.log('\nResults-related headings:', hasResultsSection);

    // Get HTML sample around any "Results" heading
    const resultsHtml = await page.evaluate(() => {
      const headings = document.querySelectorAll('h2, h3');
      for (const h of headings) {
        if (h.textContent.toLowerCase().includes('result')) {
          // Get next sibling elements
          let html = '';
          let el = h.nextElementSibling;
          let count = 0;
          while (el && count < 3) {
            html += `\n[${el.tagName}]: ${el.outerHTML.substring(0, 500)}...`;
            el = el.nextElementSibling;
            count++;
          }
          return html;
        }
      }
      return 'No results section found';
    });
    console.log('\nHTML after Results heading:', resultsHtml.substring(0, 2000));

    // Save full HTML for inspection
    const html = await page.content();
    fs.writeFileSync(`debug-${name.replace(/\s+/g, '-')}.html`, html);
    console.log(`\nFull HTML saved to debug-${name.replace(/\s+/g, '-')}.html`);

    await page.close();

  } catch (error) {
    console.error(`Error: ${error.message}`);
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    await debugPage(browser, 'https://en.wikipedia.org/wiki/UFC_300', 'UFC 300');
  } finally {
    await browser.close();
  }
}

main();
