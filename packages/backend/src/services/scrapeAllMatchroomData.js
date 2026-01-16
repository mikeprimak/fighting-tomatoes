/**
 * Master orchestrator for scraping all Matchroom Boxing data
 *
 * This script:
 * 1. Scrapes matchroomboxing.com/events for upcoming events
 * 2. Scrapes each event page for fight cards
 * 3. Downloads event banners and boxer images
 * 4. Saves all data in structured JSON format
 *
 * Configuration via environment variables:
 * - SCRAPER_MODE: 'manual' (default) or 'automated' (faster, for cron jobs)
 * - SCRAPER_TIMEOUT: Overall timeout in milliseconds (default: 1500000 = 25min)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configuration based on mode
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '1500000', 10);

// Delays in milliseconds
const DELAYS = {
  manual: {
    betweenEvents: 1500,
    betweenBoxers: 500,
    betweenImages: 400,
  },
  automated: {
    betweenEvents: 500,
    betweenBoxers: 200,
    betweenImages: 100,
  }
};

const delays = DELAYS[SCRAPER_MODE] || DELAYS.manual;

// Fighters to skip cropping (use original image as-is)
// Add fighter names here if auto-crop produces bad results
const SKIP_CROP_FIGHTERS = [
  'Zaquin Moses',
  'Raymond Muratalla',
  'Teofimo Lopez',
  'Josh Warrington',
];

// ========================================
// STEP 1: Scrape Events List
// ========================================
async function scrapeEventsList(browser) {
  console.log('\n📋 STEP 1: Scraping Matchroom Boxing events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto('https://www.matchroomboxing.com/events/', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for FacetWP to initialize and load events
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click "Load more" a few times to get more events (FacetWP pagination)
  // Each click loads 12 more events
  let loadMoreClicks = 0;
  const maxLoadMoreClicks = 5; // Get up to ~72 upcoming events

  while (loadMoreClicks < maxLoadMoreClicks) {
    try {
      const loadMoreButton = await page.$('.facetwp-load-more');
      if (loadMoreButton) {
        const isVisible = await page.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }, loadMoreButton);

        if (isVisible) {
          await loadMoreButton.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          loadMoreClicks++;
          console.log(`   Loaded more events (${loadMoreClicks}/${maxLoadMoreClicks})...`);
        } else {
          break;
        }
      } else {
        break;
      }
    } catch (e) {
      break;
    }
  }

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

    // Look for event cards - Matchroom uses links to /events/{slug}/
    const eventLinks = document.querySelectorAll('a[href*="/events/"]');
    const processedUrls = new Set();

    eventLinks.forEach(link => {
      const href = link.getAttribute('href') || '';

      // Skip if not an event detail page
      if (href === '/events/' || href === '/events' || !href.includes('/events/')) return;

      // Build full URL
      const eventUrl = href.startsWith('http') ? href : `https://www.matchroomboxing.com${href}`;

      // Extract slug
      const urlMatch = eventUrl.match(/\/events\/([^\/]+)\/?$/);
      if (!urlMatch) return;
      const eventSlug = urlMatch[1];

      // Skip duplicates
      if (processedUrls.has(eventSlug)) return;
      processedUrls.add(eventSlug);

      // Find the card container
      const container = link.closest('[class*="event"]') ||
                       link.closest('[class*="card"]') ||
                       link.parentElement?.parentElement?.parentElement;

      // Extract event name from slug
      // Slug format: "inoue-vs-picasso" -> "Inoue vs. Picasso"
      let eventName = eventSlug
        .split('-')
        .map(word => {
          if (word.toLowerCase() === 'vs') return 'vs.';
          if (/^\d+$/.test(word)) return word; // Keep numbers as-is
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');

      // Extract date
      let dateText = '';
      let eventDate = null;

      if (container) {
        const containerText = container.textContent || '';

        // Pattern: "27 Dec" or "24 Jan" (day month format)
        let dateMatch = containerText.match(/(\d{1,2})\s+([A-Za-z]{3,9})/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1], 10);
          const monthStr = dateMatch[2].toLowerCase().substring(0, 3);
          const month = months[monthStr];

          if (month !== undefined) {
            // Assume current or next year
            let year = now.getFullYear();
            eventDate = new Date(year, month, day);
            eventDate.setHours(0, 0, 0, 0);

            // If date is in the past, assume next year
            if (eventDate < now) {
              eventDate = new Date(year + 1, month, day);
              eventDate.setHours(0, 0, 0, 0);
            }

            dateText = `${dateMatch[1]} ${dateMatch[2]}`;
          }
        }

        // Also try "Month Day, Year" format
        if (!eventDate) {
          dateMatch = containerText.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
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
          eventImageUrl = imgEl.src || imgEl.getAttribute('data-src') || null;
        }
      }

      // Determine event type
      let eventType = 'Regular';
      const nameLower = eventName.toLowerCase();
      if (nameLower.includes('championship') || nameLower.includes('title')) {
        eventType = 'Championship';
      } else if (nameLower.includes('fight camp')) {
        eventType = 'Fight Camp';
      }

      extractedEvents.push({
        eventName,
        eventType,
        eventUrl,
        eventSlug,
        venue: '',
        city: '',
        country: '',
        dateText,
        eventDate: eventDate ? eventDate.toISOString() : null,
        eventImageUrl,
        status: 'Upcoming',
        promotion: 'Matchroom Boxing'
      });
    });

    return extractedEvents;
  });

  await page.close();

  console.log(`✅ Found ${events.length} upcoming Matchroom Boxing events\n`);
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
    await new Promise(resolve => setTimeout(resolve, 3000));

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
          'picture source',
          'picture img',
          'img[src*="event"]',
          'img[src*="banner"]',
          'img[src*="hero"]'
        ];

        for (const selector of bannerSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            const src = el.src || el.srcset?.split(' ')[0] || el.getAttribute('data-src');
            if (src) {
              eventImageUrl = src;
              break;
            }
          }
        }
      }

      // Extract event date and time
      let eventStartTime = null;
      let eventDateText = null;

      // Look for date/time information in the page
      const pageText = document.body.innerText || '';

      // Time patterns like "7:00 PM" or "19:00"
      const timeMatch = pageText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      if (timeMatch) {
        eventStartTime = timeMatch[1].trim().toUpperCase();
      }

      // Helper to check if a string is a valid boxer name
      function isValidBoxerName(name) {
        if (!name || name.length < 4 || name.length > 35) return false;

        // Must have at least a first and last name (space-separated)
        if (!name.includes(' ')) return false;

        // Must start with a capital letter
        if (!/^[A-Z]/.test(name)) return false;

        const invalidPatterns = [
          /^view/i, /^more/i, /^loser/i, /^winner/i,
          /^stats$/i, /^info$/i, /main\s*event/i, /undercard/i,
          /^round\s*\d/i, /knockout/i, /decision/i,
          /^ko$/i, /^tko$/i, /unanimous/i, /^split$/i,
          /^draw$/i, /buy\s*now/i, /ticket/i, /championship/i,
          /^vs\.?$/i, /^\d+$/, /^[A-Z]{2,3}$/,
          /\bweight\b/i,
          /watch/i, /^event/i, /free/i, /^see\s/i,
          /announced/i, /tba$/i, /tbd$/i, /dazn/i,
          /general\s*sale/i, /on\s*sale/i,
          /W\s+\d+/i, /KO\s+\d+/i, /L\s+\d+/i, /D\s+\d+/i,
          /undisputed/i, /world\s*title/i, /sign\s*up/i,
          /privacy/i, /cookie/i, /terms/i,
          // Boxing sanctioning bodies and title terms
          /\btitle\b/i, /\bibf\b/i, /\bwbc\b/i, /\bwba\b/i, /\bwbo\b/i,
          /\bworld\b/i, /\bchampion\b/i, /\bbelt\b/i, /\bdefense\b/i,
          /\binterim\b/i, /\bgolden\b/i, /\bgloves\b/i
        ];

        for (const pattern of invalidPatterns) {
          if (pattern.test(name)) return false;
        }

        return true;
      }

      // Helper to clean boxer name
      function cleanBoxerName(name) {
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
          .replace(/\s*\(c\)/gi, '')       // Remove champion marker
          .replace(/\s*#\d+/g, '')          // Remove ranking
          .replace(/\s*VS\.?\s*$/i, '')     // Remove trailing VS
          .replace(/^\s*VS\.?\s*/i, '')     // Remove leading VS
          .replace(/\s*W\s+\d+.*$/i, '')    // Remove record suffix
          .replace(/^Events?\s+/i, '')      // Remove leading "Events " or "Event "
          .replace(/^Back\s+To\s+/i, '')    // Remove leading "Back To "
          .replace(/\s+/g, ' ')             // Normalize whitespace
          .trim();
      }

      // Helper to parse boxing record
      // Matchroom format (vertical): "W 31" "KO 27" "L 0" "D 0" (on separate lines)
      // Or standard "31-0-0 (27 KOs)"
      function parseRecord(text) {
        if (!text) return null;

        // Try "W X ... KO Y ... L Z ... D W" format (Matchroom style - may have newlines)
        const winsMatch = text.match(/W\s*(\d+)/i);
        const kosMatch = text.match(/KO\s*(\d+)/i);
        const lossesMatch = text.match(/L\s*(\d+)/i);
        const drawsMatch = text.match(/D\s*(\d+)/i);

        if (winsMatch) {
          const wins = parseInt(winsMatch[1], 10) || 0;
          const kos = kosMatch ? parseInt(kosMatch[1], 10) : 0;
          const losses = lossesMatch ? parseInt(lossesMatch[1], 10) : 0;
          const draws = drawsMatch ? parseInt(drawsMatch[1], 10) : 0;
          return {
            record: `${wins}-${losses}-${draws}`,
            wins,
            losses,
            draws,
            kos
          };
        }

        // Try standard "X-Y-Z" format
        const standardFormat = text.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
        if (standardFormat) {
          const wins = parseInt(standardFormat[1], 10);
          const losses = parseInt(standardFormat[2], 10);
          const draws = parseInt(standardFormat[3], 10);

          // Look for KOs
          const koMatch = text.match(/\((\d+)\s*KO/i);
          const kos = koMatch ? parseInt(koMatch[1], 10) : 0;

          return {
            record: `${wins}-${losses}-${draws}`,
            wins,
            losses,
            draws,
            kos
          };
        }

        return null;
      }

      // Extract fights from the page
      const allFights = [];
      let globalOrder = 1;
      const processedPairs = new Set();

      // Strategy 1: Look for "Name ... VS ... Name" patterns
      // Matchroom format has VS on separate line:
      // "Naoya Inoue\n\nVS\n\nDavid Picasso"
      // Also may be uppercase: "NAOYA INOUE VS DAVID PICASSO"

      // Normalize pageText by collapsing multiple newlines/whitespace around VS
      const normalizedText = pageText.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ');

      // Helper to convert ALL CAPS to Title Case
      function toTitleCase(str) {
        return str.toLowerCase().split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      }

      // Matchroom page format example (normalized):
      // "NAOYA INOUE W 31 KO 27 L 0 D 0 ... VS DAVID PICASSO W 32 KO 17 L 0 D 1"
      // Strategy: Find all boxers with their W/KO/L/D records

      // Pattern: Name (2-3 words) followed by W (record start)
      // More lenient pattern - captures name and record separately
      // Handles cases where D might not have a number after it
      const boxerWithRecordPattern = /([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,2})\s+W\s*(\d+)\s*KO\s*(\d+)\s*L\s*(\d*)\s*D?\s*(\d*)/gi;

      let matchResult;
      const boxersFound = [];

      // Reset regex lastIndex
      boxerWithRecordPattern.lastIndex = 0;

      while ((matchResult = boxerWithRecordPattern.exec(normalizedText)) !== null) {
        const fullName = matchResult[1];
        const wins = parseInt(matchResult[2], 10) || 0;
        const kos = parseInt(matchResult[3], 10) || 0;
        const losses = parseInt(matchResult[4], 10) || 0;
        const draws = parseInt(matchResult[5], 10) || 0;

        // Clean and convert name
        let name = cleanBoxerName(fullName);
        if (name === name.toUpperCase()) {
          name = toTitleCase(name);
        }

        // More lenient validation - just check it's a valid-looking name
        if (name && name.length >= 4 && name.includes(' ') && /^[A-Z]/.test(name)) {
          // Skip if name contains boxing terms or navigation words
          const invalidTerms = ['title', 'world', 'champion', 'ibf', 'wbc', 'wba', 'wbo', 'undisputed', 'ring magazine', 'events', 'back to', 'menu', 'home'];
          const nameLower = name.toLowerCase();
          const hasInvalidTerm = invalidTerms.some(term => nameLower.includes(term));

          if (!hasInvalidTerm) {
            boxersFound.push({
              name,
              record: `${wins}-${losses}-${draws}`,
              wins,
              losses,
              draws,
              kos,
              position: matchResult.index
            });
          }
        }
      }

      // Debug: log found boxers
      if (boxersFound.length > 0) {
        console.log(`      Found ${boxersFound.length} boxers: ${boxersFound.map(b => b.name).join(', ')}`);
      }

      // Pair boxers by finding VS patterns and determining if opponent is named or TBA
      // TBA pattern: "VS W KO L D" (stats without a name before W)
      // Named pattern: "VS [NAME] W [stats]"
      const weightClasses = [
        'Heavyweight', 'Cruiserweight', 'Light Heavyweight', 'Super Middleweight',
        'Middleweight', 'Super Welterweight', 'Welterweight', 'Super Lightweight',
        'Lightweight', 'Super Featherweight', 'Featherweight', 'Super Bantamweight',
        'Bantamweight', 'Super Flyweight', 'Flyweight', 'Light Flyweight', 'Minimumweight'
      ];

      // TBA placeholder for fights with unannounced opponents
      const TBA_BOXER = {
        name: 'TBA',
        record: '0-0-0',
        wins: 0,
        losses: 0,
        draws: 0,
        kos: 0,
        imageUrl: null,
        country: '',
        isTBA: true
      };

      // Track which boxers have been paired
      const pairedBoxerIndices = new Set();

      // For each boxer, look for VS and determine opponent
      for (let i = 0; i < boxersFound.length; i++) {
        if (pairedBoxerIndices.has(i)) continue;

        const boxerA = boxersFound[i];

        // Get text after this boxer's record (estimate ~30-40 chars for "W ## KO ## L ## D ##")
        const recordEndPos = boxerA.position + boxerA.name.length + 40;
        const afterBoxerA = normalizedText.substring(boxerA.position);

        // Find VS after this boxer's record
        const vsMatch = afterBoxerA.match(/W\s*\d+\s*KO\s*\d+\s*L\s*\d*\s*D?\s*\d*[^V]*?\bVS\.?\b\s*/i);

        if (!vsMatch) {
          // No VS after this boxer - skip
          continue;
        }

        const vsEndPos = boxerA.position + vsMatch.index + vsMatch[0].length;
        const afterVs = normalizedText.substring(vsEndPos);

        // Check if opponent is TBA - pattern: "W KO L D" immediately after VS (no name)
        // TBA shows as: "VS W KO L D" where W has no number or empty stats
        const tbaPattern = /^W\s*KO\s*L\s*D\s/i;
        const isTBA = tbaPattern.test(afterVs.trim());

        let boxerB = null;

        if (isTBA) {
          // Opponent is TBA
          boxerB = { ...TBA_BOXER };
          console.log(`      Found TBA opponent for ${boxerA.name}`);
        } else {
          // Find the next boxer in our list that appears after VS
          for (let j = i + 1; j < boxersFound.length; j++) {
            if (pairedBoxerIndices.has(j)) continue;

            const candidate = boxersFound[j];
            // Check if this candidate's position is right after VS
            // Should be within ~100 chars (just the name before their stats)
            const distanceFromVs = candidate.position - vsEndPos;
            if (distanceFromVs >= 0 && distanceFromVs < 100) {
              boxerB = candidate;
              pairedBoxerIndices.add(j);
              break;
            }
          }
        }

        if (!boxerB) {
          // No valid opponent found after VS
          console.log(`      No opponent found for ${boxerA.name}, skipping`);
          continue;
        }

        pairedBoxerIndices.add(i);

        const pairKey = boxerB.isTBA
          ? `${boxerA.name}|TBA`
          : [boxerA.name, boxerB.name].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        // Check if this is a title fight (look in text after boxerA up to ~300 chars)
        const textAfterA = normalizedText.substring(boxerA.position, boxerA.position + 300).toUpperCase();
        const isTitle = textAfterA.includes('CHAMPIONSHIP') ||
                       textAfterA.includes('WORLD TITLE') ||
                       textAfterA.includes('UNDISPUTED') ||
                       textAfterA.includes('WBC WORLD') ||
                       textAfterA.includes('WBA WORLD') ||
                       textAfterA.includes('WBO WORLD') ||
                       textAfterA.includes('IBF WORLD');

        // Try to determine weight class from text around the fight
        let weightClass = '';
        for (const wc of weightClasses) {
          if (textAfterA.includes(wc.toUpperCase())) {
            weightClass = wc;
            break;
          }
        }

        allFights.push({
          fightId: `matchroom-fight-${globalOrder}`,
          order: globalOrder,
          cardType: globalOrder === 1 ? 'Main Event' : 'Undercard',
          weightClass,
          isTitle,
          boxerA: {
            name: boxerA.name,
            record: boxerA.record,
            wins: boxerA.wins,
            losses: boxerA.losses,
            draws: boxerA.draws,
            kos: boxerA.kos,
            imageUrl: null,
            country: ''
          },
          boxerB: {
            name: boxerB.name,
            record: boxerB.record,
            wins: boxerB.wins,
            losses: boxerB.losses,
            draws: boxerB.draws,
            kos: boxerB.kos,
            imageUrl: null,
            country: ''
          }
        });
        globalOrder++;
      }

      // Try to find boxer images from div.boxer-image img.main elements
      // Matchroom structure: each fight section has two boxer-image divs, one for each fighter
      // Images are in <div class="boxer-image"><img class="main" src="..."></div>

      // Strategy 1: Look for boxer-image containers with img.main
      const boxerImageContainers = document.querySelectorAll('.boxer-image img.main, .boxer-image img[class*="main"]');

      // Collect all valid boxer image URLs in order they appear on page
      const collectedBoxerImages = [];
      boxerImageContainers.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || '';
        if (src && !src.includes('placeholder') && !src.includes('logo') && !src.includes('icon')) {
          // Prefer smaller srcset version for storage efficiency (around 600x900 or 667x1000)
          const srcset = img.srcset || '';
          let bestSrc = src;

          // Parse srcset and pick a medium-sized image (around 600-700px width)
          if (srcset) {
            const srcsetParts = srcset.split(',').map(part => {
              const [url, size] = part.trim().split(/\s+/);
              const width = parseInt(size) || 0;
              return { url, width };
            }).filter(p => p.url && p.width > 0);

            // Find an image around 600-700px width, or fallback to smallest > 300px
            const mediumImg = srcsetParts.find(p => p.width >= 600 && p.width <= 800);
            const smallImg = srcsetParts.find(p => p.width >= 300 && p.width <= 500);

            if (mediumImg) {
              bestSrc = mediumImg.url;
            } else if (smallImg) {
              bestSrc = smallImg.url;
            }
          }

          collectedBoxerImages.push(bestSrc);
        }
      });

      console.log(`      Found ${collectedBoxerImages.length} boxer images in boxer-image containers`);

      // Assign images to fighters in order (each fight has 2 images: boxerA then boxerB)
      // The images appear in the same order as the fights on the page
      let imageIndex = 0;
      for (const fight of allFights) {
        if (imageIndex < collectedBoxerImages.length && !fight.boxerA.imageUrl) {
          fight.boxerA.imageUrl = collectedBoxerImages[imageIndex];
          imageIndex++;
        }
        if (imageIndex < collectedBoxerImages.length && !fight.boxerB.imageUrl) {
          fight.boxerB.imageUrl = collectedBoxerImages[imageIndex];
          imageIndex++;
        }
      }

      // Strategy 2: Fallback - try to match by alt text or URL containing fighter name
      const allImages = document.querySelectorAll('img');

      allImages.forEach(img => {
        const src = img.src || img.getAttribute('data-src') || '';
        const alt = (img.alt || '').toLowerCase();
        const srcLower = src.toLowerCase();

        // Skip logos, icons, flags
        if (src.includes('logo') || src.includes('icon') || src.includes('flag') ||
            src.includes('sponsor') || src.includes('dazn') || src.includes('placeholder')) return;

        // Check if alt text or src URL matches a boxer name
        for (const fight of allFights) {
          // Skip if already has image
          if (fight.boxerA.imageUrl && fight.boxerB.imageUrl) continue;

          const boxerAFirst = fight.boxerA.name.toLowerCase().split(' ')[0];
          const boxerALast = fight.boxerA.name.toLowerCase().split(' ').pop();
          const boxerBFirst = fight.boxerB.name.toLowerCase().split(' ')[0];
          const boxerBLast = fight.boxerB.name.toLowerCase().split(' ').pop();

          // Check alt text OR URL for name match
          const matchesBoxerA = (alt.includes(boxerAFirst) || alt.includes(boxerALast) ||
                                  srcLower.includes(boxerAFirst) || srcLower.includes(boxerALast));
          const matchesBoxerB = (alt.includes(boxerBFirst) || alt.includes(boxerBLast) ||
                                  srcLower.includes(boxerBFirst) || srcLower.includes(boxerBLast));

          if (matchesBoxerA && !fight.boxerA.imageUrl) {
            fight.boxerA.imageUrl = src;
          }
          if (matchesBoxerB && !fight.boxerB.imageUrl) {
            fight.boxerB.imageUrl = src;
          }
        }
      });

      // Extract actual event date from page content
      // Look for pattern like "SATURDAY 27 DECEMBER 2025"
      let extractedDate = null;
      const dateMatch = normalizedText.match(/(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})/i);
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        const month = monthNames.indexOf(dateMatch[2].toUpperCase());
        const year = parseInt(dateMatch[3], 10);
        if (month !== -1) {
          extractedDate = new Date(Date.UTC(year, month, day, 5, 0, 0));
        }
      }

      return {
        eventImageUrl,
        eventStartTime,
        fights: allFights,
        // Include normalized text for date extraction in parser
        _normalizedText: normalizedText,
        // Include extracted date for accurate filtering
        _extractedDate: extractedDate ? extractedDate.toISOString() : null
      };
    });

    await page.close();

    // Fallback: If no fights found, try to extract main event from slug
    if (eventData.fights.length === 0 && eventSlug.includes('-vs-')) {
      const vsIndex = eventSlug.indexOf('-vs-');
      const beforeVs = eventSlug.substring(0, vsIndex);
      const afterVs = eventSlug.substring(vsIndex + 4);

      // Convert slug parts to proper names
      // "inoue" -> "Inoue", "de-la-hoya" -> "De La Hoya"
      function slugToName(slug) {
        // Decode URL-encoded characters first
        let decodedSlug = slug;
        try {
          if (/%[0-9A-Fa-f]{2}/.test(slug)) {
            decodedSlug = decodeURIComponent(slug);
          }
        } catch (e) {
          decodedSlug = slug;
        }

        return decodedSlug.split('-').map(part =>
          part.charAt(0).toUpperCase() + part.slice(1)
        ).join(' ');
      }

      const boxerA = slugToName(beforeVs);
      const boxerB = slugToName(afterVs.replace(/-\d+$/, '')); // Remove trailing numbers like "-2"

      if (boxerA.length >= 4 && boxerB.length >= 4) {
        eventData.fights.push({
          fightId: `matchroom-fight-1`,
          order: 1,
          cardType: 'Main Event',
          weightClass: '',
          isTitle: false,
          boxerA: {
            name: boxerA,
            record: '',
            wins: 0,
            losses: 0,
            draws: 0,
            kos: 0,
            imageUrl: null,
            country: ''
          },
          boxerB: {
            name: boxerB,
            record: '',
            wins: 0,
            losses: 0,
            draws: 0,
            kos: 0,
            imageUrl: null,
            country: ''
          }
        });
        console.log(`   📌 Fallback: extracted main event from slug`);
      }
    }

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

