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

    // First, get basic event and fight data
    const eventData = await page.evaluate(() => {
      // Extract event name from page
      const eventNameEl = document.querySelector('.c-hero__headline-suffix, .c-hero__headline');
      const eventName = (eventNameEl?.textContent || 'Unknown Event')
        .replace(/\s+/g, ' ')  // Replace all whitespace (including newlines) with single space
        .trim();

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

          // Find the details container where fighter names and live banner are located
          const detailsContainer = element.querySelector('.c-listing-fight__details');

          // Extract fighter names from within details container
          const redName = detailsContainer?.querySelector('.c-listing-fight__corner-name--red')?.textContent?.replace(/\s+/g, ' ').trim() || '';
          const blueName = detailsContainer?.querySelector('.c-listing-fight__corner-name--blue')?.textContent?.replace(/\s+/g, ' ').trim() || '';

          // Fight status logic:
          // 1. Live: .c-listing-fight__banner--live exists WITHIN the details container
          // 2. Complete: .c-listing-fight__outcome--win exists (ONLY indicator)
          // 3. Upcoming: neither exists

          // Check if detailsContainer exists and if it contains a visible live banner
          let liveBanner = null;
          let isActuallyLive = false;
          if (detailsContainer) {
            liveBanner = detailsContainer.querySelector('.c-listing-fight__banner--live');
            // Only consider it live if the banner exists AND doesn't have 'hidden' class
            if (liveBanner) {
              isActuallyLive = !liveBanner.classList.contains('hidden');
            }
          }
          const winIndicator = element.querySelector('.c-listing-fight__outcome--win');

          let fightStatus = 'upcoming';
          let currentRound = null;
          let completedRounds = null;
          let result = null;

          // Check if fight is complete (ONLY based on winIndicator)
          if (winIndicator) {
            fightStatus = 'complete';

            // Determine winner by checking which corner has the win indicator
            let winner = null;
            const redCorner = element.querySelector('.c-listing-fight__corner--red');
            const blueCorner = element.querySelector('.c-listing-fight__corner--blue');

            if (redCorner?.contains(winIndicator)) {
              winner = redName;
            } else if (blueCorner?.contains(winIndicator)) {
              winner = blueName;
            }

            // Extract result details (round/method) for informational purposes only
            const roundResultEl = element.querySelector('.c-listing-fight__result-text.round');
            const methodResultEl = element.querySelector('.c-listing-fight__result-text.method');
            const roundNum = roundResultEl?.textContent?.trim();
            const method = methodResultEl?.textContent?.trim();

            result = {
              winner: winner,
              method: method || null,
              time: null,
              round: roundNum ? parseInt(roundNum, 10) : null
            };

            if (result.round) {
              completedRounds = result.round;
            }
          }
          // Check if fight is live (takes precedence over upcoming)
          else if (isActuallyLive) {
            fightStatus = 'live';
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

    // Now expand live fights to get round/time details
    for (let i = 0; i < eventData.fights.length; i++) {
      const fight = eventData.fights[i];

      if (fight.status === 'live' && fight.fightId) {
        try {
          // Find the fight element by data-fmid
          const fightSelector = `.c-listing-fight[data-fmid="${fight.fightId}"]`;
          const expandButtonSelector = `${fightSelector} .c-listing-fight__expand-button`;

          // Check if expand button exists
          const expandButton = await page.$(expandButtonSelector);
          if (expandButton) {
            // Click to expand
            await expandButton.click();

            // Wait for content to load (give it a few seconds)
            await page.waitForTimeout(2000);

            // Extract round/time data from expanded content
            const liveData = await page.evaluate((selector) => {
              const fightEl = document.querySelector(selector);
              if (!fightEl) return null;

              const contentEl = fightEl.querySelector('.c-listing-fight__content');
              if (!contentEl) return null;

              const contentText = contentEl.textContent || '';

              // Look for "Round X" and time patterns
              const roundMatch = contentText.match(/Round\s+(\d+)/i);
              const timeMatch = contentText.match(/(\d+:\d+)/);

              return {
                round: roundMatch ? parseInt(roundMatch[1], 10) : null,
                time: timeMatch ? timeMatch[1] : null
              };
            }, fightSelector);

            if (liveData) {
              if (liveData.round) {
                fight.currentRound = liveData.round;
                fight.completedRounds = liveData.round > 1 ? liveData.round - 1 : 0;
              }
              if (liveData.time) {
                fight.currentTime = liveData.time;
              }
            }
          }
        } catch (error) {
          // Silently continue if we can't expand this fight
          console.log(`  ⚠ Could not expand fight ${fight.fightId}: ${error.message}`);
        }
      }
    }

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
