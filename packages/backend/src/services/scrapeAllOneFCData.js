/**
 * Master orchestrator for scraping all ONE FC data
 *
 * This script:
 * 1. Scrapes onefc.com/events for upcoming events
 * 2. Scrapes each event page for fight cards
 * 3. Scrapes each unique athlete page for details
 * 4. Downloads event banners and athlete images
 * 5. Saves all data in structured JSON format
 *
 * Configuration via environment variables:
 * - SCRAPER_MODE: 'manual' (default) or 'automated' (faster, for cron jobs)
 * - SCRAPER_TIMEOUT: Overall timeout in milliseconds (default: 600000 = 10min)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration based on mode
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '1500000', 10); // 25 minutes default

// Delays in milliseconds
const DELAYS = {
  manual: {
    betweenEvents: 1000,
    betweenAthletes: 500,
    betweenImages: 400,
  },
  automated: {
    betweenEvents: 300,
    betweenAthletes: 200,
    betweenImages: 100,
  }
};

const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

// ========================================
// STEP 1: Scrape Events List
// ========================================
async function scrapeEventsList(browser) {
  console.log('\n📋 STEP 1: Scraping upcoming events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto('https://www.onefc.com/events', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForSelector('.simple-post-card.is-event, .box-post-event', { timeout: 10000 });

  const events = await page.evaluate(() => {
    const eventCards = document.querySelectorAll('.simple-post-card.is-event, .box-post-event');
    const extractedEvents = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    eventCards.forEach((card) => {
      const link = card.querySelector('a');
      if (!link) return;

      const eventUrl = link.href;

      // Get title
      const titleEl = card.querySelector('.title, h3, h2');
      const eventName = titleEl ? titleEl.textContent.trim() : '';

      // Get datetime
      const datetimeEl = card.querySelector('.datetime, .event-datetime, [data-timestamp]');
      const dateText = datetimeEl ? datetimeEl.textContent.trim() : '';
      const timestamp = datetimeEl ? datetimeEl.getAttribute('data-timestamp') : '';

      // Parse timestamp to filter past events
      let eventDate = null;
      if (timestamp) {
        eventDate = new Date(parseInt(timestamp, 10) * 1000);
        eventDate.setHours(0, 0, 0, 0);

        // Skip past events
        if (eventDate < now) {
          return;
        }
      }

      // Get location
      const locationEl = card.querySelector('.location, .event-location');
      const locationText = locationEl ? locationEl.textContent.trim() : '';

      // Parse location into venue and city
      let venue = '';
      let city = '';
      let country = '';

      if (locationText) {
        // Format: "Lumpinee Stadium, Bangkok" or "Impact Arena, Bangkok, Thailand"
        const parts = locationText.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          venue = parts[0];
          city = parts[1];
          country = parts.length > 2 ? parts[2] : '';
        }
      }

      // Get image
      const imageEl = card.querySelector('img');
      const eventImageUrl = imageEl ? (imageEl.src || imageEl.getAttribute('data-src')) : null;

      extractedEvents.push({
        eventName,
        eventUrl,
        dateText,
        timestamp,
        venue,
        city,
        country,
        eventImageUrl,
        status: 'Upcoming'
      });
    });

    return extractedEvents;
  });

  await page.close();

  console.log(`✅ Found ${events.length} upcoming events\n`);
  return events;
}

// ========================================
// STEP 2: Scrape Individual Event Pages
// ========================================
async function scrapeEventPage(browser, eventUrl, eventName) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const eventData = await page.evaluate(() => {
      // Extract event image (try multiple selectors)
      let eventImageUrl = null;
      const imageSelectors = [
        '.event-banner img',
        '.hero img',
        'picture img',
        '.featured-image img',
        'img.event-image'
      ];

      for (const selector of imageSelectors) {
        const imgEl = document.querySelector(selector);
        if (imgEl && imgEl.src) {
          eventImageUrl = imgEl.src;
          break;
        }
      }

      // Extract fight card
      const matchupElements = document.querySelectorAll('.event-matchup');
      const allFights = [];
      let globalOrder = 1;

      matchupElements.forEach((matchup) => {
        // Get title (weight class and championship info)
        const titleEl = matchup.querySelector('.title');
        let weightClass = titleEl ? titleEl.textContent.trim() : '';
        const isTitle = weightClass.toLowerCase().includes('championship') ||
                        weightClass.toLowerCase().includes('world title');

        // Remove "Championship" from weight class if present
        weightClass = weightClass.replace(/\s*(MMA|Muay Thai|Kickboxing|Submission Grappling)\s*World\s*Championship/gi, '$1');
        weightClass = weightClass.replace(/\s*World\s*Championship/gi, '').trim();

        // Get versus text (e.g., "Andrade vs. Baatarkhuu")
        const versusEl = matchup.querySelector('.versus');
        const versusText = versusEl ? versusEl.textContent.trim() : '';

        // Parse fighter names from versus text
        let fighterA = { name: '', athleteUrl: '' };
        let fighterB = { name: '', athleteUrl: '' };

        if (versusText) {
          const vsMatch = versusText.match(/(.+?)\s+vs\.?\s+(.+)/i);
          if (vsMatch) {
            fighterA.name = vsMatch[1].trim();
            fighterB.name = vsMatch[2].trim();
          }
        }

        // Get athlete URLs and images from face links
        const face1 = matchup.querySelector('a.face.face1');
        const face2 = matchup.querySelector('a.face.face2');

        if (face1) {
          fighterA.athleteUrl = face1.href || '';
          const img1 = face1.querySelector('img');
          fighterA.imageUrl = img1 ? (img1.src || img1.getAttribute('data-src')) : null;
        }

        if (face2) {
          fighterB.athleteUrl = face2.href || '';
          const img2 = face2.querySelector('img');
          fighterB.imageUrl = img2 ? (img2.src || img2.getAttribute('data-src')) : null;
        }

        // Check for championship belt sticker
        const stickers = matchup.querySelectorAll('.sticker');
        // If one fighter has a belt sticker, they're the champion
        // This is indicated by additional classes on the sticker element

        const fightData = {
          fightId: `onefc-fight-${globalOrder}`,
          order: globalOrder++,
          cardType: 'Main Card', // ONE FC doesn't typically split into prelims
          weightClass,
          isTitle,
          fighterA: {
            name: fighterA.name,
            athleteUrl: fighterA.athleteUrl,
            imageUrl: fighterA.imageUrl,
            rank: '', // ONE FC doesn't show ranks on event pages
            country: '',
            odds: ''
          },
          fighterB: {
            name: fighterB.name,
            athleteUrl: fighterB.athleteUrl,
            imageUrl: fighterB.imageUrl,
            rank: '',
            country: '',
            odds: ''
          }
        };

        allFights.push(fightData);
      });

      return {
        eventImageUrl,
        fights: allFights
      };
    });

    await page.close();
    console.log(`   ✅ Scraped ${eventData.fights?.length || 0} fights`);
    return eventData;

  } catch (error) {
    await page.close();
    console.log(`   ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

// ========================================
// STEP 3: Scrape Athlete Pages
// ========================================
async function scrapeAthletePage(browser, athleteUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(athleteUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const athleteData = await page.evaluate(() => {
      // Get athlete's record
      let record = null;
      const recordEl = document.querySelector('.record, .athlete-record, [class*="record"]');
      if (recordEl) {
        const recordText = recordEl.textContent.trim();
        // ONE FC format might be "10-2-0" or "10W-2L-0D"
        const recordMatch = recordText.match(/(\d+)[W-]*\s*-?\s*(\d+)[L-]*\s*-?\s*(\d+)[D-]*/i);
        if (recordMatch) {
          record = `${recordMatch[1]}-${recordMatch[2]}-${recordMatch[3]}`;
        }
      }

      // Get headshot/profile image
      let headshotUrl = null;
      const imageSelectors = [
        '.athlete-image img',
        '.hero-profile img',
        '.profile-image img',
        'img.athlete-headshot'
      ];

      for (const selector of imageSelectors) {
        const imgEl = document.querySelector(selector);
        if (imgEl && imgEl.src) {
          headshotUrl = imgEl.src;
          break;
        }
      }

      return {
        record,
        headshotUrl
      };
    });

    await page.close();
    return athleteData;

  } catch (error) {
    await page.close();
    return { error: error.message };
  }
}