/**
 * Download and crop boxer image to focus on head/face
 * Matchroom images show waist-up to head, so we crop to upper portion
 */
async function downloadAndCropBoxerImage(browser, url, filepath, retries = 3) {
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

        // Process image with sharp to crop to headshot
        try {
          const image = sharp(buffer);
          const metadata = await image.metadata();

          if (metadata.width && metadata.height) {
            // Matchroom images are typically portrait with fighter from waist to head
            // We want to crop to focus on the upper 50% (head/shoulders area)
            // and slightly zoom in by taking the center 60% horizontally

            const cropTop = 0; // Start from top
            const cropHeight = Math.floor(metadata.height * 0.50); // Take top 50%
            const horizontalMargin = Math.floor(metadata.width * 0.20); // 20% margin on each side
            const cropWidth = metadata.width - (horizontalMargin * 2); // Center 60%
            const cropLeft = horizontalMargin;

            // Ensure valid crop dimensions
            const finalWidth = Math.max(cropWidth, 100);
            const finalHeight = Math.max(cropHeight, 100);
            const finalLeft = Math.max(0, Math.min(cropLeft, metadata.width - finalWidth));
            const finalTop = Math.max(0, cropTop);

            await image
              .extract({
                left: finalLeft,
                top: finalTop,
                width: Math.min(finalWidth, metadata.width - finalLeft),
                height: Math.min(finalHeight, metadata.height - finalTop)
              })
              .png() // Keep as PNG for quality
              .toFile(filepath);

          } else {
            // Fallback: save without cropping if metadata not available
            fs.writeFileSync(filepath, buffer);
          }
        } catch (sharpError) {
          // Fallback: save original if sharp processing fails
          console.warn(`      ⚠ Sharp processing failed, saving original: ${sharpError.message}`);
          fs.writeFileSync(filepath, buffer);
        }

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
  console.log('\n🥊 Starting Matchroom Boxing Data Scraping Orchestrator\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // STEP 1: Get events list
    const events = await scrapeEventsList(browser);

    // STEP 2: Scrape each event
    console.log('\n📊 STEP 2: Scraping individual event pages...\n');
    const allEventData = [];
    const uniqueBoxers = new Map();

    for (const event of events) {
      console.log(`📄 ${event.eventName}`);
      const eventData = await scrapeEventPage(browser, event.eventUrl, event.eventSlug);

      // Merge event data and use extracted date if available
      const completeEventData = {
        ...event,
        ...eventData,
        eventImageUrl: eventData.eventImageUrl || event.eventImageUrl,
        eventStartTime: eventData.eventStartTime || null,
        // Use extracted date from page content if available (more accurate)
        eventDate: eventData._extractedDate || event.eventDate
      };

      // Filter out past events
      const eventDate = new Date(completeEventData.eventDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (eventDate < today) {
        console.log(`   ⏭️  Skipping past event (${eventDate.toISOString().split('T')[0]})`);
        continue;
      }

      allEventData.push(completeEventData);

      // Collect unique boxers
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          if (fight.boxerA.name && !uniqueBoxers.has(fight.boxerA.name)) {
            uniqueBoxers.set(fight.boxerA.name, {
              name: fight.boxerA.name,
              record: fight.boxerA.record,
              wins: fight.boxerA.wins,
              losses: fight.boxerA.losses,
              draws: fight.boxerA.draws,
              kos: fight.boxerA.kos,
              imageUrl: fight.boxerA.imageUrl
            });
          }
          if (fight.boxerB.name && !uniqueBoxers.has(fight.boxerB.name)) {
            uniqueBoxers.set(fight.boxerB.name, {
              name: fight.boxerB.name,
              record: fight.boxerB.record,
              wins: fight.boxerB.wins,
              losses: fight.boxerB.losses,
              draws: fight.boxerB.draws,
              kos: fight.boxerB.kos,
              imageUrl: fight.boxerB.imageUrl
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Download images
    console.log('\n\n🖼️  STEP 3: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/matchroom');
    const boxerImagesDir = path.join(imagesDir, 'athletes/matchroom');

    // Create directories
    [imagesDir, eventImagesDir, boxerImagesDir].forEach(dir => {
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
            event.localImagePath = `/images/events/matchroom/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/matchroom/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download boxer images
    console.log('\n   Boxer images:');
    let downloadCount = 0;
    let currentCount = 0;

    const boxersToDownload = Array.from(uniqueBoxers.values()).filter(b => {
      if (!b.imageUrl) return false;
      const boxerSlug = b.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const filename = `${boxerSlug}.png`;
      const filepath = path.join(boxerImagesDir, filename);
      return !fs.existsSync(filepath);
    });

    for (const [name, boxer] of uniqueBoxers) {
      if (boxer.imageUrl) {
        // Skip placeholder/silhouette images - no point cropping those
        if (boxer.imageUrl.includes('silhouette') || boxer.imageUrl.includes('placeholder')) {
          continue;
        }

        const boxerSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const filename = `${boxerSlug}.png`;
        const filepath = path.join(boxerImagesDir, filename);

        // Check if this fighter should skip cropping
        const shouldSkipCrop = SKIP_CROP_FIGHTERS.some(
          skipName => skipName.toLowerCase() === name.toLowerCase()
        );

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            if (shouldSkipCrop) {
              // Download original without cropping
              await downloadImage(browser, boxer.imageUrl, filepath);
              console.log(`      ✅ ${filename} (${currentCount}/${boxersToDownload.length}) [original - skip crop]`);
            } else {
              // Download and crop to headshot
              await downloadAndCropBoxerImage(browser, boxer.imageUrl, filepath);
              console.log(`      ✅ ${filename} (${currentCount}/${boxersToDownload.length}) [cropped]`);
            }
            boxer.localImagePath = `/images/athletes/matchroom/${filename}`;
            downloadCount++;

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          boxer.localImagePath = `/images/athletes/matchroom/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new boxer images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/matchroom');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save events data
    const eventsPath = path.join(outputDir, `events-${timestamp}.json`);
    fs.writeFileSync(eventsPath, JSON.stringify({ events: allEventData }, null, 2));
    console.log(`   ✅ Events: ${eventsPath}`);

    // Save boxers data
    const boxersPath = path.join(outputDir, `boxers-${timestamp}.json`);
    const boxersArray = Array.from(uniqueBoxers.values());
    fs.writeFileSync(boxersPath, JSON.stringify({ boxers: boxersArray }, null, 2));
    console.log(`   ✅ Boxers: ${boxersPath}`);

    // Save latest copy
    fs.writeFileSync(path.join(outputDir, 'latest-events.json'), JSON.stringify({ events: allEventData }, null, 2));
    fs.writeFileSync(path.join(outputDir, 'latest-boxers.json'), JSON.stringify({ boxers: boxersArray }, null, 2));

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SUMMARY\n');
    console.log(`   Events scraped: ${allEventData.length}`);
    console.log(`   Total fights: ${allEventData.reduce((sum, e) => sum + (e.fights?.length || 0), 0)}`);
    console.log(`   Unique boxers: ${uniqueBoxers.size}`);
    console.log(`   Event banners: ${allEventData.filter(e => e.localImagePath).length}`);
    console.log(`   Boxer images: ${boxersArray.filter(b => b.localImagePath).length}`);

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
  console.log(`🥊 Starting Matchroom Boxing scraper in ${SCRAPER_MODE} mode...`);
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
