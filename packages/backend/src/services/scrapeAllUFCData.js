/**
 * Master orchestrator for scraping all UFC data
 *
 * This script:
 * 1. Scrapes ufc.com/events for upcoming events
 * 2. Scrapes each event page for fight cards
 * 3. Scrapes each unique athlete page for details
 * 4. Downloads event banners and athlete headshots
 * 5. Saves all data in structured JSON format
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ========================================
// STEP 1: Scrape Events List
// ========================================
async function scrapeEventsList(browser) {
  console.log('\n📋 STEP 1: Scraping upcoming events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto('https://www.ufc.com/events', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await page.waitForSelector('.c-card-event--result__logo', { timeout: 10000 });

  const events = await page.evaluate(() => {
    const eventCards = document.querySelectorAll('.l-listing__item');
    const extractedEvents = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    eventCards.forEach((card) => {
      const logoLink = card.querySelector('.c-card-event--result__logo a');
      if (!logoLink) return;

      const eventUrl = logoLink.getAttribute('href');
      const fullUrl = `https://www.ufc.com${eventUrl}`;

      let eventName = '';
      let eventType = '';

      if (eventUrl.includes('fight-night')) {
        eventType = 'Fight Night';
        eventName = 'UFC Fight Night';
      } else {
        const numberMatch = eventUrl.match(/ufc-(\d+)/);
        if (numberMatch) {
          eventType = 'Numbered';
          eventName = `UFC ${numberMatch[1]}`;
        }
      }

      const headlineEl = card.querySelector('.c-card-event--result__headline');
      const headline = headlineEl ? headlineEl.textContent.trim() : '';

      if (headline) {
        const vsMatch = headline.match(/(.+?)\s+vs\.?\s+(.+)/i);
        if (vsMatch) {
          let fighterA = vsMatch[1].trim();
          let fighterB = vsMatch[2].trim();

          fighterA = fighterA.replace(/\s+\d+$/, '');
          fighterB = fighterB.replace(/\s+\d+$/, '');

          const fighterALastName = fighterA.split(' ').pop();
          const fighterBLastName = fighterB.split(' ').pop();

          if (eventType === 'Fight Night') {
            eventName = `UFC Fight Night ${fighterALastName} vs. ${fighterBLastName}`;
          } else if (eventType === 'Numbered') {
            const numberMatch = eventUrl.match(/ufc-(\d+)/);
            if (numberMatch) {
              eventName = `UFC ${numberMatch[1]}: ${fighterALastName} vs. ${fighterBLastName}`;
            }
          }
        }
      }

      const locationEl = card.querySelector('.field--name-location .address');
      let city = '';
      let state = '';
      let country = '';

      if (locationEl) {
        const localityEl = locationEl.querySelector('.locality');
        const adminAreaEl = locationEl.querySelector('.administrative-area');
        const countryEl = locationEl.querySelector('.country');

        city = localityEl ? localityEl.textContent.trim() : '';
        state = adminAreaEl ? adminAreaEl.textContent.trim() : '';
        country = countryEl ? countryEl.textContent.trim() : '';
      }

      const venueEl = card.querySelector('.field--name-taxonomy-term-title h5');
      const venue = venueEl ? venueEl.textContent.trim() : '';

      const dateEl = card.querySelector('.c-card-event--result__date');
      const dateText = dateEl ? dateEl.textContent.trim() : '';

      let eventDate = null;
      if (dateText) {
        const dateMatch = dateText.match(/([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d{1,2})/);
        if (dateMatch) {
          const monthStr = dateMatch[2];
          const day = parseInt(dateMatch[3], 10);

          const months = {
            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
          };

          const month = months[monthStr];
          if (month !== undefined) {
            let year = now.getFullYear();
            eventDate = new Date(year, month, day);
            eventDate.setHours(0, 0, 0, 0);

            if (eventDate < now) {
              return;
            }
          }
        }
      }

      const statusEl = card.querySelector('.c-card-event--result__status');
      const status = statusEl ? statusEl.textContent.trim() : 'Upcoming';

      extractedEvents.push({
        eventName,
        eventType,
        headline,
        eventUrl: fullUrl,
        venue,
        city,
        state,
        country,
        dateText,
        status
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
      timeout: 30000
    });

    await page.waitForSelector('.c-listing-fight', { timeout: 10000 });

    const eventData = await page.evaluate(() => {
      // Extract event image
      let eventImageUrl = null;
      const pictureEl = document.querySelector('.layout__region--content picture');
      if (pictureEl) {
        const sources = Array.from(pictureEl.querySelectorAll('source'));
        const imgEl = pictureEl.querySelector('img');
        const imageOptions = [];

        sources.forEach(source => {
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            const matches = srcset.match(/(\S+)\s+(\d+)w/g);
            if (matches) {
              matches.forEach(match => {
                const [url, widthStr] = match.split(/\s+/);
                const width = parseInt(widthStr.replace('w', ''));
                if (width >= 900) {
                  imageOptions.push({ url, width });
                }
              });
            }
          }
        });

        if (imgEl && imgEl.src) {
          imageOptions.push({ url: imgEl.src, width: 9999 });
        }

        if (imageOptions.length > 0) {
          imageOptions.sort((a, b) => a.width - b.width);
          eventImageUrl = imageOptions[0].url;
        }
      }

      // Extract fight card
      const fightCard = document.querySelector('.fight-card');
      if (!fightCard) return { error: 'No fight card found' };

      const sections = [];
      const allFights = [];
      let globalOrder = 1;
      let eventStartTime = null;

      Array.from(fightCard.children).forEach(section => {
        const sectionClass = section.className;
        if (sectionClass === 'anchors-bar') return;

        let cardType = '';
        if (sectionClass === 'main-card') cardType = 'Main Card';
        else if (sectionClass === 'fight-card-prelims') cardType = 'Prelims';
        else if (sectionClass === 'fight-card-prelims-early') cardType = 'Early Prelims';

        const timeEl = section.querySelector('.c-event-fight-card-broadcaster__time');
        const startTime = timeEl?.textContent?.trim() || '';

        if (cardType === 'Main Card' && startTime && !eventStartTime) {
          const timeMatch = startTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (timeMatch) {
            eventStartTime = timeMatch[1].trim();
          }
        }

        const fightElements = section.querySelectorAll('.c-listing-fight');
        const sectionFights = [];

        fightElements.forEach((element) => {
          const fightId = element.getAttribute('data-fmid') || '';

          const weightClassEl = element.querySelector('.c-listing-fight__class-text');
          let weightClass = weightClassEl?.textContent?.trim() || '';
          const isTitle = weightClass.toLowerCase().includes('title');
          weightClass = weightClass.replace(/\s*Title\s*/gi, '').replace(/\s*Bout\s*/gi, '').trim();

          const redName = element.querySelector('.c-listing-fight__corner-name--red')?.textContent?.replace(/\s+/g, ' ').trim() || '';

          let redAthleteUrl = '';
          const redImageLink = element.querySelector('.c-listing-fight__corner-image--red a');
          const redNameLink = element.querySelector('.c-listing-fight__corner-name--red a');
          if (redImageLink && redImageLink.href) {
            redAthleteUrl = redImageLink.href;
          } else if (redNameLink && redNameLink.href) {
            redAthleteUrl = redNameLink.href;
          }

          const blueName = element.querySelector('.c-listing-fight__corner-name--blue')?.textContent?.replace(/\s+/g, ' ').trim() || '';

          let blueAthleteUrl = '';
          const blueImageLink = element.querySelector('.c-listing-fight__corner-image--blue a');
          const blueNameLink = element.querySelector('.c-listing-fight__corner-name--blue a');
          if (blueImageLink && blueImageLink.href) {
            blueAthleteUrl = blueImageLink.href;
          } else if (blueNameLink && blueNameLink.href) {
            blueAthleteUrl = blueNameLink.href;
          }

          const ranksRow = element.querySelector('.c-listing-fight__ranks-row');
          const redRankEl = ranksRow ? ranksRow.querySelector('.js-listing-fight__corner-rank:first-child span') : null;
          const blueRankEl = ranksRow ? ranksRow.querySelector('.js-listing-fight__corner-rank:last-child span') : null;
          const redRank = redRankEl?.textContent?.trim() || '';
          const blueRank = blueRankEl?.textContent?.trim() || '';

          const redCountryEl = element.querySelector('.c-listing-fight__country--red .c-listing-fight__country-text');
          const redCountry = redCountryEl?.textContent?.trim() || '';
          const blueCountryEl = element.querySelector('.c-listing-fight__country--blue .c-listing-fight__country-text');
          const blueCountry = blueCountryEl?.textContent?.trim() || '';

          const oddsElements = element.querySelectorAll('.c-listing-fight__odds-amount');
          const redOdds = oddsElements[0]?.textContent?.trim() || '';
          const blueOdds = oddsElements[1]?.textContent?.trim() || '';

          const fightData = {
            fightId: fightId || `fight-${globalOrder}`,
            order: globalOrder++,
            cardType,
            weightClass,
            isTitle,
            fighterA: {
              name: redName,
              rank: redRank,
              country: redCountry,
              odds: redOdds,
              athleteUrl: redAthleteUrl
            },
            fighterB: {
              name: blueName,
              rank: blueRank,
              country: blueCountry,
              odds: blueOdds,
              athleteUrl: blueAthleteUrl
            }
          };

          sectionFights.push(fightData);
          allFights.push(fightData);
        });

        sections.push({
          cardType,
          startTime,
          fightCount: sectionFights.length
        });
      });

      // Calculate fight start times
      if (eventStartTime) {
        const timeMatch = eventStartTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const period = timeMatch[3].toUpperCase();

          if (period === 'PM' && hours !== 12) {
            hours += 12;
          } else if (period === 'AM' && hours === 12) {
            hours = 0;
          }

          allFights.forEach((fight, index) => {
            const minutesOffset = index * 30;
            let fightHours = hours + Math.floor((minutes + minutesOffset) / 60);
            let fightMinutes = (minutes + minutesOffset) % 60;

            if (fightHours >= 24) {
              fightHours = fightHours % 24;
            }

            const fightPeriod = fightHours >= 12 ? 'PM' : 'AM';
            const displayHours = fightHours === 0 ? 12 : fightHours > 12 ? fightHours - 12 : fightHours;
            fight.startTime = `${displayHours}:${fightMinutes.toString().padStart(2, '0')} ${fightPeriod}`;
          });
        }
      }

      return {
        eventImageUrl,
        eventStartTime,
        sections,
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
      timeout: 30000
    });

    const athleteData = await page.evaluate(() => {
      let record = null;
      const recordEl = document.querySelector('.hero-profile__division-body');
      if (recordEl) {
        const recordText = recordEl.textContent.trim();
        const recordMatch = recordText.match(/(\d+-\d+-\d+)/);
        if (recordMatch) {
          record = recordMatch[1];
        }
      }

      let headshotUrl = null;
      const athleteResultImages = document.querySelectorAll(
        '.c-card-event--athlete-results__image img, ' +
        '.c-card-event--athlete-results__red-image img, ' +
        '.c-card-event--athlete-results__blue-image img'
      );

      if (athleteResultImages.length > 0) {
        headshotUrl = athleteResultImages[0].src;
      }

      if (!headshotUrl) {
        const heroImage = document.querySelector('.hero-profile__image img, .c-bio__image img');
        if (heroImage && heroImage.src) {
          headshotUrl = heroImage.src;
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
      // Add delay before opening new page to prevent rapid page creation
      await new Promise(resolve => setTimeout(resolve, 200));

      page = await browser.newPage();

      // Navigate to the image URL
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      if (response && response.ok()) {
        // Get the image as a buffer
        const buffer = await response.buffer();

        // Write to file
        fs.writeFileSync(filepath, buffer);

        // Add delay before closing page to prevent protocol errors
        await new Promise(resolve => setTimeout(resolve, 300));

        // Close page safely
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (closeError) {
            // Ignore close errors - page might already be closed
          }
        }

        return filepath;
      } else {
        throw new Error(`Failed to download: ${response ? response.status() : 'No response'}`);
      }
    } catch (error) {
      lastError = error;

      // Clean up page on error
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }

      // If not the last attempt, wait before retrying
      if (attempt < retries) {
        const backoffDelay = attempt * 500; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  // All retries failed
  throw lastError || new Error('Download failed after all retries');
}

// ========================================
// MAIN ORCHESTRATOR
// ========================================
async function main() {
  console.log('\n🚀 Starting UFC Data Scraping Orchestrator\n');
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
              url: fight.fighterA.athleteUrl
            });
          }
          if (fight.fighterB.athleteUrl && !uniqueAthletes.has(fight.fighterB.athleteUrl)) {
            uniqueAthletes.set(fight.fighterB.athleteUrl, {
              name: fight.fighterB.name,
              url: fight.fighterB.athleteUrl
            });
          }
        });
      }

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // STEP 3: Scrape athlete pages
    console.log(`\n\n👤 STEP 3: Scraping ${uniqueAthletes.size} unique athlete pages...\n`);
    let athleteCount = 0;

    for (const [url, athlete] of uniqueAthletes) {
      athleteCount++;
      console.log(`   ${athleteCount}/${uniqueAthletes.size} ${athlete.name}`);
      const athleteData = await scrapeAthletePage(browser, url);
      uniqueAthletes.set(url, { ...athlete, ...athleteData });

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // STEP 4: Download images
    console.log('\n\n🖼️  STEP 4: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events');
    const athleteImagesDir = path.join(imagesDir, 'athletes');

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
        const filename = `${event.eventUrl.split('/').pop()}.jpg`;
        const filepath = path.join(eventImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, event.eventImageUrl, filepath);
            event.localImagePath = `/images/events/${filename}`;
            console.log(`      ✅ ${filename}`);

            // Add delay between event banner downloads
            await new Promise(resolve => setTimeout(resolve, 400));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete headshots
    console.log('\n   Athlete headshots:');
    let downloadCount = 0;
    let currentCount = 0;
    const totalToDownload = Array.from(uniqueAthletes.values()).filter(a => a.headshotUrl && !fs.existsSync(path.join(athleteImagesDir, `${a.url.split('/').pop()}.png`))).length;

    for (const [url, athlete] of uniqueAthletes) {
      if (athlete.headshotUrl) {
        const athleteSlug = url.split('/').pop();
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            await downloadImage(browser, athlete.headshotUrl, filepath);
            athlete.localHeadshotPath = `/images/athletes/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename} (${currentCount}/${totalToDownload})`);

            // Add delay between athlete downloads to prevent browser overload
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localHeadshotPath = `/images/athletes/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new headshots`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data');
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
    console.log(`   Athlete headshots: ${athletesArray.filter(a => a.localHeadshotPath).length}`);

    console.log('\n✅ All done!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { main };
