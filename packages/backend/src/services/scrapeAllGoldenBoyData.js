/**
 * Master orchestrator for scraping all Golden Boy Promotions data
 *
 * This script:
 * 1. Scrapes goldenboy.com/events for upcoming events
 * 2. Scrapes each event page for fight cards
 * 3. Downloads event banners and athlete images
 * 4. Saves all data in structured JSON format
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
    betweenAthletes: 500,
    betweenImages: 400,
  },
  automated: {
    betweenEvents: 500,
    betweenAthletes: 200,
    betweenImages: 100,
  }
};

const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

// ========================================
// STEP 1: Scrape Events List
// ========================================
async function scrapeEventsList(browser) {
  console.log('\n📋 STEP 1: Scraping Golden Boy events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto('https://www.goldenboy.com/events/', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for dynamic content to load
  await new Promise(resolve => setTimeout(resolve, 3000));

  const events = await page.evaluate(() => {
    const extractedEvents = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Month name mappings
    const months = {
      'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
      'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
      'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
      'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
    };

    // Golden Boy uses WordPress - look for event links
    // Event URLs follow pattern: /the-event/[slug]/
    const eventLinks = document.querySelectorAll('a[href*="/the-event/"]');
    const processedUrls = new Set();

    eventLinks.forEach(link => {
      const href = link.getAttribute('href') || '';

      // Skip if not a valid event detail page
      if (!href.includes('/the-event/') || href === '/the-event/') return;

      // Build full URL
      const eventUrl = href.startsWith('http') ? href : `https://www.goldenboy.com${href}`;

      // Skip duplicates
      if (processedUrls.has(eventUrl)) return;
      processedUrls.add(eventUrl);

      // Extract event slug from URL
      const urlParts = eventUrl.split('/the-event/');
      if (urlParts.length < 2) return;
      const eventSlug = urlParts[1].replace(/\/$/, '');

      if (!eventSlug) return;

      // Skip sub-pages (schedule, tickets, results, etc.) - these are not event pages
      const subPagePatterns = ['/fight-week-schedule', '/schedule', '/tickets', '/results', '/media', '/gallery', '/photos'];
      if (subPagePatterns.some(pattern => eventSlug.includes(pattern.replace('/', '')))) {
        return;
      }
      // Also skip if slug contains a slash (indicates a sub-page)
      if (eventSlug.includes('/')) {
        return;
      }

      // Try to find the event card container
      const container = link.closest('[class*="event"]') ||
                       link.closest('[class*="card"]') ||
                       link.closest('article') ||
                       link.parentElement?.parentElement?.parentElement;

      // Parse event name from slug
      // Slug format: "jan-26-rocha-vs-curiel-flores-vs-chavez"
      let eventName = 'Golden Boy: ';
      const slugParts = eventSlug.split('-');

      // Check if first part is a month
      const firstPart = slugParts[0]?.toLowerCase();
      let dateFromSlug = '';
      let eventDate = null;

      if (months[firstPart] !== undefined) {
        // Format: "jan-26-fighter1-vs-fighter2"
        const monthNum = months[firstPart];
        const dayNum = parseInt(slugParts[1], 10);

        // Determine year - if date is in the past, assume next year
        let year = now.getFullYear();
        let testDate = new Date(year, monthNum, dayNum);
        testDate.setHours(0, 0, 0, 0);
        if (testDate < now) {
          year = now.getFullYear() + 1;
        }

        eventDate = new Date(year, monthNum, dayNum);
        eventDate.setHours(0, 0, 0, 0);

        dateFromSlug = `${slugParts[0].charAt(0).toUpperCase() + slugParts[0].slice(1)} ${slugParts[1]}, ${year}`;
        eventName += slugParts.slice(2).map(word => {
          if (word.toLowerCase() === 'vs') return 'vs.';
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      } else {
        eventName += slugParts.map(word => {
          if (word.toLowerCase() === 'vs') return 'vs.';
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      }

      // Extract date from container text or page content
      let dateText = dateFromSlug;

      if (container) {
        const containerText = container.textContent || '';

        // Pattern: "Jan 26" or "January 26, 2025"
        const dateMatch = containerText.match(/([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
        if (dateMatch) {
          const monthStr = dateMatch[1].toLowerCase().substring(0, 3);
          const day = parseInt(dateMatch[2], 10);
          let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();

          const month = months[monthStr];
          if (month !== undefined) {
            eventDate = new Date(year, month, day);
            eventDate.setHours(0, 0, 0, 0);

            // If date is in the past and no year provided, try next year
            if (!dateMatch[3] && eventDate < now) {
              eventDate = new Date(year + 1, month, day);
              year = year + 1;
            }

            dateText = `${dateMatch[1]} ${dateMatch[2]}, ${year}`;
          }
        }
      }

      // Skip past events
      if (eventDate && eventDate < now) {
        return;
      }

      // Extract event image
      let eventImageUrl = null;
      if (container) {
        const imgEl = container.querySelector('img');
        if (imgEl) {
          eventImageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src') || null;
        }
      }

      // Try to extract venue/location from container
      let venue = '';
      let city = '';
      let state = '';
      let country = 'USA';

      if (container) {
        const containerText = container.textContent || '';
        // Look for venue patterns like "Acrisure Arena | Palm Desert, CA"
        const venueMatch = containerText.match(/([A-Za-z\s]+(?:Arena|Center|Centre|Hall|Stadium|Garden|Pavilion|Casino|Resort))[,\s|]+([A-Za-z\s]+),?\s*([A-Z]{2})?/i);
        if (venueMatch) {
          venue = venueMatch[1]?.trim() || '';
          city = venueMatch[2]?.trim() || '';
          state = venueMatch[3]?.trim() || '';
        }
      }

      extractedEvents.push({
        eventName,
        eventType: 'Boxing',
        eventUrl,
        eventSlug,
        venue,
        city,
        state,
        country,
        dateText,
        eventDate: eventDate ? eventDate.toISOString() : null,
        eventImageUrl,
        status: 'Upcoming'
      });
    });

    return extractedEvents;
  });

  await page.close();

  console.log(`✅ Found ${events.length} upcoming Golden Boy events\n`);
  return events;
}

// ========================================
// STEP 2: Scrape Individual Event Pages
// ========================================
async function scrapeEventPage(browser, eventUrl, eventSlug) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 4000));

    const eventData = await page.evaluate(() => {
      // Extract event banner image
      let eventImageUrl = null;

      // Try og:image meta tag first
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        eventImageUrl = ogImage.content;
      }

      // Try hero/banner images if no og:image
      if (!eventImageUrl) {
        const bannerSelectors = [
          '.hero img',
          '.event-banner img',
          '.banner img',
          'header img',
          '.featured-image img',
          'img[src*="event"]',
          'img[src*="banner"]',
          'img[src*="hero"]'
        ];

        for (const selector of bannerSelectors) {
          const imgEl = document.querySelector(selector);
          if (imgEl && imgEl.src) {
            eventImageUrl = imgEl.src;
            break;
          }
        }
      }

      // Extract venue and location info
      let venue = '';
      let city = '';
      let state = '';
      const pageText = document.body.innerText || '';

      // Look for venue patterns
      const venuePatterns = [
        /([A-Za-z\s]+(?:Arena|Center|Centre|Hall|Stadium|Garden|Pavilion|Casino|Resort))[,\s|]+([A-Za-z\s]+),?\s*([A-Z]{2})/gi,
        /Venue:\s*([^\n]+)/gi,
        /Location:\s*([^\n]+)/gi
      ];

      for (const pattern of venuePatterns) {
        const match = pageText.match(pattern);
        if (match) {
          const fullMatch = match[0];
          const parts = fullMatch.split(/[,|]/);
          if (parts.length >= 2) {
            venue = parts[0]?.trim() || '';
            city = parts[1]?.trim() || '';
            state = parts[2]?.trim() || '';
          }
          break;
        }
      }

      // Extract event date and time
      let eventStartTime = null;
      const timeMatch = pageText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);
      if (timeMatch) {
        eventStartTime = timeMatch[1].toUpperCase();
      }

      // Helper to check if a string is a valid fighter name
      function isValidFighterName(name) {
        if (!name || name.length < 2 || name.length > 50) return false;

        const invalidPatterns = [
          /^view\s/i, /^more\s/i, /^loser/i, /^winner/i,
          /^stats$/i, /^info$/i, /^main\s*event/i, /^undercard/i,
          /^round\s*\d/i, /^r\d$/i, /submission/i, /decision/i,
          /knockout/i, /^ko$/i, /^tko$/i, /^unanimous/i,
          /^split$/i, /^majority$/i, /^draw$/i, /^nc$/i,
          /buy\s*now/i, /ticket/i, /matchup/i, /result/i,
          /championship/i, /title\s*bout/i, /^vs\.?$/i,
          /^\d+$/,
          /^[A-Z]{2,3}$/,
          /lightweight/i, /welterweight/i, /heavyweight/i,
          /featherweight/i, /bantamweight/i, /flyweight/i,
          /middleweight/i, /women's/i, /men's/i,
          /^main$/i, /^card$/i, /^bout$/i, /^fight$/i,
          /days?$/i, /hours?$/i, /mins?$/i, /sec$/i,
          /watch/i, /event/i, /free/i, /^see\s/i,
          /dazn/i, /stream/i, /tickets?$/i, /weigh-in/i,
          /^\d+\s*rounds?$/i, /^super\s/i, /^junior\s/i
        ];

        for (const pattern of invalidPatterns) {
          if (pattern.test(name)) return false;
        }

        if (!/[a-zA-Z]/.test(name)) return false;

        return true;
      }

      // Helper to clean fighter name
      function cleanFighterName(name) {
        if (!name) return '';

        // Decode URL-encoded characters (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
        let decodedName = name;
        try {
          if (/%[0-9A-Fa-f]{2}/.test(name)) {
            decodedName = decodeURIComponent(name);
          }
        } catch (e) {
          decodedName = name;
        }

        return decodedName
          .replace(/\s*\(c\)/gi, '')
          .replace(/\s*#\d+/g, '')
          .replace(/"\s*[^"]+\s*"/g, '') // Remove nicknames in quotes for now
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Helper to extract nickname from name
      function extractNickname(name) {
        const nicknameMatch = name.match(/"([^"]+)"/);
        return nicknameMatch ? nicknameMatch[1] : null;
      }

      // Extract fights from the page
      const allFights = [];
      let globalOrder = 1;
      const processedPairs = new Set();

      // Strategy 1: Look for bout-fighter-name elements (Golden Boy specific structure)
      // Golden Boy uses accordion sections with:
      // - h5.bout-fighter-name for fighter names
      // - p.record for records
      // - img.bout-fighter-img-red / img.bout-fighter-img-blue for images
      // - img.flags for country flags
      const fighterData = [];

      // Find all accordion sections (each bout has two - red and blue corners)
      const accordionButtons = document.querySelectorAll('.accordion-button, [data-bs-toggle="collapse"]');

      accordionButtons.forEach(accordion => {
        // Get fighter name from h5.bout-fighter-name
        const nameEl = accordion.querySelector('h5.bout-fighter-name, h5[class*="bout-fighter"]');
        if (!nameEl) return;

        const text = nameEl.textContent?.trim() || '';
        if (text.length < 3 || text.length > 60) return;
        if (/rounds?|bout|event|championship|title|weigh|result/i.test(text)) return;

        // Extract nickname if present
        const nicknameMatch = text.match(/"([^"]+)"/);
        const nickname = nicknameMatch ? nicknameMatch[1] : null;

        // Clean name - remove nickname quotes and normalize whitespace
        const cleanName = text.replace(/"[^"]+"\s*/, '').replace(/\s+/g, ' ').trim();

        // Get record from p.record element
        let record = '';
        const recordEl = accordion.querySelector('p.record, p[class*="record"]');
        if (recordEl) {
          record = recordEl.textContent?.trim() || '';
        }

        // Get country from flag image
        let country = '';
        const flagImg = nameEl.querySelector('img.flags, img[class*="flag"]') ||
                       accordion.querySelector('img.flags, img[class*="flag"]');
        if (flagImg) {
          country = flagImg.getAttribute('data-bs-original-title') ||
                   flagImg.title ||
                   flagImg.alt || '';
        }

        // Determine if red or blue corner based on class
        const isRedCorner = accordion.className.includes('red') ||
                           accordion.className.includes('accordian-button-red');
        const isBlueCorner = accordion.className.includes('blue') ||
                            accordion.className.includes('accordian-button-blue');

        // Get fighter image - look in the parent container or nearby elements
        let imageUrl = null;
        const parentSection = accordion.closest('.accordion-item, [class*="bout"], section, article') ||
                             accordion.parentElement?.parentElement;

        if (parentSection) {
          // Look for the specific fighter image class
          if (isRedCorner) {
            const img = parentSection.querySelector('img.bout-fighter-img-red, img[class*="fighter-img-red"]');
            if (img) imageUrl = img.src || img.getAttribute('data-src');
          } else if (isBlueCorner) {
            const img = parentSection.querySelector('img.bout-fighter-img-blue, img[class*="fighter-img-blue"]');
            if (img) imageUrl = img.src || img.getAttribute('data-src');
          }

          // Fallback: look for any fighter profile image
          if (!imageUrl) {
            const imgs = parentSection.querySelectorAll('img[src*="fighter-profile"], img[class*="bout-fighter-img"]');
            imgs.forEach((img, idx) => {
              if (!imageUrl && img.src) {
                // Try to match image to fighter by checking if image URL contains part of name
                const src = img.src.toLowerCase();
                const nameLower = cleanName.toLowerCase().split(' ').pop(); // last name
                if (src.includes(nameLower.replace(/[^a-z]/g, ''))) {
                  imageUrl = img.src;
                }
              }
            });
          }
        }

        if (cleanName && isValidFighterName(cleanName)) {
          fighterData.push({
            name: cleanName,
            nickname,
            imageUrl,
            record,
            country,
            corner: isRedCorner ? 'red' : (isBlueCorner ? 'blue' : 'unknown')
          });
        }
      });

      // Fallback: Also check h5 elements directly if accordion approach found nothing
      if (fighterData.length === 0) {
        const h5Elements = document.querySelectorAll('h5');

        h5Elements.forEach(h5 => {
          const text = h5.textContent?.trim() || '';
          if (text.length < 3 || text.length > 60) return;
          if (/^\d+/.test(text)) return;
          if (/rounds?|bout|event|championship|title|weigh|result/i.test(text)) return;
          if (!/[A-Z][a-z]/.test(text)) return;

          const nicknameMatch = text.match(/"([^"]+)"/);
          const nickname = nicknameMatch ? nicknameMatch[1] : null;
          const cleanName = text.replace(/"[^"]+"\s*/, '').replace(/\s+/g, ' ').trim();

          let imageUrl = null;
          let record = '';
          let country = '';

          const parent = h5.closest('div, section, article');
          if (parent) {
            const img = parent.querySelector('img[src*="fighter-profile"], img[class*="bout-fighter"]');
            if (img) imageUrl = img.src;

            const recordEl = parent.querySelector('p.record, p[class*="record"]');
            if (recordEl) record = recordEl.textContent?.trim() || '';

            const flagImg = parent.querySelector('img.flags, img[class*="flag"]');
            if (flagImg) country = flagImg.title || flagImg.alt || '';
          }

          if (cleanName && isValidFighterName(cleanName)) {
            fighterData.push({ name: cleanName, nickname, imageUrl, record, country });
          }
        });
      }

      // Get weight class and rounds from page
      // Look for patterns like "NABO NABF | Welterweight | 12 ROUNDS"
      let currentWeightClass = '';
      let currentRounds = 10;
      let isCurrentTitle = false;

      // Find bout headers
      const boutHeaders = [];
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || '';
        if (/\d+\s*ROUNDS?/i.test(text) && text.length < 200) {
          const roundMatch = text.match(/(\d+)\s*ROUNDS?/i);
          const weightMatch = text.match(/(Super\s*)?(Flyweight|Bantamweight|Featherweight|Lightweight|Welterweight|Middleweight|Light\s*Heavyweight|Cruiserweight|Heavyweight)/i);
          if (roundMatch || weightMatch) {
            boutHeaders.push({
              rounds: roundMatch ? parseInt(roundMatch[1], 10) : 10,
              weightClass: weightMatch ? weightMatch[0].trim() : '',
              isTitle: /title|championship|NABO|WBA|WBC|IBF|WBO/i.test(text)
            });
          }
        }
      });

      // Pair fighters into fights (they appear in order on the page)
      for (let i = 0; i < fighterData.length - 1; i += 2) {
        const fighterA = fighterData[i];
        const fighterB = fighterData[i + 1];

        if (!fighterA || !fighterB) continue;
        if (fighterA.name === fighterB.name) continue;

        const pairKey = [fighterA.name, fighterB.name].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        // Get bout info for this fight
        const boutIdx = Math.floor(i / 2);
        const boutInfo = boutHeaders[boutIdx] || {};

        allFights.push({
          fightId: `gb-fight-${globalOrder}`,
          order: globalOrder++,
          cardType: globalOrder <= 2 ? 'Main Card' : 'Undercard',
          weightClass: boutInfo.weightClass || '',
          scheduledRounds: boutInfo.rounds || 10,
          isTitle: boutInfo.isTitle || false,
          fighterA: {
            name: fighterA.name,
            nickname: fighterA.nickname,
            imageUrl: fighterA.imageUrl,
            athleteUrl: '',
            record: fighterA.record || '',
            rank: '',
            country: fighterA.country || '',
            odds: ''
          },
          fighterB: {
            name: fighterB.name,
            nickname: fighterB.nickname,
            imageUrl: fighterB.imageUrl,
            athleteUrl: '',
            record: fighterB.record || '',
            rank: '',
            country: fighterB.country || '',
            odds: ''
          }
        });
      }

      // Strategy 2: If no fights found via h5, look for VS patterns
      if (allFights.length === 0) {
        // Look for elements containing "VS" as separator
        const allElements = document.querySelectorAll('*');
        const vsContainers = [];

        allElements.forEach(el => {
          const text = el.textContent || '';
          // Find elements where VS is a separator between two names
          if (/[A-Z][a-z]+.*\sVS\.?\s.*[A-Z][a-z]+/i.test(text) && text.length < 200) {
            const parent = el.closest('section, article, div');
            if (parent && !vsContainers.includes(parent)) {
              vsContainers.push(parent);
            }
          }
        });

        vsContainers.forEach(container => {
          const text = container.textContent || '';
          // Try to extract fighter names from VS pattern
          const vsMatch = text.match(/([A-Z][a-zA-Z\s"]+?)\s+VS\.?\s+([A-Z][a-zA-Z\s"]+?)(?:\s|$)/i);
          if (vsMatch) {
            let fighterAName = vsMatch[1].replace(/"[^"]+"\s*/, '').trim();
            let fighterBName = vsMatch[2].replace(/"[^"]+"\s*/, '').trim();

            // Clean up names
            fighterAName = cleanFighterName(fighterAName);
            fighterBName = cleanFighterName(fighterBName);

            if (isValidFighterName(fighterAName) && isValidFighterName(fighterBName)) {
              const pairKey = [fighterAName, fighterBName].sort().join('|');
              if (!processedPairs.has(pairKey)) {
                processedPairs.add(pairKey);

                allFights.push({
                  fightId: `gb-fight-${globalOrder}`,
                  order: globalOrder++,
                  cardType: 'Main Card',
                  weightClass: '',
                  scheduledRounds: 10,
                  isTitle: false,
                  fighterA: {
                    name: fighterAName,
                    nickname: null,
                    imageUrl: null,
                    athleteUrl: '',
                    record: '',
                    rank: '',
                    country: '',
                    odds: ''
                  },
                  fighterB: {
                    name: fighterBName,
                    nickname: null,
                    imageUrl: null,
                    athleteUrl: '',
                    record: '',
                    rank: '',
                    country: '',
                    odds: ''
                  }
                });
              }
            }
          }
        });
      }

      // Strategy 3: Look for fighter profile images and extract names from URLs
      if (allFights.length === 0) {
        const profileImages = document.querySelectorAll('img[src*="fighter-profile"], img[class*="fighter"]');
        const fighters = [];

        profileImages.forEach(img => {
          const src = img.src || '';
          // Extract name from image URL
          // Pattern: fighter-profile-main-[name]-1200x1200.png
          const urlMatch = src.match(/fighter[^/]*-([a-z-]+)-\d+x\d+/i);
          if (urlMatch) {
            const nameFromUrl = urlMatch[1].split('-').map(w =>
              w.charAt(0).toUpperCase() + w.slice(1)
            ).join(' ');

            if (isValidFighterName(nameFromUrl)) {
              fighters.push({
                name: nameFromUrl,
                imageUrl: src
              });
            }
          }
        });

        // Pair fighters
        for (let i = 0; i < fighters.length - 1; i += 2) {
          const fighterA = fighters[i];
          const fighterB = fighters[i + 1];

          if (!fighterA || !fighterB) continue;

          const pairKey = [fighterA.name, fighterB.name].sort().join('|');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          allFights.push({
            fightId: `gb-fight-${globalOrder}`,
            order: globalOrder++,
            cardType: globalOrder <= 2 ? 'Main Card' : 'Undercard',
            weightClass: '',
            scheduledRounds: 10,
            isTitle: false,
            fighterA: {
              name: fighterA.name,
              nickname: null,
              imageUrl: fighterA.imageUrl,
              athleteUrl: '',
              record: '',
              rank: '',
              country: '',
              odds: ''
            },
            fighterB: {
              name: fighterB.name,
              nickname: null,
              imageUrl: fighterB.imageUrl,
              athleteUrl: '',
              record: '',
              rank: '',
              country: '',
              odds: ''
            }
          });
        }
      }

      return {
        eventImageUrl,
        eventStartTime,
        venue,
        city,
        state,
        fights: allFights
      };
    });

    await page.close();
    console.log(`   ✅ Scraped ${eventData.fights?.length || 0} fights`);
    return eventData;

  } catch (error) {
    await page.close();
    console.log(`   ❌ Error: ${error.message}`);
    return { error: error.message, fights: [] };
  }
}

