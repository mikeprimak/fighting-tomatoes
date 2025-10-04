/**
 * Scrape a single live UFC event
 * Usage: node scrapeLiveEvent.js <eventUrl> <outputDir>
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapeLiveEvent(eventUrl, outputDir) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('.c-listing-fight', { timeout: 10000 });

    const eventData = await page.evaluate(() => {
      // Extract event name from page
      const eventNameEl = document.querySelector('.c-hero__headline-suffix, .c-hero__headline');
      const eventName = eventNameEl?.textContent?.trim() || 'Unknown Event';

      // Extract event image
      let eventImageUrl = null;
      const pictureEl = document.querySelector('.layout__region--content picture');
      if (pictureEl) {
        const imgEl = pictureEl.querySelector('img');
        if (imgEl && imgEl.src) {
          eventImageUrl = imgEl.src;
        }
      }

      const fightCard = document.querySelector('.fight-card');
      if (!fightCard) return { error: 'No fight card found' };

      const allFights = [];
      let globalOrder = 1;

      // Check event status - look for live event indicator
      const liveEventBadge = document.querySelector('.c-hero__indicator');
      const liveEventText = liveEventBadge?.textContent?.toLowerCase() || '';
      const hasStarted = liveEventText.includes('live');

      // Check if event is complete by looking at all fights
      let isComplete = false;

      // Process each section
      Array.from(fightCard.children).forEach(section => {
        if (section.className === 'anchors-bar') return;

        let cardType = '';
        if (section.className === 'main-card') cardType = 'Main Card';
        else if (section.className === 'fight-card-prelims') cardType = 'Prelims';
        else if (section.className === 'fight-card-prelims-early') cardType = 'Early Prelims';

        const fightElements = section.querySelectorAll('.c-listing-fight');

        fightElements.forEach((element) => {
          const fightId = element.getAttribute('data-fmid') || '';

          // Extract weight class
          const weightClassEl = element.querySelector('.c-listing-fight__class-text');
          let weightClass = weightClassEl?.textContent?.trim() || '';
          const isTitle = weightClass.toLowerCase().includes('title');
          weightClass = weightClass.replace(/\s*Title\s*/gi, '').replace(/\s*Bout\s*/gi, '').trim();

          // Extract fighter names
          const redName = element.querySelector('.c-listing-fight__corner-name--red')?.textContent?.replace(/\s+/g, ' ').trim() || '';
          const blueName = element.querySelector('.c-listing-fight__corner-name--blue')?.textContent?.replace(/\s+/g, ' ').trim() || '';

          // Check for live status (be more careful - only if text actually says "live now")
          const fightText = element.textContent.toLowerCase();
          const isActuallyLive = fightText.includes('live now');
          let fightStatus = 'upcoming';
          let currentRound = null;
          let completedRounds = null;

          if (isActuallyLive) {
            fightStatus = 'live';

            // Try to detect current round
            const roundMatch = fightText.match(/(?:round\s+|r)(\d+)/i);
            if (roundMatch) {
              const detectedRound = parseInt(roundMatch[1], 10);
              if (fightText.includes('end') || fightText.includes('complete')) {
                completedRounds = detectedRound;
                currentRound = null;
              } else {
                currentRound = detectedRound;
                completedRounds = detectedRound > 1 ? detectedRound - 1 : 0;
              }
            }
          }

          // Check for result
          const resultEl = element.querySelector('.c-listing-fight__outcome-wrapper');
          const resultText = resultEl?.textContent?.trim() || '';
          let result = null;

          if (resultText) {
            fightStatus = 'complete';

            // Parse result: "Crute defeats Erslan by Submission (Rear Naked Choke) at 3:19 of Round 1"
            const winnerMatch = resultText.match(/^([^defeats]+)\s+defeats/i);
            const methodMatch = resultText.match(/by\s+([^at]+)\s+at/i);
            const timeMatch = resultText.match(/at\s+([\d:]+)\s+of/i);
            const roundMatch = resultText.match(/Round\s+(\d+)/i);

            result = {
              winner: winnerMatch ? winnerMatch[1].trim() : null,
              method: methodMatch ? methodMatch[1].trim() : null,
              time: timeMatch ? timeMatch[1].trim() : null,
              round: roundMatch ? parseInt(roundMatch[1], 10) : null
            };

            if (result.round) {
              completedRounds = result.round;
            }
          }

          allFights.push({
            fightId: fightId || `fight-${globalOrder}`,
            order: globalOrder++,
            cardType,
            weightClass,
            isTitle,
            fighter1Name: redName,
            fighter2Name: blueName,
            status: fightStatus,
            currentRound,
            completedRounds,
            hasStarted: fightStatus !== 'upcoming',
            isComplete: fightStatus === 'complete',
            result
          });
        });
      });

      return {
        eventName,
        eventImageUrl,
        hasStarted,
        isComplete,
        status: isComplete ? 'Complete' : hasStarted ? 'Live' : 'Upcoming',
        fights: allFights,
        scrapedAt: new Date().toISOString()
      };
    });

    await browser.close();

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `live-event-${timestamp}.json`;
    const filepath = path.join(outputDir, filename);

    const outputData = {
      eventUrl,
      scrapedAt: new Date().toISOString(),
      events: [eventData]
    };

    fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));

    return { success: true, filepath, eventData };

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const eventUrl = process.argv[2];
  const outputDir = process.argv[3];

  if (!eventUrl || !outputDir) {
    console.error('Usage: node scrapeLiveEvent.js <eventUrl> <outputDir>');
    process.exit(1);
  }

  scrapeLiveEvent(eventUrl, outputDir)
    .then(result => {
      console.log(`✅ Scraped successfully: ${result.filepath}`);
      console.log(`   Event: ${result.eventData.eventName}`);
      console.log(`   Status: ${result.eventData.status}`);
      console.log(`   Fights: ${result.eventData.fights.length}`);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { scrapeLiveEvent };
