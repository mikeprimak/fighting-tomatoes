/**
 * One-time scrape of UFC 320 fight card data
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  console.log('📄 Loading UFC 320 page...');
  await page.goto('https://www.ufc.com/event/ufc-320', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await page.waitForSelector('.c-listing-fight', { timeout: 10000 });

  console.log('✅ Page loaded, extracting data...\n');

  const eventData = await page.evaluate(() => {
    // Extract event image - find smallest image >= 900px wide
    let eventImageUrl = null;
    const pictureEl = document.querySelector('.layout__region--content picture');
    if (pictureEl) {
      const sources = Array.from(pictureEl.querySelectorAll('source'));
      const imgEl = pictureEl.querySelector('img');

      // Collect all available image URLs with their widths
      const imageOptions = [];

      sources.forEach(source => {
        const srcset = source.getAttribute('srcset');
        if (srcset) {
          // Parse srcset which might have format: "url 900w, url 1200w"
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

      // Also check img src as fallback
      if (imgEl && imgEl.src) {
        imageOptions.push({ url: imgEl.src, width: 9999 }); // Assume large if no width specified
      }

      // Sort by width and pick smallest >= 900px
      if (imageOptions.length > 0) {
        imageOptions.sort((a, b) => a.width - b.width);
        eventImageUrl = imageOptions[0].url;
      }
    }

    // Extract event-level data
    const fightCard = document.querySelector('.fight-card');
    if (!fightCard) return { error: 'No fight card found' };

    const sections = [];
    const allFights = [];
    let globalOrder = 1;
    let eventStartTime = null;

    // Process each section (Main Card, Prelims, Early Prelims)
    Array.from(fightCard.children).forEach(section => {
      const sectionClass = section.className;

      // Skip navigation bar
      if (sectionClass === 'anchors-bar') return;

      // Determine section type
      let cardType = '';
      if (sectionClass === 'main-card') cardType = 'Main Card';
      else if (sectionClass === 'fight-card-prelims') cardType = 'Prelims';
      else if (sectionClass === 'fight-card-prelims-early') cardType = 'Early Prelims';

      // Extract start time
      const timeEl = section.querySelector('.c-event-fight-card-broadcaster__time');
      const startTime = timeEl?.textContent?.trim() || '';

      // Capture event start time from Main Card
      if (cardType === 'Main Card' && startTime && !eventStartTime) {
        // Extract just the time from "Sat, Oct 4 / 10:00 PM EDT"
        const timeMatch = startTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (timeMatch) {
          eventStartTime = timeMatch[1].trim();
        }
      }

      // Extract fights in this section
      const fightElements = section.querySelectorAll('.c-listing-fight');
      const sectionFights = [];

      fightElements.forEach((element) => {
        const fightId = element.getAttribute('data-fmid') || '';

        // Weight class and title info
        const weightClassEl = element.querySelector('.c-listing-fight__class-text');
        let weightClass = weightClassEl?.textContent?.trim() || '';
        const isTitle = weightClass.toLowerCase().includes('title');
        weightClass = weightClass.replace(/\s*Title\s*/gi, '').replace(/\s*Bout\s*/gi, '').trim();

        // Red corner (Fighter A)
        const redName = element.querySelector('.c-listing-fight__corner-name--red')?.textContent?.replace(/\s+/g, ' ').trim() || '';

        // Red corner athlete URL
        let redAthleteUrl = '';
        const redImageLink = element.querySelector('.c-listing-fight__corner-image--red a');
        const redNameLink = element.querySelector('.c-listing-fight__corner-name--red a');
        if (redImageLink && redImageLink.href) {
          redAthleteUrl = redImageLink.href;
        } else if (redNameLink && redNameLink.href) {
          redAthleteUrl = redNameLink.href;
        }

        // Blue corner (Fighter B)
        const blueName = element.querySelector('.c-listing-fight__corner-name--blue')?.textContent?.replace(/\s+/g, ' ').trim() || '';

        // Blue corner athlete URL
        let blueAthleteUrl = '';
        const blueImageLink = element.querySelector('.c-listing-fight__corner-image--blue a');
        const blueNameLink = element.querySelector('.c-listing-fight__corner-name--blue a');
        if (blueImageLink && blueImageLink.href) {
          blueAthleteUrl = blueImageLink.href;
        } else if (blueNameLink && blueNameLink.href) {
          blueAthleteUrl = blueNameLink.href;
        }

        // Ranks from ranks-row
        const ranksRow = element.querySelector('.c-listing-fight__ranks-row');
        const redRankEl = ranksRow ? ranksRow.querySelector('.js-listing-fight__corner-rank:first-child span') : null;
        const blueRankEl = ranksRow ? ranksRow.querySelector('.js-listing-fight__corner-rank:last-child span') : null;
        const redRank = redRankEl?.textContent?.trim() || '';
        const blueRank = blueRankEl?.textContent?.trim() || '';

        // Country from odds-row
        const redCountryEl = element.querySelector('.c-listing-fight__country--red .c-listing-fight__country-text');
        const redCountry = redCountryEl?.textContent?.trim() || '';
        const blueCountryEl = element.querySelector('.c-listing-fight__country--blue .c-listing-fight__country-text');
        const blueCountry = blueCountryEl?.textContent?.trim() || '';

        // Odds from odds-row
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

    // Calculate fight start times based on event start (first fight at event time, then +30 mins each)
    if (eventStartTime) {
      const timeMatch = eventStartTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const period = timeMatch[3].toUpperCase();

        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }

        // Add startTime to each fight
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

  await browser.close();

  // Display results
  console.log(`\n=== UFC 320 FIGHT CARD ===\n`);
  console.log(`Total Fights: ${eventData.fights.length}\n`);

  eventData.sections.forEach(section => {
    console.log(`${section.cardType} - ${section.startTime}`);
    console.log(`  Fights: ${section.fightCount}\n`);
  });

  console.log(`Event Start Time: ${eventData.eventStartTime}`);
  console.log(`Event Image: ${eventData.eventImageUrl || 'Not found'}\n`);

  console.log(`\nFights by card:\n`);
  eventData.fights.forEach(fight => {
    console.log(`${fight.order}. [${fight.cardType}] ${fight.fighterA.name} vs ${fight.fighterB.name}`);
    console.log(`   ${fight.weightClass}${fight.isTitle ? ' (TITLE)' : ''} - Starts: ${fight.startTime || 'N/A'}`);
  });

  // Save to file
  const outputDir = path.join(__dirname, '../../test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'ufc-320-fight-card.json');
  fs.writeFileSync(outputPath, JSON.stringify(eventData, null, 2));

  console.log(`\n💾 Saved to: ${outputPath}`);
  console.log('✅ Done!');
})().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