// ========================================
// STEP 4: Download Images
// ========================================
async function downloadImage(browser, url, filepath, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let page = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      page = await browser.newPage();

      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      if (response && response.ok()) {
        const buffer = await response.buffer();
        fs.writeFileSync(filepath, buffer);

        await new Promise(resolve => setTimeout(resolve, 300));

        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }

        return filepath;
      } else {
        throw new Error(`Failed to download: ${response ? response.status() : 'No response'}`);
      }
    } catch (error) {
      lastError = error;

      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }

      if (attempt < retries) {
        const backoffDelay = attempt * 500;
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError || new Error('Download failed after all retries');
}

// ========================================
// MAIN ORCHESTRATOR
// ========================================
async function main() {
  console.log('\n🚀 Starting ONE FC Data Scraping Orchestrator\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // STEP 1: Get events list
    const events = await scrapeEventsList(browser);

    // STEP 2: Scrape each event
    console.log('\n📊 STEP 2: Scraping individual event pages...\n');
    const allEventData = [];
    const uniqueAthletes = new Map(); // athleteUrl -> athlete data

    for (const event of events) {
      console.log(`📄 ${event.eventName}`);
      const eventData = await scrapeEventPage(browser, event.eventUrl, event.eventName);

      const completeEventData = {
        ...event,
        ...eventData
      };

      allEventData.push(completeEventData);

      // Collect unique athletes
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          if (fight.fighterA.athleteUrl && !uniqueAthletes.has(fight.fighterA.athleteUrl)) {
            uniqueAthletes.set(fight.fighterA.athleteUrl, {
              name: fight.fighterA.name,
              url: fight.fighterA.athleteUrl,
              imageUrl: fight.fighterA.imageUrl
            });
          }
          if (fight.fighterB.athleteUrl && !uniqueAthletes.has(fight.fighterB.athleteUrl)) {
            uniqueAthletes.set(fight.fighterB.athleteUrl, {
              name: fight.fighterB.name,
              url: fight.fighterB.athleteUrl,
              imageUrl: fight.fighterB.imageUrl
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Scrape athlete pages
    console.log(`\n\n👤 STEP 3: Scraping ${uniqueAthletes.size} unique athlete pages...\n`);
    let athleteCount = 0;

    for (const [url, athlete] of uniqueAthletes) {
      athleteCount++;
      console.log(`   ${athleteCount}/${uniqueAthletes.size} ${athlete.name}`);
      const athleteData = await scrapeAthletePage(browser, url);
      uniqueAthletes.set(url, { ...athlete, ...athleteData });

      await new Promise(resolve => setTimeout(resolve, delays.betweenAthletes));
    }

    // STEP 4: Download images
    console.log('\n\n🖼️  STEP 4: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/onefc');
    const athleteImagesDir = path.join(imagesDir, 'athletes/onefc');

    // Create directories
    [imagesDir, eventImagesDir, athleteImagesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Download event banners
    console.log('   Event banners:');
    for (const event of allEventData) {
      if (event.eventImageUrl) {
        const filename = `${event.eventUrl.split('/').filter(Boolean).pop()}.jpg`;
        const filepath = path.join(eventImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, event.eventImageUrl, filepath);
            event.localImagePath = `/images/events/onefc/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/onefc/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete images
    console.log('\n   Athlete images:');
    let downloadCount = 0;
    let currentCount = 0;
    const totalToDownload = Array.from(uniqueAthletes.values()).filter(a => {
      if (!a.imageUrl) return false;
      const athleteSlug = a.url.split('/').filter(Boolean).pop();
      const filename = `${athleteSlug}.png`;
      const filepath = path.join(athleteImagesDir, filename);
      return !fs.existsSync(filepath);
    }).length;

    for (const [url, athlete] of uniqueAthletes) {
      if (athlete.imageUrl) {
        const athleteSlug = url.split('/').filter(Boolean).pop();
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            await downloadImage(browser, athlete.imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/onefc/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename} (${currentCount}/${totalToDownload})`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/onefc/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/onefc');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save events data
    const eventsPath = path.join(outputDir, `events-${timestamp}.json`);
    fs.writeFileSync(eventsPath, JSON.stringify({ events: allEventData }, null, 2));
    console.log(`   ✅ Events: ${eventsPath}`);

    // Save athletes data
    const athletesPath = path.join(outputDir, `athletes-${timestamp}.json`);
    const athletesArray = Array.from(uniqueAthletes.values());
    fs.writeFileSync(athletesPath, JSON.stringify({ athletes: athletesArray }, null, 2));
    console.log(`   ✅ Athletes: ${athletesPath}`);

    // Save latest copy
    fs.writeFileSync(path.join(outputDir, 'latest-events.json'), JSON.stringify({ events: allEventData }, null, 2));
    fs.writeFileSync(path.join(outputDir, 'latest-athletes.json'), JSON.stringify({ athletes: athletesArray }, null, 2));

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');
    console.log(`   Events scraped: ${allEventData.length}`);
    console.log(`   Total fights: ${allEventData.reduce((sum, e) => sum + (e.fights?.length || 0), 0)}`);
    console.log(`   Unique athletes: ${uniqueAthletes.size}`);
    console.log(`   Event banners: ${allEventData.filter(e => e.localImagePath).length}`);
    console.log(`   Athlete images: ${athletesArray.filter(a => a.localImagePath).length}`);

    console.log('\n✅ All done!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await browser.close();
  }
}

/**
 * Run main scraper with timeout protection
 */
async function runWithTimeout() {
  return Promise.race([
    main(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Scraper timed out after ${OVERALL_TIMEOUT}ms`)), OVERALL_TIMEOUT)
    )
  ]);
}

// Run if called directly
if (require.main === module) {
  const startTime = Date.now();
  console.log(`🚀 Starting ONE FC scraper in ${SCRAPER_MODE} mode...`);
  console.log(`⏱️  Timeout: ${OVERALL_TIMEOUT}ms (${Math.floor(OVERALL_TIMEOUT / 60000)} minutes)\n`);

  runWithTimeout()
    .then(() => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.log(`✅ Scraper completed successfully in ${duration}s`);
      process.exit(0);
    })
    .catch(error => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.error(`\n❌ Scraper failed after ${duration}s:`, error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    });
}

module.exports = { main, runWithTimeout };
