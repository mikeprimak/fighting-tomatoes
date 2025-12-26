/**
 * Master orchestrator for scraping all BKFC (Bare Knuckle Fighting Championship) data
 *
 * This script:
 * 1. Scrapes bkfc.com/events for upcoming events
 * 2. Scrapes each event page for fight cards
 * 3. Scrapes fighter profile pages for additional details
 * 4. Downloads event banners and athlete images
 * 5. Saves all data in structured JSON format
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
// HELPER: Parse Fighter Name from URL Slug
// ========================================
/**
 * Parse a fighter name from a URL slug, extracting nickname if present.
 * Examples:
 *   "julian-lane" → { firstName: "Julian", lastName: "Lane", nickname: null }
 *   "lorenzo-the-juggernaut-hunt" → { firstName: "Lorenzo", lastName: "Hunt", nickname: "The Juggernaut" }
 *   "yoel-romero-iqws6" → { firstName: "Yoel", lastName: "Romero", nickname: null } (garbage removed)
 */
function parseFighterNameFromSlug(slug) {
  if (!slug) return { firstName: '', lastName: '', nickname: null, displayName: '' };

  const parts = slug.split('-').filter(p => p.length > 0);
  if (parts.length === 0) return { firstName: '', lastName: '', nickname: null, displayName: '' };

  // Clean garbage characters - remove parts that:
  // 1. Contain digits mixed with letters (e.g., "iqws6")
  // 2. Are single characters that aren't common (like 'o' for O'Brien)
  // 3. Are purely numeric
  const cleanedParts = parts.filter(part => {
    // Remove if contains digits
    if (/\d/.test(part)) return false;
    // Remove if single char (unless it's common like 'o' for O'Something)
    if (part.length === 1 && !['o', 'j', 'c', 'd'].includes(part.toLowerCase())) return false;
    // Remove if looks like garbage (no vowels and more than 2 chars)
    if (part.length > 2 && !/[aeiouAEIOU]/.test(part)) return false;
    return true;
  });

  if (cleanedParts.length === 0) return { firstName: '', lastName: '', nickname: null, displayName: '' };

  // Nickname prefixes that typically start a nickname
  const nicknameStarters = ['the', 'da', 'el', 'la', 'big', 'lil', 'lil\'', 'baby', 'king', 'queen'];

  // Find nickname boundaries
  let nicknameStart = -1;
  let nicknameEnd = -1;

  for (let i = 0; i < cleanedParts.length; i++) {
    const part = cleanedParts[i].toLowerCase();
    if (nicknameStarters.includes(part)) {
      // Found a nickname starter - the nickname typically goes from here to before the last name
      // But only if there's at least one part before (firstName) and after (lastName)
      if (i > 0 && i < cleanedParts.length - 1) {
        nicknameStart = i;
        // Nickname ends at the part before the last one
        nicknameEnd = cleanedParts.length - 2;
        break;
      }
    }
  }

  let firstName, lastName, nickname = null;

  if (nicknameStart > 0 && nicknameEnd >= nicknameStart) {
    // We have a nickname
    firstName = cleanedParts.slice(0, nicknameStart)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');

    nickname = cleanedParts.slice(nicknameStart, nicknameEnd + 1)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');

    lastName = cleanedParts.slice(nicknameEnd + 1)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  } else {
    // No nickname detected - standard first/last name parsing
    const capitalizedParts = cleanedParts.map(p => {
      // Handle special suffixes
      if (['jr', 'sr', 'ii', 'iii', 'iv'].includes(p.toLowerCase())) {
        return p.toUpperCase();
      }
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    });

    if (capitalizedParts.length === 1) {
      // Single-name fighters - store in lastName for proper sorting
      firstName = '';
      lastName = capitalizedParts[0];
    } else {
      firstName = capitalizedParts[0];
      lastName = capitalizedParts.slice(1).join(' ');
    }
  }

  // Build display name (without nickname for now)
  // Handle single-name fighters stored in lastName
  const displayName = firstName && lastName
    ? `${firstName} ${lastName}`
    : (lastName || firstName);

  return { firstName, lastName, nickname, displayName };
}

