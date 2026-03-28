/**
 * Scrape a live BKFC event page using Puppeteer
 *
 * Loads the BKFC event page, waits for JavaScript to populate fight data,
 * and extracts fight results from the DOM. Covers both "Main Card" and
 * "Free Fights" tabs.
 *
 * Usage: node scrapeBKFCLiveEvent.js <eventUrl> <outputDir>
 *
 * DOM structure:
 * - Each fight section contains a[href*="/fighters/"] links for fighter names
 * - [data-render-stats] containers per bout with data-AthleteRedUUID/BlueUUID
 * - [data-render="RedResult"|"BlueResult"|"Method"|"Round"|"Time"] for results
 * - html[live-event="true"] when event is live
 * - [data-custom-tabs] separates "Main Card" and "Free Fights"
 *
 * The page loads fight data from an external stats API (xapi.mmareg.com) via
 * JavaScript, populating [data-render] elements. Puppeteer is needed because:
 * 1. The page is JavaScript-rendered (Webflow + custom scripts)
 * 2. Fight results are populated dynamically from the API
 * 3. Both tabs need to be accessed
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Parse method string to standard format
 */
function parseMethod(methodStr) {
  if (!methodStr || methodStr === 'TBU' || methodStr === 'TBD') return null;

  const m = methodStr.toLowerCase().trim();
  if (m === 'ko' || m.includes('knockout') && !m.includes('technical')) return 'KO';
  if (m === 'tko' || m.includes('technical knockout') || m.includes('technical ko')) return 'TKO';
  if (m.includes('unanimous')) return 'UD';
  if (m.includes('split')) return 'SD';
  if (m.includes('majority')) return 'MD';
  if (m.includes('decision') || m === 'dec') return 'DEC';
  if (m === 'dq' || m.includes('disqualif')) return 'DQ';
  if (m === 'nc' || m.includes('no contest')) return 'NC';
  if (m.includes('draw')) return 'DRAW';
  if (m === 'rtd' || m.includes('corner stoppage') || m.includes('retirement')) return 'RTD';
  if (m.includes('submission') || m === 'sub') return 'SUB';

  // Return cleaned-up original if we can't standardize
  return methodStr.trim();
}

