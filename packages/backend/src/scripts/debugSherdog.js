#!/usr/bin/env node
const puppeteer = require('puppeteer');

async function debugSherdog() {
  console.log('=== Debugging Sherdog News Structure ===\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
  });

  try {
    const page = await browser.newPage();

    console.log('Navigating to Sherdog News...');
    await page.goto('https://www.sherdog.com/news/news/list', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('✓ Page loaded\n');

    // Don't wait for specific selector, just analyze what's on the page
    await new Promise(resolve => setTimeout(resolve, 3000));

    const structure = await page.evaluate(() => {
      const result = {
        articleCount: 0,
        samples: []
      };

      // Try multiple selectors
      const selectors = ['article', '.article', '.news-item', '.item', '[class*="news"]'];
      let articles = [];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          articles = Array.from(elements);
          break;
        }
      }

      result.articleCount = articles.length;

      // Get first 3 articles for analysis
      articles.slice(0, 3).forEach((article, idx) => {
        const sample = {
          index: idx,
          html: article.outerHTML.substring(0, 500),
          classes: Array.from(article.classList),
          links: [],
          images: [],
          text: article.textContent?.substring(0, 150).trim()
        };

        // Find links
        const links = article.querySelectorAll('a');
        links.forEach(link => {
          sample.links.push({
            href: link.href,
            text: link.textContent?.trim().substring(0, 80)
          });
        });

        // Find images
        const images = article.querySelectorAll('img');
        images.forEach(img => {
          sample.images.push({
            src: img.src?.substring(0, 150),
            alt: img.alt
          });
        });

        result.samples.push(sample);
      });

      return result;
    });

    console.log(`Found ${structure.articleCount} articles\n`);

    structure.samples.forEach(sample => {
      console.log(`${'='.repeat(80)}`);
      console.log(`ARTICLE ${sample.index}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`Classes: ${sample.classes.join(', ')}`);
      console.log(`Text: ${sample.text}\n`);

      console.log('Links:');
      sample.links.forEach((link, i) => {
        console.log(`  ${i + 1}. ${link.href}`);
        console.log(`     Text: ${link.text}\n`);
      });

      console.log('Images:');
      sample.images.forEach((img, i) => {
        console.log(`  ${i + 1}. ${img.src}`);
        console.log(`     Alt: ${img.alt}\n`);
      });

      console.log(`HTML Preview:\n${sample.html}\n`);
    });

  } catch (error) {
    console.error('Error during debugging:', error);
  } finally {
    await browser.close();
  }
}

debugSherdog();