// ========================================
// STEP 1: Scrape Events List
// ========================================
async function scrapeEventsList(browser) {
  console.log('\n📋 STEP 1: Scraping BKFC events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto('https://www.bkfc.com/events', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for events to load
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

    // Look for event cards/links - BKFC uses Webflow so look for common patterns
    // Check for any links containing /events/
    const eventLinks = document.querySelectorAll('a[href*="/events/"]');
    const processedUrls = new Set();

    eventLinks.forEach(link => {
      const href = link.getAttribute('href') || '';

      // Skip if not an event detail page (skip /events or /events#)
      if (href === '/events' || href === '/events/' || href.includes('#')) return;

      // Build full URL
      const eventUrl = href.startsWith('http') ? href : `https://www.bkfc.com${href}`;

      // Skip duplicates
      if (processedUrls.has(eventUrl)) return;
      processedUrls.add(eventUrl);

      // Extract event slug from URL
      const urlParts = eventUrl.split('/events/');
      if (urlParts.length < 2) return;
      const eventSlug = urlParts[1].replace(/\/$/, '');

      // Skip if no slug
      if (!eventSlug) return;

      // Try to find the event card container
      const container = link.closest('.events_card') ||
                       link.closest('[class*="event"]') ||
                       link.closest('[class*="card"]') ||
                       link.parentElement?.parentElement?.parentElement;

      // Generate event name from slug (most reliable for BKFC)
      // Slug format: "bkfc-fight-night-derby" -> "BKFC Fight Night Derby"
      // Or "bkfc-86-mohegan-sun-lane-vs-pague" -> "BKFC 86 Mohegan Sun Lane vs Pague"
      let eventName = eventSlug
        .split('-')
        .map(word => {
          if (word.toLowerCase() === 'bkfc') return 'BKFC';
          if (word.toLowerCase() === 'vs') return 'vs.';
          if (word.toLowerCase() === 'vi') return 'VI';
          if (word.toLowerCase() === 'iv') return 'IV';
          if (word.toLowerCase() === 'iii') return 'III';
          if (word.toLowerCase() === 'ii') return 'II';
          if (/^\d+$/.test(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');

      // Extract date - look for various date elements
      let dateText = '';
      let eventDate = null;

      if (container) {
        // Look for date elements in the container
        const dateEl = container.querySelector('[data-event-date], [class*="date"], time');
        if (dateEl) {
          dateText = dateEl.textContent?.trim() || '';
        }

        // Also check for text containing date patterns
        const containerText = container.textContent || '';

        // Pattern: "Dec 13, 2025" or "December 13, 2025"
        const dateMatch = containerText.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
        if (dateMatch) {
          const monthStr = dateMatch[1].toLowerCase().substring(0, 3);
          const day = parseInt(dateMatch[2], 10);
          const year = parseInt(dateMatch[3], 10);

          const month = months[monthStr];
          if (month !== undefined) {
            eventDate = new Date(year, month, day);
            eventDate.setHours(0, 0, 0, 0);
            dateText = `${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`;
          }
        }
      }

      // Skip past events
      if (eventDate && eventDate < now) {
        return;
      }

      // Extract event start time from countdown date element
      // BKFC uses [data-countdown-date] with format "December 20, 2025 7:00 PM"
      let eventStartTime = null;
      if (container) {
        // Try 1: Get data-countdown-date attribute value
        const countdownDateEl = container.querySelector('[data-countdown-date]');
        if (countdownDateEl) {
          const attrValue = countdownDateEl.getAttribute('data-countdown-date') || '';
          const textValue = countdownDateEl.textContent?.trim() || '';
          const dateText = attrValue || textValue;
          const timeMatch = dateText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (timeMatch) {
            eventStartTime = timeMatch[1].trim().toUpperCase();
          }
        }

        // Try 2: Search container text for time pattern
        if (!eventStartTime) {
          const containerText = container.textContent || '';
          // Look for patterns like "2025 7:00 PM"
          const timePatterns = [
            /\d{4}\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/gi,
            /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:EST|ET|EDT)/gi,
          ];
          for (const pattern of timePatterns) {
            const match = containerText.match(pattern);
            if (match) {
              const timeExtract = match[0].match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
              if (timeExtract) {
                eventStartTime = timeExtract[1].trim().toUpperCase();
                break;
              }
            }
          }
        }
      }

      // Extract event image
      let eventImageUrl = null;
      if (container) {
        const imgEl = container.querySelector('img');
        if (imgEl) {
          eventImageUrl = imgEl.src || imgEl.getAttribute('data-src') || null;
        }
      }

      // Try to extract venue/location
      let venue = '';
      let city = '';
      let state = '';

      if (container) {
        const containerText = container.textContent || '';
        // Look for location patterns like "Mohegan Sun, Uncasville, CT"
        const locationMatch = containerText.match(/([A-Za-z\s]+),\s*([A-Za-z\s]+),?\s*([A-Z]{2})?/);
        if (locationMatch && !locationMatch[0].includes('Day') && !locationMatch[0].includes('Hour')) {
          venue = locationMatch[1]?.trim() || '';
          city = locationMatch[2]?.trim() || '';
          state = locationMatch[3]?.trim() || '';
        }
      }

      // Determine event type
      let eventType = 'Regular';
      const slugLower = eventSlug.toLowerCase();
      if (slugLower.includes('knucklemania')) {
        eventType = 'Knucklemania';
      } else if (slugLower.includes('fight-night')) {
        eventType = 'Fight Night';
      } else if (slugLower.match(/bkfc-\d+/)) {
        eventType = 'Numbered';
      }

      extractedEvents.push({
        eventName,
        eventType,
        eventUrl,
        eventSlug,
        venue,
        city,
        state,
        country: 'USA',
        dateText,
        eventDate: eventDate ? eventDate.toISOString() : null,
        eventStartTime,
        eventImageUrl,
        status: 'Upcoming'
      });
    });

    return extractedEvents;
  });

  await page.close();

  console.log(`✅ Found ${events.length} upcoming BKFC events\n`);
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
          'img.hero_image',           // BKFC specific hero image
          'img.hero_image.is--events', // BKFC events hero image
          '.hero img',
          '.event-banner img',
          '.banner img',
          'picture img',
          'img[src*="event"]',
          'img[src*="banner"]'
        ];

        for (const selector of bannerSelectors) {
          const imgEl = document.querySelector(selector);
          if (imgEl && imgEl.src) {
            eventImageUrl = imgEl.src;
            break;
          }
        }
      }

      // Extract event time from countdown date element
      // BKFC uses [data-countdown-date] with format "December 20, 2025 7:00 PM"
      let eventStartTime = null;

      // Try 1: Get data-countdown-date attribute value (the attribute itself contains the date string)
      const countdownDateEl = document.querySelector('[data-countdown-date]');
      if (countdownDateEl) {
        // Check attribute value first (more reliable)
        const attrValue = countdownDateEl.getAttribute('data-countdown-date') || '';
        const textValue = countdownDateEl.textContent?.trim() || '';
        const dateText = attrValue || textValue;

        const timeMatch = dateText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (timeMatch) {
          eventStartTime = timeMatch[1].trim().toUpperCase();
        }
      }

      // Try 2: Look for data-event-date-est attribute
      if (!eventStartTime) {
        const estDateEl = document.querySelector('[data-event-date-est]');
        if (estDateEl) {
          const attrValue = estDateEl.getAttribute('data-event-date-est') || '';
          const timeMatch = attrValue.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (timeMatch) {
            eventStartTime = timeMatch[1].trim().toUpperCase();
          }
        }
      }

      // Try 3: Search page text for time pattern near date
      if (!eventStartTime) {
        const pageText = document.body.innerText || '';
        // Look for patterns like "December 20, 2025 7:00 PM" or "7:00 PM EST"
        const timePatterns = [
          /\d{4}\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/gi,  // After year: "2025 7:00 PM"
          /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:EST|ET|EDT)/gi,  // Time with timezone
        ];
        for (const pattern of timePatterns) {
          const match = pageText.match(pattern);
          if (match) {
            const timeExtract = match[0].match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
            if (timeExtract) {
              eventStartTime = timeExtract[1].trim().toUpperCase();
              break;
            }
          }
        }
      }

      // Try 4: Fallback to time-related selectors
      if (!eventStartTime) {
        const timeEl = document.querySelector('[class*="time"]');
        if (timeEl) {
          const timeMatch = timeEl.textContent.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (timeMatch) {
            eventStartTime = timeMatch[1].trim().toUpperCase();
          }
        }
      }

      // Helper to check if a string is a valid fighter name
      function isValidFighterName(name) {
        if (!name || name.length < 2 || name.length > 50) return false;

        const invalidPatterns = [
          /^view\s/i, /^more\s/i, /^loser/i, /^winner/i,
          /^stats$/i, /^info$/i, /^main\s*card/i, /^prelims/i,
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
          /announced/i, /tba$/i, /tbd$/i
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
        return name
          .replace(/\s*-\s*more\s*info/gi, '')
          .replace(/\s*view\s*stats/gi, '')
          .replace(/\s*\(c\)/gi, '')
          .replace(/\s*#\d+/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Extract fights from the page
      const allFights = [];
      let globalOrder = 1;
      const processedPairs = new Set();

      // Strategy 1: Look for fighter profile links and pair them
      const fighterLinks = document.querySelectorAll('a[href*="/fighters/"]');
      const fighterMap = new Map();

      fighterLinks.forEach(link => {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/fighters/')) return;

        const slug = href.split('/fighters/').pop()?.replace(/\/$/, '') || '';
        if (!slug) return;

        // Use the helper function to parse name from slug (handles nicknames and garbage)
        // Note: parseFighterNameFromSlug is defined outside page.evaluate, so we need inline logic here
        const parts = slug.split('-').filter(p => p.length > 0);
        if (parts.length === 0) return;

        // Clean garbage characters
        const cleanedParts = parts.filter(part => {
          if (/\d/.test(part)) return false;
          if (part.length === 1 && !['o', 'j', 'c', 'd'].includes(part.toLowerCase())) return false;
          if (part.length > 2 && !/[aeiouAEIOU]/.test(part)) return false;
          return true;
        });
        if (cleanedParts.length === 0) return;

        // Detect and extract nickname
        const nicknameStarters = ['the', 'da', 'el', 'la', 'big', 'lil', 'baby', 'king', 'queen'];
        let nicknameStart = -1;
        let nicknameEnd = -1;

        for (let i = 0; i < cleanedParts.length; i++) {
          const part = cleanedParts[i].toLowerCase();
          if (nicknameStarters.includes(part) && i > 0 && i < cleanedParts.length - 1) {
            nicknameStart = i;
            nicknameEnd = cleanedParts.length - 2;
            break;
          }
        }

        let name;
        if (nicknameStart > 0 && nicknameEnd >= nicknameStart) {
          // Extract name without the nickname portion
          const firstNameParts = cleanedParts.slice(0, nicknameStart);
          const lastNameParts = cleanedParts.slice(nicknameEnd + 1);
          const allNameParts = [...firstNameParts, ...lastNameParts];
          name = allNameParts.map(p => {
            if (['jr', 'sr', 'ii', 'iii', 'iv'].includes(p.toLowerCase())) return p.toUpperCase();
            return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
          }).join(' ');
        } else {
          // Standard name parsing
          name = cleanedParts.map(p => {
            if (['jr', 'sr', 'ii', 'iii', 'iv'].includes(p.toLowerCase())) return p.toUpperCase();
            return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
          }).join(' ');
        }

        if (!isValidFighterName(name)) return;

        const cleanedName = cleanFighterName(name);
        if (fighterMap.has(cleanedName)) return;

        // Get image - look for nearby img elements
        // BKFC uses bkfc-cdn.gigcasters.com for images, prefer 400x400 versions
        let imageUrl = null;
        const container = link.closest('[class*="matchup"], [class*="fight"], [class*="bout"], [class*="athlete"]') ||
                         link.parentElement?.parentElement;

        if (container) {
          const imgs = container.querySelectorAll('img');
          for (const img of imgs) {
            const src = img.src || img.getAttribute('data-src') || '';
            // Skip flags, icons, logos
            if (src && !src.includes('flag') && !src.includes('icon') && !src.includes('logo') && !src.includes('sponsor')) {
              // Prioritize 400x400 profile images from BKFC CDN
              if (src.includes('bkfc-cdn.gigcasters.com') && src.includes('400x400')) {
                imageUrl = src;
                break;
              }
              // Otherwise take any valid image (but keep looking for 400x400)
              if (!imageUrl) {
                imageUrl = src;
              }
            }
          }
        }

        // Try to get record from nearby text
        let record = null;
        if (container) {
          const containerText = container.textContent || '';
          // Match W-L-D pattern
          const recordMatch = containerText.match(/(\d{1,3})\s*-\s*(\d{1,3})\s*-\s*(\d{1,3})/);
          if (recordMatch) {
            record = `${recordMatch[1]}-${recordMatch[2]}-${recordMatch[3]}`;
          }
        }

        // Try to get weight class
        let weightClass = null;
        if (container) {
          const containerText = container.textContent || '';
          const weightClasses = ['Heavyweight', 'Light Heavyweight', 'Middleweight', 'Welterweight',
                                 'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight', 'Strawweight'];
          for (const wc of weightClasses) {
            if (containerText.includes(wc)) {
              weightClass = wc;
              break;
            }
          }
        }

        fighterMap.set(cleanedName, {
          name: cleanedName,
          url: href.startsWith('http') ? href : `https://www.bkfc.com${href}`,
          imageUrl,
          record,
          weightClass
        });
      });

      // Convert to array and pair fighters
      const uniqueFighters = Array.from(fighterMap.values());

      // Try to pair fighters - they should appear in order on the page
      for (let i = 0; i < uniqueFighters.length - 1; i += 2) {
        const fighterA = uniqueFighters[i];
        const fighterB = uniqueFighters[i + 1];

        if (!fighterA || !fighterB) continue;
        if (fighterA.name === fighterB.name) continue;

        const pairKey = [fighterA.name, fighterB.name].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        // Determine if this is a title fight based on nearby text
        let isTitle = false;
        // Check page content for championship indicators near these fighters

        allFights.push({
          fightId: `bkfc-fight-${globalOrder}`,
          order: globalOrder++,
          cardType: globalOrder <= 5 ? 'Main Card' : 'Prelims',
          weightClass: fighterA.weightClass || fighterB.weightClass || '',
          isTitle,
          fighterA: {
            name: fighterA.name,
            imageUrl: fighterA.imageUrl,
            athleteUrl: fighterA.url,
            record: fighterA.record || '',
            rank: '',
            country: '',
            odds: ''
          },
          fighterB: {
            name: fighterB.name,
            imageUrl: fighterB.imageUrl,
            athleteUrl: fighterB.url,
            record: fighterB.record || '',
            rank: '',
            country: '',
            odds: ''
          }
        });
      }

      // Strategy 2: Look for "vs" patterns in text content
      if (allFights.length < 3) {
        const pageText = document.body.innerText || '';
        const vsRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+vs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
        let match;

        while ((match = vsRegex.exec(pageText)) !== null) {
          const fighterA = cleanFighterName(match[1]);
          const fighterB = cleanFighterName(match[2]);

          if (!isValidFighterName(fighterA) || !isValidFighterName(fighterB)) continue;

          const pairKey = [fighterA, fighterB].sort().join('|');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          allFights.push({
            fightId: `bkfc-fight-${globalOrder}`,
            order: globalOrder++,
            cardType: 'Main Card',
            weightClass: '',
            isTitle: false,
            fighterA: {
              name: fighterA,
              imageUrl: null,
              athleteUrl: '',
              record: '',
              rank: '',
              country: '',
              odds: ''
            },
            fighterB: {
              name: fighterB,
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

      return {
        eventImageUrl,
        eventStartTime,
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
// STEP 3: Scrape Fighter Pages
// ========================================
async function scrapeFighterPage(browser, fighterUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(fighterUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const fighterData = await page.evaluate(() => {
      let record = null;
      let headshotUrl = null;
      let weightClass = null;
      let nickname = null;

      // Look for record pattern
      const pageText = document.body.innerText || '';
      const recordMatch = pageText.match(/(\d{1,3})\s*-\s*(\d{1,3})\s*-\s*(\d{1,3})/);
      if (recordMatch) {
        record = `${recordMatch[1]}-${recordMatch[2]}-${recordMatch[3]}`;
      }

      // Look for headshot image - BKFC uses bkfc-cdn.gigcasters.com for images
      // Example: https://bkfc-cdn.gigcasters.com/.../JULIAN_LANE_400x400.png
      const allImages = document.querySelectorAll('img');

      for (const img of allImages) {
        const src = img.src || img.getAttribute('data-src') || '';

        // Priority 1: BKFC CDN images with 400x400 (profile images)
        if (src.includes('bkfc-cdn.gigcasters.com') && src.includes('400x400')) {
          headshotUrl = src;
          break;
        }

        // Priority 2: Any BKFC CDN image that's not a flag/icon/logo
        if (src.includes('bkfc-cdn.gigcasters.com') &&
            !src.includes('flag') &&
            !src.includes('icon') &&
            !src.includes('logo') &&
            !src.includes('sponsor')) {
          headshotUrl = src;
          // Don't break - keep looking for 400x400 version
        }
      }

      // Fallback to other selectors if no BKFC CDN image found
      if (!headshotUrl) {
        const imgSelectors = [
          'img[src*="fighter"]',
          'img[src*="athlete"]',
          'img[src*="headshot"]',
          '.fighter-image img',
          '.athlete-image img',
          '.profile-image img'
        ];

        for (const selector of imgSelectors) {
          const img = document.querySelector(selector);
          if (img && img.src && !img.src.includes('flag') && !img.src.includes('icon')) {
            headshotUrl = img.src;
            break;
          }
        }
      }

      // Look for weight class
      const weightClasses = ['Heavyweight', 'Light Heavyweight', 'Middleweight', 'Welterweight',
                             'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight', 'Strawweight'];
      for (const wc of weightClasses) {
        if (pageText.includes(wc)) {
          weightClass = wc;
          break;
        }
      }

      return {
        record,
        headshotUrl,
        weightClass,
        nickname
      };
    });

    await page.close();
    return fighterData;

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
  console.log('\n🥊 Starting BKFC Data Scraping Orchestrator\n');
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
        eventStartTime: eventData.eventStartTime || event.eventStartTime
      };

      allEventData.push(completeEventData);

      // Collect unique athletes
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          if (fight.fighterA.name && !uniqueAthletes.has(fight.fighterA.name)) {
            uniqueAthletes.set(fight.fighterA.name, {
              name: fight.fighterA.name,
              url: fight.fighterA.athleteUrl || '',
              imageUrl: fight.fighterA.imageUrl,
              record: fight.fighterA.record || null
            });
          }
          if (fight.fighterB.name && !uniqueAthletes.has(fight.fighterB.name)) {
            uniqueAthletes.set(fight.fighterB.name, {
              name: fight.fighterB.name,
              url: fight.fighterB.athleteUrl || '',
              imageUrl: fight.fighterB.imageUrl,
              record: fight.fighterB.record || null
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Scrape fighter pages for additional data
    console.log(`\n\n👤 STEP 3: Scraping ${uniqueAthletes.size} unique fighter pages...\n`);
    let athleteCount = 0;

    for (const [name, athlete] of uniqueAthletes) {
      if (athlete.url) {
        athleteCount++;
        const fighterData = await scrapeFighterPage(browser, athlete.url);
        uniqueAthletes.set(name, { ...athlete, ...fighterData });

        // Log image status
        const imageStatus = fighterData.headshotUrl ? '✅ image found' : '⚠️  no image';
        console.log(`   ${athleteCount}/${uniqueAthletes.size} ${athlete.name} - ${imageStatus}`);

        await new Promise(resolve => setTimeout(resolve, delays.betweenAthletes));
      }
    }

    // STEP 4: Download images
    console.log('\n\n🖼️  STEP 4: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/bkfc');
    const athleteImagesDir = path.join(imagesDir, 'athletes/bkfc');

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
            event.localImagePath = `/images/events/bkfc/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/bkfc/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete images
    console.log('\n   Athlete images:');
    let downloadCount = 0;
    let currentCount = 0;

    const athletesToDownload = Array.from(uniqueAthletes.values()).filter(a => {
      if (!a.imageUrl && !a.headshotUrl) return false;
      const athleteSlug = a.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const filename = `${athleteSlug}.png`;
      const filepath = path.join(athleteImagesDir, filename);
      return !fs.existsSync(filepath);
    });

    for (const [name, athlete] of uniqueAthletes) {
      const imageUrl = athlete.headshotUrl || athlete.imageUrl;
      if (imageUrl) {
        const athleteSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            await downloadImage(browser, imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/bkfc/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename} (${currentCount}/${athletesToDownload.length})`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/bkfc/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/bkfc');
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
  console.log(`🥊 Starting BKFC scraper in ${SCRAPER_MODE} mode...`);
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