async function scrapeBKFCLiveEvent(eventUrl, outputDir) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--window-size=1280x900',
      '--single-process',
      '--no-zygote',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  console.log('[BKFC SCRAPER] Browser launched');

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log(`[BKFC SCRAPER] Loading: ${eventUrl}`);
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    // Wait for the page's JavaScript to load and populate fight data
    // The page fetches from xapi.mmareg.com and fires 'fightDataLoaded' event
    console.log('[BKFC SCRAPER] Waiting for fight data to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Extract fight data from the DOM
    const eventData = await page.evaluate(() => {
      // Check if event is live
      const isLiveEvent = document.documentElement.getAttribute('live-event') === 'true';

      // Helper: clean fighter name from slug
      function nameFromSlug(slug) {
        if (!slug) return '';
        const parts = slug.split('-').filter(p => p.length > 0);
        // Remove garbage (numeric, short random strings)
        const cleaned = parts.filter(p => {
          if (/\d/.test(p)) return false;
          if (p.length > 2 && !/[aeiouAEIOU]/.test(p)) return false;
          return true;
        });
        return cleaned.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }

      // Helper: check valid fighter name
      function isValidName(name) {
        if (!name || name.length < 2 || name.length > 50) return false;
        const bad = [/^view/i, /^more/i, /buy/i, /ticket/i, /watch/i, /^tbu$/i, /^tbd$/i,
          /^\d+$/, /lightweight/i, /welterweight/i, /heavyweight/i, /middleweight/i,
          /featherweight/i, /bantamweight/i, /^main$/i, /^card$/i, /^free$/i, /^fights$/i];
        return !bad.some(r => r.test(name)) && /[a-zA-Z]/.test(name);
      }

      // Strategy: Find fights by pairing consecutive fighter links
      // Each fight section has exactly 2 fighter links (red corner, blue corner)
      const allFights = [];
      const processedPairs = new Set();

      // Find all fight containers — look for sections containing fighter pairs
      // BKFC groups fights by card type in tab content areas
      const fighterLinks = Array.from(document.querySelectorAll('a[href*="/fighters/"]'));

      // Group fighter links by their nearest fight container
      // We need to pair fighters that belong to the same fight
      const fightContainers = new Map();

      fighterLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!href.includes('/fighters/')) return;

        // Find the fight container for this link
        // Walk up the DOM to find a shared container
        const container = link.closest('[data-render-stats]') ||
                         link.closest('.fight-card_bout-container') ||
                         link.closest('.fight-card_wrapper') ||
                         link.closest('.w-dyn-item') ||
                         link.closest('section') ||
                         link.parentElement?.parentElement?.parentElement?.parentElement;

        if (!container) return;

        // Use the container as a key to group fighters in the same fight
        if (!fightContainers.has(container)) {
          fightContainers.set(container, []);
        }
        fightContainers.get(container).push(link);
      });

      // Process each fight container
      let globalOrder = 0;

      fightContainers.forEach((links, container) => {
        // Deduplicate links by href
        const uniqueLinks = [];
        const seenHrefs = new Set();
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const slug = href.split('/fighters/').pop()?.replace(/\/$/, '') || '';
          if (!seenHrefs.has(slug) && slug) {
            seenHrefs.add(slug);
            uniqueLinks.push({ link, slug });
          }
        }

        // We need exactly 2 unique fighter links per fight
        if (uniqueLinks.length < 2) return;

        // Take first two unique fighters
        const fighterASlug = uniqueLinks[0].slug;
        const fighterBSlug = uniqueLinks[1].slug;

        const fighterAName = nameFromSlug(fighterASlug);
        const fighterBName = nameFromSlug(fighterBSlug);

        if (!isValidName(fighterAName) || !isValidName(fighterBName)) return;
        if (fighterAName === fighterBName) return;

        // Deduplicate
        const pairKey = [fighterAName, fighterBName].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        globalOrder++;

        // Extract weight class from container text
        let weightClass = '';
        const containerText = container.textContent || '';
        const weightClasses = ['Heavyweight', 'Light Heavyweight', 'Cruiserweight', 'Middleweight',
          'Welterweight', 'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight', 'Strawweight'];
        for (const wc of weightClasses) {
          if (containerText.includes(wc)) {
            weightClass = wc;
            break;
          }
        }

        // Check bout type
        const isTitle = /championship/i.test(containerText) || /title\s*bout/i.test(containerText);
        let cardType = 'Main Card';
        // Check if this fight is in the "Free Fights" / "Prelims" Webflow tab pane
        // BKFC uses Webflow tabs: div[data-w-tab="Main Card"] and div[data-w-tab="Prelims"]
        const tabPane = container.closest('[data-w-tab]');
        if (tabPane) {
          const tabValue = tabPane.getAttribute('data-w-tab') || '';
          if (tabValue === 'Prelims' || tabValue.toLowerCase().includes('prelim') || tabValue.toLowerCase().includes('free')) {
            cardType = 'Prelims';
          }
        }
        // Fallback: check for "Undercard" heading within container's section
        if (cardType === 'Main Card') {
          const heading = container.closest('.fight-card_section, .w-dyn-list')?.querySelector('.fight-card_heading');
          if (heading && /undercard|free\s*fights/i.test(heading.textContent || '')) {
            cardType = 'Prelims';
          }
        }

        // Extract result data from [data-render] elements within the container
        // These elements get populated by JavaScript from the stats API.
        // BKFC uses two naming conventions:
        //   Old: RedResult/BlueResult/Method/Round/Time
        //   New: WinMethod/RoundEnded/RoundEndedTime (results in stats container)
        //        W/L/D indicators in <p> inside .fight-card_list-title
        let redResult = '';
        let blueResult = '';
        let method = '';
        let round = '';
        let time = '';

        // Look for data-render elements (both old and new field names)
        const renderEls = container.querySelectorAll('[data-render]');
        renderEls.forEach(el => {
          const field = (el.getAttribute('data-render') || '').trim();
          const value = (el.textContent || '').trim();
          if (value === 'TBU' || value === 'TBD' || value === '' || value === '0') return;

          if (field === 'RedResult') redResult = value;
          else if (field === 'BlueResult') blueResult = value;
          else if (field === 'MethoD' || field === 'Method' || field === 'WinMethod') method = value;
          else if (field === 'RoundEnded') round = value;
          else if (field === 'RoundEndedTime') time = value;
          // Skip generic 'Round' — those are per-round stats headers (1,2,3,4,5), not fight result
          // Skip 'Time' — that's the old field name, RoundEndedTime is used now
        });

        // Also check for data-render-stats container attributes
        const statsContainer = container.querySelector('[data-render-stats]') || container;
        const redUUID = statsContainer.getAttribute('data-AthleteRedUUID') || '';
        const blueUUID = statsContainer.getAttribute('data-AthleteBlueUUID') || '';

        // Check W/L/D indicators in fight-card_list-title elements
        // BKFC shows W/L/D as <p> inside .fight-card_list-title for each corner
        // The first fighter link's section has the red corner indicator,
        // the second fighter link's section has the blue corner indicator.
        if (!redResult && !blueResult) {
          const titleEls = container.querySelectorAll('.fight-card_list-title');
          if (titleEls.length >= 2) {
            // Each title element contains W, L, D paragraphs — check which is visible/highlighted
            // For completed fights, the W/L text gets a distinct style
            // We check which corner's W element has content or is styled
            titleEls.forEach((titleEl, idx) => {
              const ps = titleEl.querySelectorAll('p');
              ps.forEach(p => {
                const t = p.textContent?.trim().toUpperCase();
                // Check if this W/L indicator is "active" — BKFC uses opacity or display
                // to show the result. Check computed style or class.
                const style = window.getComputedStyle(p);
                const isVisible = style.opacity !== '0' && style.display !== 'none';
                if (!isVisible) return;
                // The W/L/D are always present but only the winning indicator is highlighted
                // Check for a highlight class or color
                const color = style.color;
                const isHighlighted = color && (
                  color.includes('255') || // bright color (gold/white/green)
                  color === 'rgb(255, 255, 255)' || // white
                  color === 'rgb(212, 175, 55)' // gold
                );
                if (t === 'W' && isHighlighted) {
                  if (idx === 0) redResult = 'W';
                  else blueResult = 'W';
                }
              });
            });
          }
        }

        // Strategy 2: If we have WinMethod but no W/L, check stats for winner
        // When method is set, the fight is complete — determine winner from strike stats
        // The winner is typically the red corner (fighter1) unless stats show otherwise
        // For now, if we have method but no explicit W/L, look at fight-card elements
        if (method && !redResult && !blueResult) {
          // Check for winner-indicator class or similar on fighter elements
          const winIndicators = container.querySelectorAll('[class*="winner"], [class*="win-"], .is-winner');
          winIndicators.forEach(el => {
            const elText = el.textContent?.trim() || '';
            if (elText.includes(fighterAName.split(' ').pop())) redResult = 'W';
            else if (elText.includes(fighterBName.split(' ').pop())) blueResult = 'W';
          });
        }

        // Determine fight status
        let fightStatus = 'upcoming';
        let result = null;
        let isComplete = false;
        let hasStarted = false;

        // Check current-bout attribute
        if (container.hasAttribute('current-bout') || container.querySelector('[current-bout]')) {
          hasStarted = true;
          fightStatus = 'live';
        }

        // If we have a method (WinMethod), the fight is complete even without explicit W/L
        if (method && !redResult && !blueResult) {
          fightStatus = 'complete';
          isComplete = true;
          hasStarted = true;

          // Without explicit W/L, we can still record the method/round/time
          // Winner will need to be determined from other indicators
          const methodUpper = method.toUpperCase();
          if (methodUpper.includes('DRAW')) {
            result = { winner: null, method: 'DRAW', round: round ? parseInt(round, 10) : null, time: time || null };
          } else if (methodUpper === 'NC' || methodUpper.includes('NO CONTEST')) {
            result = { winner: null, method: 'NC', round: round ? parseInt(round, 10) : null, time: time || null };
          } else {
            // We have a method but no winner — still mark as complete with partial data
            result = {
              winner: null,
              method: method || null,
              round: round ? parseInt(round, 10) : null,
              time: time || null,
            };
          }
        }

        // Check results from RedResult/BlueResult indicators
        const redUpper = redResult.toUpperCase();
        const blueUpper = blueResult.toUpperCase();

        if (redUpper === 'W' || redUpper === 'WIN' || blueUpper === 'W' || blueUpper === 'WIN') {
          fightStatus = 'complete';
          isComplete = true;
          hasStarted = true;

          const winnerName = (redUpper === 'W' || redUpper === 'WIN') ? fighterAName : fighterBName;
          // Extract last name for the winner field
          const winnerParts = winnerName.split(' ');
          const winnerLastName = winnerParts.length > 1 ? winnerParts.slice(1).join(' ') : winnerParts[0];

          result = {
            winner: winnerLastName,
            method: method || null,
            round: round ? parseInt(round, 10) : null,
            time: time || null,
          };
        } else if (redUpper === 'D' || redUpper === 'DRAW' || blueUpper === 'D' || blueUpper === 'DRAW') {
          fightStatus = 'complete';
          isComplete = true;
          hasStarted = true;
          result = { winner: null, method: 'DRAW', round: round ? parseInt(round, 10) : null, time: time || null };
        } else if (redUpper === 'NC' || blueUpper === 'NC') {
          fightStatus = 'complete';
          isComplete = true;
          hasStarted = true;
          result = { winner: null, method: 'NC', round: round ? parseInt(round, 10) : null, time: time || null };
        } else if (redUpper === 'L' || blueUpper === 'L') {
          // One fighter has a loss but the other doesn't show 'W' yet
          // The loser side means the other side won
          fightStatus = 'complete';
          isComplete = true;
          hasStarted = true;
          const winnerName = redUpper === 'L' ? fighterBName : fighterAName;
          const winnerParts = winnerName.split(' ');
          const winnerLastName = winnerParts.length > 1 ? winnerParts.slice(1).join(' ') : winnerParts[0];
          result = {
            winner: winnerLastName,
            method: method || null,
            round: round ? parseInt(round, 10) : null,
            time: time || null,
          };
        }

        allFights.push({
          fightId: `bkfc-${globalOrder}`,
          order: globalOrder,
          cardType,
          weightClass,
          isTitle,
          fighter1Name: fighterAName,
          fighter2Name: fighterBName,
          fighter1Slug: fighterASlug,
          fighter2Slug: fighterBSlug,
          fighter1UUID: redUUID,
          fighter2UUID: blueUUID,
          status: fightStatus,
          hasStarted,
          isComplete,
          result,
        });
      });

      // Determine overall event status
      const completedFights = allFights.filter(f => f.isComplete).length;
      let eventStatus = 'upcoming';
      let eventHasStarted = false;
      let eventIsComplete = false;

      if (completedFights === allFights.length && allFights.length > 0) {
        eventStatus = 'complete';
        eventHasStarted = true;
        eventIsComplete = true;
      } else if (isLiveEvent || completedFights > 0 || allFights.some(f => f.hasStarted)) {
        eventStatus = 'live';
        eventHasStarted = true;
      }

      return {
        eventName: document.title || 'BKFC Event',
        isLiveEvent,
        hasStarted: eventHasStarted,
        isComplete: eventIsComplete,
        status: eventStatus,
        fights: allFights,
        scrapedAt: new Date().toISOString(),
      };
    });

    console.log(`[BKFC SCRAPER] Scraped ${eventData.fights?.length || 0} fights`);
    console.log(`[BKFC SCRAPER] Event status: ${eventData.status} (live-event attr: ${eventData.isLiveEvent})`);

    // Log fight card
    if (eventData.fights) {
      console.log('\n[BKFC SCRAPER] Fight Card:');
      eventData.fights.forEach((fight, i) => {
        const icon = fight.isComplete ? 'DONE' : fight.hasStarted ? 'LIVE' : 'UPCOMING';
        const resultStr = fight.result
          ? ` -> ${fight.result.winner || '?'} by ${fight.result.method || '?'}${fight.result.round ? ` R${fight.result.round}` : ''}`
          : '';
        console.log(`  ${i + 1}. [${icon}] ${fight.fighter1Name} vs ${fight.fighter2Name} (${fight.weightClass}) [${fight.cardType}]${resultStr}`);
      });
    }

    await browser.close();

    // Save output
    if (outputDir) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `bkfc-live-${timestamp}.json`;
      const filepath = path.join(outputDir, filename);

      const outputData = {
        eventUrl,
        scrapedAt: new Date().toISOString(),
        events: [eventData],
      };

      fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));
      console.log(`[BKFC SCRAPER] Saved to: ${filepath}`);
    }

    return { success: true, eventData };

  } catch (error) {
    await browser.close();
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const eventUrl = process.argv[2];
  const outputDir = process.argv[3] || path.join(__dirname, '../../live-event-data/bkfc');

  if (!eventUrl) {
    console.error('Usage: node scrapeBKFCLiveEvent.js <eventUrl> [outputDir]');
    process.exit(1);
  }

  scrapeBKFCLiveEvent(eventUrl, outputDir)
    .then(result => {
      console.log(`\nScrape complete: ${result.eventData.fights.length} fights`);
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = { scrapeBKFCLiveEvent, parseMethod };
