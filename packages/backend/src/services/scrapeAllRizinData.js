/**
 * Master orchestrator for scraping all RIZIN Fighting Federation data from Sherdog
 *
 * This script:
 * 1. Scrapes sherdog.com/organizations/Rizin-Fighting-Federation-10333 for upcoming events
 * 2. Scrapes each event page for fight cards and results
 * 3. Extracts athlete information from fighter profile links
 * 4. Downloads event banners and athlete images
 * 5. Saves all data in structured JSON format
 *
 * Note: Sherdog uses server-rendered HTML, so standard DOM parsing works well.
 * Fighter images use Sherdog CDN with image_crop paths.
 *
 * Configuration via environment variables:
 * - SCRAPER_MODE: 'manual' (default) or 'automated' (faster, for cron jobs)
 * - SCRAPER_TIMEOUT: Overall timeout in milliseconds (default: 1500000 = 25min)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration based on mode
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '1500000', 10);

// Delays in milliseconds
const DELAYS = {
  manual: {
    betweenEvents: 1500,
    betweenAthletes: 800,
    betweenImages: 500,
  },
  automated: {
    betweenEvents: 500,
    betweenAthletes: 300,
    betweenImages: 200,
  }
};

const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

const SHERDOG_BASE = 'https://www.sherdog.com';
const RIZIN_ORG_URL = `${SHERDOG_BASE}/organizations/Rizin-Fighting-Federation-10333`;

// ========================================
// STEP 1: Scrape Events List from Sherdog
// ========================================
async function scrapeEventsList(browser) {
  console.log('\n📋 STEP 1: Scraping RIZIN events from Sherdog...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  });

  await page.goto(RIZIN_ORG_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for event content to load
  await new Promise(resolve => setTimeout(resolve, 2000));

  const events = await page.evaluate(() => {
    const extractedEvents = [];

    // Sherdog org pages use a tabbed layout:
    //   div.tabbed > div.tab_menu (Upcoming/Recent links)
    //                div.single_tab.active (upcoming events table - visible)
    //                div.single_tab (recent events table - hidden)
    // We only want the active tab (upcoming events).
    const upcomingTab = document.querySelector('.single_tab.active');
    if (!upcomingTab) return extractedEvents;

    const rows = upcomingTab.querySelectorAll('tr');

    for (const row of rows) {
      const link = row.querySelector('a[href*="/events/"]');
      if (!link) continue;

      const href = link.getAttribute('href') || '';
      if (!href.includes('/events/')) continue;

      const eventName = (link.textContent || '').trim();
      if (!eventName) continue;

      const eventUrl = href.startsWith('http') ? href : `https://www.sherdog.com${href}`;

      // Extract date from the row
      const dateSpans = row.querySelectorAll('span.month, span.day, span[class]');
      let dateText = '';

      if (dateSpans.length >= 2) {
        const parts = [];
        dateSpans.forEach(span => {
          const text = (span.textContent || '').trim();
          if (text) parts.push(text);
        });
        dateText = parts.join(' ');
      }

      // Fallback: try to get date from the first TD
      if (!dateText) {
        const tds = row.querySelectorAll('td');
        if (tds.length > 0) {
          dateText = (tds[0].textContent || '').trim();
        }
      }

      // Extract location from last TD
      let location = '';
      const tds = row.querySelectorAll('td');
      if (tds.length >= 3) {
        location = (tds[tds.length - 1].textContent || '').trim();
      }

      const locationParts = location.split(',').map(p => p.trim());
      const venue = locationParts[0] || '';
      const city = locationParts.length > 1 ? locationParts.slice(0, -1).join(', ') : '';
      const country = locationParts.length > 1 ? locationParts[locationParts.length - 1] : '';

      extractedEvents.push({
        eventName,
        eventUrl,
        dateText,
        venue,
        city,
        country,
        eventImageUrl: null,
      });
    }

    return extractedEvents;
  });

  await page.close();

  // Deduplicate by URL
  const uniqueEvents = [];
  const seenUrls = new Set();
  for (const event of events) {
    if (!seenUrls.has(event.eventUrl)) {
      seenUrls.add(event.eventUrl);
      uniqueEvents.push(event);
    }
  }

  console.log(`✅ Found ${uniqueEvents.length} upcoming RIZIN events\n`);
  return uniqueEvents;
}

// ========================================
// STEP 2: Scrape Individual Event Pages
// ========================================
async function scrapeEventPage(browser, eventUrl, eventName) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  });

  try {
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const eventData = await page.evaluate(() => {
      let eventImageUrl = null;
      const allFights = [];
      let globalOrder = 1;
      let eventDate = null;
      let eventVenue = '';
      let eventLocation = '';

      // Get event banner/image from og:image meta tag
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        eventImageUrl = ogImage.content;
      }

      // Extract event date from the info section
      // Sherdog event pages show date in various formats
      const dateElements = document.querySelectorAll('.authors_info .date, .info .date, [itemprop="startDate"], .event_date');
      for (const el of dateElements) {
        const text = (el.textContent || '').trim();
        if (text) {
          eventDate = el.getAttribute('content') || text;
          break;
        }
      }

      // Fallback: look for date in meta tags
      if (!eventDate) {
        const metaDate = document.querySelector('meta[itemprop="startDate"], meta[property="event:start_time"]');
        if (metaDate) {
          eventDate = metaDate.getAttribute('content');
        }
      }

      // Fallback: look for date text in the info section
      if (!eventDate) {
        const infoSection = document.querySelector('.authors_info, .event_detail, .info');
        if (infoSection) {
          const text = (infoSection.textContent || '');
          const dateMatch = text.match(/(\w{3}\s+\d{1,2},?\s+\d{4})/);
          if (dateMatch) {
            eventDate = dateMatch[1];
          }
        }
      }

      // Extract venue/location
      const venueEl = document.querySelector('.authors_info .location, [itemprop="location"], .event_detail .location');
      if (venueEl) {
        const text = (venueEl.textContent || '').trim();
        const parts = text.split(',').map(p => p.trim());
        eventVenue = parts[0] || '';
        eventLocation = text;
      }

      // ==========================================
      // Parse fight card - Sherdog fight structure
      // ==========================================

      // Sherdog uses various selectors for fight cards:
      // - .fight_card (main container)
      // - .module.fight_card for sections
      // - table.fight_results or similar for fight rows
      // - Individual fight sections with fighter info

      // Strategy: find all fight-related sections/rows
      const fightSections = document.querySelectorAll(
        '.fight_card .content tr, ' +
        'section.fight_card tr, ' +
        '.module.fight_card tr, ' +
        'table tr[itemprop="subEvent"], ' +
        '.fightcard tr, ' +
        '.event-fights tr'
      );

      // Also try to find the main event separately
      // Sherdog often has the main event in a special section
      const mainEventSection = document.querySelector(
        '.fight_card .header, ' +
        '.module.event_match, ' +
        '.fight_card .main_event, ' +
        '.module.fight_card'
      );

      // Helper to extract fighter data from a fight element
      // Parse fighter name from Sherdog URL slug (e.g. "/fighter/Saori-Oshima-361683")
      // This is more reliable than textContent which often concatenates without spaces
      function parseNameFromUrl(url) {
        const slug = url.split('/').filter(Boolean).pop() || '';
        // Remove trailing numeric ID: "Saori-Oshima-361683" → "Saori-Oshima"
        const withoutId = slug.replace(/-\d+$/, '');
        if (!withoutId) return null;
        // Split by hyphens and capitalize each part
        const parts = withoutId.split('-').map(p =>
          p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
        );
        if (parts.length === 0) return null;
        return {
          fullName: parts.join(' '),
          firstName: parts.length > 1 ? parts[0] : '',
          lastName: parts.length > 1 ? parts.slice(1).join(' ') : parts[0],
        };
      }

      function extractFighterFromElement(el) {
        if (!el) return null;

        // Find fighter name link
        const nameLink = el.querySelector('a[href*="/fighter/"]');
        if (!nameLink) return null;

        const rawName = (nameLink.textContent || '').trim();
        const athleteUrl = nameLink.getAttribute('href') || '';
        const fullAthleteUrl = athleteUrl.startsWith('http') ? athleteUrl : `https://www.sherdog.com${athleteUrl}`;

        // Sherdog's fight card HTML often concatenates names without spaces
        // (e.g. "SaoriOshima" instead of "Saori Oshima"), so parse from URL slug
        const urlParsed = parseNameFromUrl(athleteUrl);
        const name = (rawName.includes(' ') ? rawName : (urlParsed ? urlParsed.fullName : rawName));

        // Extract record (W-L-D format)
        let record = '';
        const recordEl = el.querySelector('.record, .fighter_record, span[title]');
        if (recordEl) {
          record = (recordEl.textContent || '').trim();
        }
        // Fallback: look for W-L-D pattern in text
        if (!record) {
          const text = (el.textContent || '');
          const recordMatch = text.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})/);
          if (recordMatch) {
            record = recordMatch[0];
          }
        }

        // Extract fighter image
        let imageUrl = null;
        const img = el.querySelector('img[src*="image_crop"], img[src*="/fighter/"], img.profile_image, img.lazy, img[data-src]');
        if (img) {
          imageUrl = img.getAttribute('data-src') || img.getAttribute('src') || null;
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `https://www.sherdog.com${imageUrl}`;
          }
          // Skip placeholder images
          if (imageUrl && (imageUrl.includes('placeholder') || imageUrl.includes('no_photo'))) {
            imageUrl = null;
          }
        }

        // Parse name into parts (handle nicknames in quotes)
        let firstName = '';
        let lastName = '';
        let nickname = '';

        // Handle "First 'Nickname' Last" pattern
        const nicknameMatch = name.match(/^(.+?)\s*['"](.+?)['"]\s*(.+)$/);
        if (nicknameMatch) {
          firstName = nicknameMatch[1].trim();
          nickname = nicknameMatch[2].trim();
          lastName = nicknameMatch[3].trim();
        } else if (urlParsed && !rawName.includes(' ')) {
          // textContent had no spaces — use URL-parsed name
          firstName = urlParsed.firstName;
          lastName = urlParsed.lastName;
        } else {
          const nameParts = name.split(/\s+/);
          if (nameParts.length === 1) {
            firstName = '';
            lastName = nameParts[0];
          } else {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          }
        }

        return {
          name,
          firstName,
          lastName,
          nickname,
          record,
          imageUrl,
          athleteUrl: fullAthleteUrl,
          country: '',
        };
      }

      // ==========================================
      // Try multiple parsing strategies
      // ==========================================

      // Strategy 1: Look for structured fight sections with left/right fighters
      const fightElements = document.querySelectorAll(
        '.module.fight_card, ' +
        'section[itemtype*="Event"], ' +
        '.fightcard .fight, ' +
        '.event-fights .fight'
      );

      // Strategy 2: Parse table rows (most common Sherdog pattern)
      const fightRows = document.querySelectorAll(
        'tr.even, tr.odd, ' +
        'tr[itemprop="subEvent"], ' +
        '.fight_card tbody tr, ' +
        'table.new_table tbody tr'
      );

      for (const row of fightRows) {
        // Each fight row on Sherdog typically has fighter columns
        const fighterLinks = row.querySelectorAll('a[href*="/fighter/"]');
        if (fighterLinks.length < 2) continue;

        // Get the two fighter containers (left and right)
        const cols = row.querySelectorAll('td');

        let fighterA = null;
        let fighterB = null;

        if (cols.length >= 2) {
          // First fighter column
          fighterA = extractFighterFromElement(cols[0]) || extractFighterFromElement(cols[1]);
          // Second fighter column (usually last or second-to-last)
          fighterB = extractFighterFromElement(cols[cols.length - 1]) || extractFighterFromElement(cols[cols.length - 2]);

          // Avoid duplicating same fighter
          if (fighterA && fighterB && fighterA.athleteUrl === fighterB.athleteUrl) {
            // Try different columns
            for (let i = 0; i < cols.length; i++) {
              const candidate = extractFighterFromElement(cols[i]);
              if (candidate && candidate.athleteUrl !== fighterA.athleteUrl) {
                fighterB = candidate;
                break;
              }
            }
          }
        }

        if (!fighterA || !fighterB) continue;
        if (fighterA.athleteUrl === fighterB.athleteUrl) continue;

        // Extract weight class
        let weightClass = '';
        const wcEl = row.querySelector('.weight_class, .division, .weight-class');
        if (wcEl) {
          weightClass = (wcEl.textContent || '').trim();
        }
        // Fallback: search in row text
        if (!weightClass) {
          const rowText = (row.textContent || '');
          const wcMatch = rowText.match(/(Heavyweight|Light Heavyweight|Middleweight|Welterweight|Lightweight|Featherweight|Bantamweight|Flyweight|Strawweight|Super Heavyweight|Atomweight|Open Weight)/i);
          if (wcMatch) {
            weightClass = wcMatch[1];
          }
        }

        // Check for title fight
        const rowText = (row.textContent || '').toLowerCase();
        const isTitle = rowText.includes('title') || rowText.includes('championship') || rowText.includes('grand prix');

        // Extract result data (for completed fights)
        let method = '';
        let round = '';
        let time = '';
        let winner = '';

        const methodEl = row.querySelector('.method, .win_type, td:nth-child(4), .result_method');
        if (methodEl) {
          method = (methodEl.textContent || '').trim();
        }

        const roundEl = row.querySelector('.round, td:nth-child(5), .result_round');
        if (roundEl) {
          const roundText = (roundEl.textContent || '').trim();
          const roundMatch = roundText.match(/(\d+)/);
          if (roundMatch) {
            round = roundMatch[1];
          }
        }

        const timeEl = row.querySelector('.time, td:nth-child(6), .result_time');
        if (timeEl) {
          time = (timeEl.textContent || '').trim();
        }

        // Check for winner indication (bold, win class, etc.)
        const winIndicators = row.querySelectorAll('.win, .winner, .final_result');
        if (winIndicators.length > 0) {
          const winEl = winIndicators[0];
          const closestFighter = winEl.closest('td');
          if (closestFighter) {
            const winnerLink = closestFighter.querySelector('a[href*="/fighter/"]');
            if (winnerLink) {
              winner = (winnerLink.textContent || '').trim();
            }
          }
        }

        allFights.push({
          fightId: `rizin-fight-${globalOrder}`,
          order: globalOrder++,
          cardType: 'Main Card',
          weightClass,
          isTitle,
          fighterA: {
            name: fighterA.name,
            firstName: fighterA.firstName,
            lastName: fighterA.lastName,
            nickname: fighterA.nickname,
            record: fighterA.record,
            country: fighterA.country,
            imageUrl: fighterA.imageUrl,
            athleteUrl: fighterA.athleteUrl,
            rank: '',
            odds: ''
          },
          fighterB: {
            name: fighterB.name,
            firstName: fighterB.firstName,
            lastName: fighterB.lastName,
            nickname: fighterB.nickname,
            record: fighterB.record,
            country: fighterB.country,
            imageUrl: fighterB.imageUrl,
            athleteUrl: fighterB.athleteUrl,
            rank: '',
            odds: ''
          },
          result: {
            method,
            round,
            time,
            winner
          }
        });
      }

      // Strategy 3: If table rows didn't work, try div-based fight cards
      if (allFights.length === 0) {
        const fightDivs = document.querySelectorAll(
          '.fight, .bout, .matchup, ' +
          '[itemtype*="SportsEvent"], ' +
          '.resume'
        );

        for (const div of fightDivs) {
          const fighterLinks = div.querySelectorAll('a[href*="/fighter/"]');
          if (fighterLinks.length < 2) continue;

          // Get the parent containers for each fighter
          const fighterContainers = [];
          const seenUrls = new Set();

          fighterLinks.forEach(link => {
            const url = link.getAttribute('href') || '';
            if (seenUrls.has(url)) return;
            seenUrls.add(url);

            const container = link.closest('div, td, span, li') || link.parentElement;
            fighterContainers.push(container);
          });

          if (fighterContainers.length < 2) continue;

          const fighterA = extractFighterFromElement(fighterContainers[0]);
          const fighterB = extractFighterFromElement(fighterContainers[1]);

          if (!fighterA || !fighterB) continue;
          if (fighterA.athleteUrl === fighterB.athleteUrl) continue;

          // Extract weight class from the div
          let weightClass = '';
          const wcEl = div.querySelector('.weight_class, .division, .weight-class');
          if (wcEl) {
            weightClass = (wcEl.textContent || '').trim();
          }
          if (!weightClass) {
            const divText = (div.textContent || '');
            const wcMatch = divText.match(/(Heavyweight|Light Heavyweight|Middleweight|Welterweight|Lightweight|Featherweight|Bantamweight|Flyweight|Strawweight|Super Heavyweight|Atomweight|Open Weight)/i);
            if (wcMatch) {
              weightClass = wcMatch[1];
            }
          }

          const divText = (div.textContent || '').toLowerCase();
          const isTitle = divText.includes('title') || divText.includes('championship') || divText.includes('grand prix');

          allFights.push({
            fightId: `rizin-fight-${globalOrder}`,
            order: globalOrder++,
            cardType: 'Main Card',
            weightClass,
            isTitle,
            fighterA: {
              name: fighterA.name,
              firstName: fighterA.firstName,
              lastName: fighterA.lastName,
              nickname: fighterA.nickname,
              record: fighterA.record,
              country: fighterA.country,
              imageUrl: fighterA.imageUrl,
              athleteUrl: fighterA.athleteUrl,
              rank: '',
              odds: ''
            },
            fighterB: {
              name: fighterB.name,
              firstName: fighterB.firstName,
              lastName: fighterB.lastName,
              nickname: fighterB.nickname,
              record: fighterB.record,
              country: fighterB.country,
              imageUrl: fighterB.imageUrl,
              athleteUrl: fighterB.athleteUrl,
              rank: '',
              odds: ''
            },
            result: {
              method: '',
              round: '',
              time: '',
              winner: ''
            }
          });
        }
      }

      return {
        eventImageUrl,
        eventDate,
        eventVenue,
        eventLocation,
        fights: allFights,
        hasFightCard: allFights.length > 0
      };
    });

    await page.close();

    if (!eventData.hasFightCard || eventData.fights.length === 0) {
      console.log(`   ⏭️  Skipping ${eventName} (no fight card found)`);
      return { skipped: true, reason: 'No fight card' };
    }

    console.log(`   ✅ Scraped ${eventData.fights.length} fights`);
    return eventData;

  } catch (error) {
    await page.close();
    console.log(`   ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

// ========================================
// STEP 3: Scrape Athlete Pages from Sherdog
// ========================================
async function scrapeAthletePage(browser, athleteUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(athleteUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const athleteData = await page.evaluate(() => {
      let record = null;
      let headshotUrl = null;
      let nickname = '';
      let weightClass = '';
      let country = '';

      // Extract fighter image (Sherdog uses profile images)
      const profileImg = document.querySelector(
        '.profile_image img, ' +
        'img[itemprop="image"], ' +
        '.fighter-image img, ' +
        '.bio_fighter img, ' +
        '.fighter_info img'
      );
      if (profileImg) {
        headshotUrl = profileImg.getAttribute('src') || profileImg.getAttribute('data-src') || null;
        if (headshotUrl && !headshotUrl.startsWith('http')) {
          headshotUrl = `https://www.sherdog.com${headshotUrl}`;
        }
        // Skip placeholder images
        if (headshotUrl && (headshotUrl.includes('placeholder') || headshotUrl.includes('no_photo'))) {
          headshotUrl = null;
        }
      }

      // Extract record from bio section
      // Sherdog shows record as "Wins X Losses X" or "X-X-X" format
      const bioSection = document.querySelector(
        '.bio_graph, ' +
        '.record, ' +
        '.fighter-record, ' +
        '.bio_fighter'
      );

      if (bioSection) {
        // Look for wins/losses/draws elements
        const winsEl = bioSection.querySelector('.wins span, .win span, .counter');
        const lossesEl = bioSection.querySelector('.losses span, .lose span');
        const drawsEl = bioSection.querySelector('.draws span, .draw span');

        if (winsEl && lossesEl) {
          const wins = (winsEl.textContent || '').trim();
          const losses = (lossesEl.textContent || '').trim();
          const draws = drawsEl ? (drawsEl.textContent || '').trim() : '0';
          record = `${wins}-${losses}-${draws}`;
        }
      }

      // Fallback: look for W-L-D pattern in page text
      if (!record) {
        const recordEl = document.querySelector('.record_with_nc, .association_record, [class*="record"]');
        if (recordEl) {
          const text = (recordEl.textContent || '');
          const match = text.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})/);
          if (match) {
            record = match[0];
          }
        }
      }

      // Extract nickname
      const nicknameEl = document.querySelector('.nickname, .fighter_nickname, [itemprop="alternateName"]');
      if (nicknameEl) {
        nickname = (nicknameEl.textContent || '').trim().replace(/^["']|["']$/g, '');
      }

      // Extract weight class
      const wcEl = document.querySelector('.weight_class, .association_class, [class*="class"]');
      if (wcEl) {
        weightClass = (wcEl.textContent || '').trim();
      }

      // Extract country/nationality
      const nationalityEl = document.querySelector('.nationality, [itemprop="nationality"], .item.birthplace');
      if (nationalityEl) {
        country = (nationalityEl.textContent || '').trim();
      }

      return {
        record,
        headshotUrl,
        nickname,
        weightClass,
        country
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
          try { await page.close(); } catch (e) { /* ignore */ }
        }

        return filepath;
      } else {
        throw new Error(`Failed to download: ${response ? response.status() : 'No response'}`);
      }
    } catch (error) {
      lastError = error;

      if (page && !page.isClosed()) {
        try { await page.close(); } catch (e) { /* ignore */ }
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
  console.log('\n🚀 Starting RIZIN Data Scraping Orchestrator (Sherdog)\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });

  try {
    // STEP 1: Get events list
    const events = await scrapeEventsList(browser);

    // STEP 2: Scrape each event
    console.log('\n📊 STEP 2: Scraping individual event pages...\n');
    const allEventData = [];
    const uniqueAthletes = new Map(); // athleteUrl -> athlete data

    for (const event of events) {
      const eventName = event.eventName || 'Unknown Event';
      console.log(`📄 ${eventName}`);
      const eventData = await scrapeEventPage(browser, event.eventUrl, eventName);

      if (eventData.skipped || eventData.error) {
        continue;
      }

      // Merge event data
      const completeEventData = {
        ...event,
        ...eventData,
        // Override date from event page if available
        dateText: eventData.eventDate || event.dateText,
        venue: eventData.eventVenue || event.venue,
        eventImageUrl: eventData.eventImageUrl || event.eventImageUrl,
      };

      allEventData.push(completeEventData);

      // Collect unique athletes
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          if (fight.fighterA.athleteUrl && !uniqueAthletes.has(fight.fighterA.athleteUrl)) {
            uniqueAthletes.set(fight.fighterA.athleteUrl, {
              name: fight.fighterA.name,
              firstName: fight.fighterA.firstName,
              lastName: fight.fighterA.lastName,
              nickname: fight.fighterA.nickname,
              record: fight.fighterA.record,
              url: fight.fighterA.athleteUrl,
              imageUrl: fight.fighterA.imageUrl,
              country: fight.fighterA.country,
            });
          }
          if (fight.fighterB.athleteUrl && !uniqueAthletes.has(fight.fighterB.athleteUrl)) {
            uniqueAthletes.set(fight.fighterB.athleteUrl, {
              name: fight.fighterB.name,
              firstName: fight.fighterB.firstName,
              lastName: fight.fighterB.lastName,
              nickname: fight.fighterB.nickname,
              record: fight.fighterB.record,
              url: fight.fighterB.athleteUrl,
              imageUrl: fight.fighterB.imageUrl,
              country: fight.fighterB.country,
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Scrape athlete pages for additional data
    console.log(`\n\n👤 STEP 3: Processing ${uniqueAthletes.size} unique athletes...\n`);

    let athleteCount = 0;
    for (const [url, athlete] of uniqueAthletes) {
      // Only fetch athlete page if we're missing image or record
      if (!athlete.imageUrl || !athlete.record) {
        athleteCount++;
        console.log(`   ${athleteCount}/${uniqueAthletes.size} ${athlete.name} (fetching details)`);
        const athleteData = await scrapeAthletePage(browser, url);

        if (!athleteData.error) {
          uniqueAthletes.set(url, {
            ...athlete,
            record: athleteData.record || athlete.record,
            imageUrl: athleteData.headshotUrl || athlete.imageUrl,
            nickname: athleteData.nickname || athlete.nickname,
            country: athleteData.country || athlete.country,
          });
        }

        await new Promise(resolve => setTimeout(resolve, delays.betweenAthletes));
      }
    }
    console.log(`   Fetched additional data for ${athleteCount} athletes`);

    // STEP 4: Download images
    console.log('\n\n🖼️  STEP 4: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/rizin');
    const athleteImagesDir = path.join(imagesDir, 'athletes/rizin');

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
        const slug = event.eventUrl.split('/').filter(Boolean).pop() || 'unknown';
        const filename = `${slug}.jpg`;
        const filepath = path.join(eventImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, event.eventImageUrl, filepath);
            event.localImagePath = `/images/events/rizin/${filename}`;
            console.log(`      ✅ ${filename}`);
            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/rizin/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete images
    console.log('\n   Athlete images:');
    let downloadCount = 0;

    for (const [url, athlete] of uniqueAthletes) {
      if (athlete.imageUrl) {
        // Generate slug from athlete URL or name
        const urlSlug = url.split('/').filter(Boolean).pop() || '';
        const nameSlug = athlete.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const slug = urlSlug || nameSlug;
        const filename = `${slug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, athlete.imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/rizin/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename}`);
            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/rizin/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/rizin');
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
  console.log(`🚀 Starting RIZIN scraper in ${SCRAPER_MODE} mode...`);
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