// ========================================
// STEP 3: Download Images
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
  console.log('\n🥊 Starting Golden Boy Data Scraping Orchestrator\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // STEP 1: Get events list
    const events = await scrapeEventsList(browser);

    // STEP 2: Scrape each event
    console.log('\n📊 STEP 2: Scraping individual event pages...\n');
    const allEventData = [];
    const uniqueAthletes = new Map();

    for (const event of events) {
      console.log(`📄 ${event.eventName}`);
      const eventData = await scrapeEventPage(browser, event.eventUrl, event.eventSlug);

      // Merge event data
      const completeEventData = {
        ...event,
        ...eventData,
        eventImageUrl: eventData.eventImageUrl || event.eventImageUrl,
        venue: eventData.venue || event.venue,
        city: eventData.city || event.city,
        state: eventData.state || event.state
      };

      allEventData.push(completeEventData);

      // Collect unique athletes
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          if (fight.fighterA.name && !uniqueAthletes.has(fight.fighterA.name)) {
            uniqueAthletes.set(fight.fighterA.name, {
              name: fight.fighterA.name,
              nickname: fight.fighterA.nickname,
              url: fight.fighterA.athleteUrl || '',
              imageUrl: fight.fighterA.imageUrl,
              record: fight.fighterA.record || null
            });
          }
          if (fight.fighterB.name && !uniqueAthletes.has(fight.fighterB.name)) {
            uniqueAthletes.set(fight.fighterB.name, {
              name: fight.fighterB.name,
              nickname: fight.fighterB.nickname,
              url: fight.fighterB.athleteUrl || '',
              imageUrl: fight.fighterB.imageUrl,
              record: fight.fighterB.record || null
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Download images
    console.log('\n\n🖼️  STEP 3: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/goldenboy');
    const athleteImagesDir = path.join(imagesDir, 'athletes/goldenboy');

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
        const filename = `${event.eventSlug}.jpg`;
        const filepath = path.join(eventImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, event.eventImageUrl, filepath);
            event.localImagePath = `/images/events/goldenboy/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/goldenboy/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete images
    console.log('\n   Athlete images:');
    let downloadCount = 0;
    let currentCount = 0;

    const athletesToDownload = Array.from(uniqueAthletes.values()).filter(a => {
      if (!a.imageUrl) return false;
      const athleteSlug = a.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const filename = `${athleteSlug}.png`;
      const filepath = path.join(athleteImagesDir, filename);
      return !fs.existsSync(filepath);
    });

    for (const [name, athlete] of uniqueAthletes) {
      const imageUrl = athlete.imageUrl;
      if (imageUrl) {
        const athleteSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            await downloadImage(browser, imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/goldenboy/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename} (${currentCount}/${athletesToDownload.length})`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/goldenboy/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/goldenboy');
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
  console.log(`🥊 Starting Golden Boy scraper in ${SCRAPER_MODE} mode...`);
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
