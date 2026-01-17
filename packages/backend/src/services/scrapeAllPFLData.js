/**
 * Master orchestrator for scraping all PFL (Professional Fighters League) data
 *
 * This script:
 * 1. Scrapes pflmma.com/all-seasons for upcoming events
 * 2. Scrapes each event page for fight cards (waits for AJAX content)
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
  console.log('\n📋 STEP 1: Scraping PFL events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto('https://pflmma.com/all-seasons', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for events to load - look for event links
  await page.waitForSelector('a[href*="/event/"]', { timeout: 15000 });

  // Extract events from both upcoming and past tabs
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

    // Find all event sections/cards - look for links to event pages
    const eventLinks = document.querySelectorAll('a[href*="/event/"]');
    const processedUrls = new Set();

    eventLinks.forEach(link => {
      const eventUrl = link.href;

      // Skip duplicates
      if (processedUrls.has(eventUrl)) return;
      processedUrls.add(eventUrl);

      // Get the event slug from URL
      const urlParts = eventUrl.split('/event/');
      if (urlParts.length < 2) return;
      const eventSlug = urlParts[1].replace(/\/$/, '');

      // Try to get the event container
      const container = link.closest('[class*="event"]') ||
                       link.closest('div[class*="card"]') ||
                       link.parentElement?.parentElement;

      if (!container) return;

      // Convert slug to readable name: "pfl-africa-finals" -> "PFL Africa Finals"
      // Always use the slug-based name for consistency
      const eventName = eventSlug
        .split('-')
        .map(word => {
          // Handle special cases like "pfl", "wt", "cs"
          if (word.toLowerCase() === 'pfl') return 'PFL';
          if (word.toLowerCase() === 'wt') return 'World Tournament';
          if (word.toLowerCase() === 'cs') return 'Champions Series';
          if (word.toLowerCase() === 'mena') return 'MENA';
          // Capitalize numbers (e.g., "2025" stays as is)
          if (/^\d+$/.test(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');

      // Extract date
      const dateEl = container.querySelector('[class*="date"], time, .datetime');
      let dateText = dateEl ? dateEl.textContent.trim() : '';

      // Try to find date in text content
      if (!dateText) {
        const containerText = container.textContent;
        // Look for date patterns like "Sat Dec 13 2025" or "December 13, 2025"
        const dateMatch = containerText.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
        if (dateMatch) {
          dateText = dateMatch[0];
        }
      }

      // Parse date
      let eventDate = null;
      if (dateText) {
        // Pattern: "Sat Dec 13 2025" or "Dec 13 2025"
        const dateMatch = dateText.match(/([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
        if (dateMatch) {
          const monthStr = dateMatch[1].toLowerCase();
          const day = parseInt(dateMatch[2], 10);
          const year = parseInt(dateMatch[3], 10);

          const month = months[monthStr];
          if (month !== undefined) {
            eventDate = new Date(year, month, day);
            eventDate.setHours(0, 0, 0, 0);
          }
        }
      }

      // Skip past events (only keep upcoming)
      if (eventDate && eventDate < now) {
        return;
      }

      // Extract location
      const locationEl = container.querySelector('[class*="location"], [class*="venue"]');
      let venue = '';
      let city = '';
      let country = '';

      if (locationEl) {
        const locationText = locationEl.textContent.trim();
        // Remove "location_on" icon text if present
        const cleanLocation = locationText.replace(/location_on/i, '').trim();
        const parts = cleanLocation.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          venue = parts[0];
          city = parts[1];
          country = parts.length > 2 ? parts[2] : 'USA';
        } else if (parts.length === 1) {
          city = parts[0];
        }
      }

      // Extract event image
      const imgEl = container.querySelector('img');
      const eventImageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : null;

      // Determine event type from name/slug
      let eventType = 'Regular';
      const slugLower = eventSlug.toLowerCase();
      if (slugLower.includes('finals') || slugLower.includes('championship')) {
        eventType = 'Championship';
      } else if (slugLower.includes('africa')) {
        eventType = 'PFL Africa';
      } else if (slugLower.includes('europe')) {
        eventType = 'PFL Europe';
      } else if (slugLower.includes('mena')) {
        eventType = 'PFL MENA';
      } else if (slugLower.includes('wt-')) {
        eventType = 'World Tournament';
      } else if (slugLower.includes('cs-')) {
        eventType = 'Champions Series';
      }

      extractedEvents.push({
        eventName,
        eventType,
        eventUrl,
        eventSlug,
        venue,
        city,
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

  console.log(`✅ Found ${events.length} upcoming PFL events\n`);
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

    // Wait for the event banner to load (schedule-dl-bg div with background-image)
    try {
      await page.waitForSelector('.schedule-dl-bg', { timeout: 5000 });
    } catch (e) {
      // Banner div might not exist on all pages
    }

    // Wait for the fight card component to load via AJAX
    // The AJAX endpoint populates #fight_card_component
    try {
      await page.waitForSelector('#fight_card_component', { timeout: 5000 });
      // Wait a bit more for AJAX content to fully populate
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Wait for actual content to appear (look for fighter images or vs text)
      await page.waitForFunction(() => {
        const container = document.querySelector('#fight_card_component');
        if (!container) return false;
        // Check if there's actual content (not just loading spinner)
        return container.innerHTML.length > 500 &&
               (container.innerHTML.includes('img') || container.innerHTML.includes(' vs '));
      }, { timeout: 10000 });
    } catch (e) {
      // Fight card might not be available yet
      console.log(`   ⚠ Fight card not loaded for ${eventSlug}`);
    }

    const eventData = await page.evaluate(() => {
      // Extract event banner image
      let eventImageUrl = null;

      // PRIORITY 1: Look for background-image on schedule-dl-bg div (main event banner)
      const scheduleBgDiv = document.querySelector('.schedule-dl-bg, div[class*="schedule"][class*="bg"]');
      if (scheduleBgDiv) {
        // Try inline style first
        const style = scheduleBgDiv.getAttribute('style') || '';
        const bgMatch = style.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
        if (bgMatch && bgMatch[1]) {
          eventImageUrl = bgMatch[1];
        }

        // Try computed style if inline didn't work
        if (!eventImageUrl) {
          const computedStyle = window.getComputedStyle(scheduleBgDiv);
          const bgImage = computedStyle.backgroundImage;
          if (bgImage && bgImage !== 'none') {
            const computedMatch = bgImage.match(/url\(['"]?([^'")\s]+)['"]?\)/i);
            if (computedMatch && computedMatch[1] && !computedMatch[1].includes('schedule-banner-default')) {
              eventImageUrl = computedMatch[1];
            }
          }
        }
      }

      // PRIORITY 2: Try og:image meta tag
      if (!eventImageUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) {
          eventImageUrl = ogImage.content;
        }
      }

      // PRIORITY 3: Try hero/banner images
      if (!eventImageUrl) {
        const bannerSelectors = [
          '.hero img',
          '.event-banner img',
          '.banner img',
          'picture img',
          'img[src*="event"]'
        ];

        for (const selector of bannerSelectors) {
          const imgEl = document.querySelector(selector);
          if (imgEl && imgEl.src) {
            eventImageUrl = imgEl.src;
            break;
          }
        }
      }

      // Extract event start time
      // PFL has DateTime.fromISO("2025-12-20T16:00:00.000000Z") in scripts
      let eventStartTime = null;
      let eventStartTimeISO = null;

      // Try 1: Look for DateTime.fromISO in scripts (most reliable - gives exact UTC time)
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const scriptContent = script.textContent || '';
        const isoMatch = scriptContent.match(/DateTime\.fromISO\(["']([^"']+)["']\)/);
        if (isoMatch && isoMatch[1]) {
          eventStartTimeISO = isoMatch[1];
          // Also extract just the time portion for display
          const date = new Date(isoMatch[1]);
          const hours = date.getUTCHours();
          const minutes = date.getUTCMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const hour12 = hours % 12 || 12;
          eventStartTime = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
          break;
        }
      }

      // Try 2: Look for "MAIN CARD" text with time pattern like "11:00am ET"
      if (!eventStartTime) {
        const pageText = document.body.innerText || '';
        const mainCardMatch = pageText.match(/MAIN\s*CARD[^|]*\|\s*(\d{1,2}:\d{2}(?:am|pm))/i);
        if (mainCardMatch) {
          eventStartTime = mainCardMatch[1].toUpperCase();
        }
      }

      // Try 3: General time pattern search
      if (!eventStartTime) {
        const pageText = document.body.innerText || '';
        const timePatterns = [
          /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:ET|EST|EDT)/gi,
          /(\d{1,2}:\d{2}(?:am|pm))\s*(?:ET|EST|EDT)/gi,
        ];
        for (const pattern of timePatterns) {
          const match = pageText.match(pattern);
          if (match) {
            const timeExtract = match[0].match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);
            if (timeExtract) {
              eventStartTime = timeExtract[1].toUpperCase();
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

      // Helper function to check if a string is a valid fighter name
      function isValidFighterName(name) {
        if (!name || name.length < 2 || name.length > 50) return false;

        // List of invalid patterns (UI elements, result text, etc.)
        const invalidPatterns = [
          /^view\s/i, /^more\s/i, /^loser/i, /^winner/i,
          /^stats$/i, /^info$/i, /^main\s*card/i, /^prelims/i,
          /^round\s*\d/i, /^r\d$/i, /submission/i, /decision/i,
          /knockout/i, /^ko$/i, /^tko$/i, /^unanimous/i,
          /^split$/i, /^majority$/i, /^draw$/i, /^nc$/i,
          /buy\s*now/i, /ticket/i, /matchup/i, /result/i,
          /championship/i, /title\s*bout/i, /^vs\.?$/i,
          /^\d+$/,  // Just numbers
          /^[A-Z]{2,3}$/,  // Country codes like USA, BRA
          /lightweight/i, /welterweight/i, /heavyweight/i,
          /featherweight/i, /bantamweight/i, /flyweight/i,
          /middleweight/i, /women's/i, /men's/i,
          /^main$/i, /^card$/i, /^bout$/i, /^fight$/i,
          // Filter out placeholder/template names from PFL website
          /^fighter\s*headshot/i, /^fighter\s*bodyshot/i,
          /headshot$/i, /bodyshot$/i,
          /^fighter$/i,  // Just "Fighter" alone
          /placeholder/i, /default/i, /template/i,
        ];

        for (const pattern of invalidPatterns) {
          if (pattern.test(name)) return false;
        }

        // Must contain at least one letter
        if (!/[a-zA-Z]/.test(name)) return false;

        // Should not be all caps (likely a label/button)
        if (name === name.toUpperCase() && name.length > 3) return false;

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

        // Remove common suffixes/prefixes
        return decodedName
          .replace(/\s*-\s*more\s*info/gi, '')
          .replace(/\s*view\s*stats/gi, '')
          .replace(/\s*\(c\)/gi, '')  // Champion indicator
          .replace(/\s*#\d+/g, '')     // Ranking
          .trim();
      }

      // Extract fights from the fight card component
      const fightCardContainer = document.querySelector('#fight_card_component');
      const allFights = [];
      let globalOrder = 1;
      const processedPairs = new Set();  // Track processed fight pairs to avoid duplicates

      if (fightCardContainer) {
        // Strategy 1: Look for fight containers/rows that contain fighter links
        // Each fight row should have 2 unique fighters
        const fighterLinks = fightCardContainer.querySelectorAll('a[href*="/fighter"], a[href*="/athlete"]');

        // Build a map of unique fighters with their data
        const fighterMap = new Map();

        fighterLinks.forEach(link => {
          const href = link.href || '';
          let slug = href.split('/').pop() || '';

          // URL-decode the slug to handle special characters like apostrophes
          // e.g., "n%e2%80%99tchala" -> "n'tchala"
          try {
            slug = decodeURIComponent(slug);
          } catch (e) {
            // If decoding fails, use the original slug
          }

          // Normalize curly apostrophes to standard apostrophes
          slug = slug.replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'");

          // Convert slug to name: "vadim-nemkov" -> "Vadim Nemkov"
          const nameParts = slug.split('-').map(p =>
            p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
          );
          const name = nameParts.join(' ');

          if (!isValidFighterName(name)) return;

          // Skip if we already have this fighter
          const cleanedName = cleanFighterName(name);
          if (fighterMap.has(cleanedName)) return;

          // Get image - search for headshot images only (not flags)
          let imageUrl = null;

          // Helper to check if an image URL is a valid headshot (not a flag)
          const isHeadshotImage = (src) => {
            if (!src) return false;
            const srcLower = src.toLowerCase();
            // Must be a headshot or fighter image, not a flag
            return (srcLower.includes('headshot') || srcLower.includes('fighter')) &&
                   !srcLower.includes('flag') &&
                   !srcLower.includes('/icons/');
          };

          // 1. Search in the fight container for all headshot images
          const fightContainer = link.closest('[class*="fight"], [class*="matchup"], [class*="bout"], [class*="card"]') ||
                                 link.parentElement?.parentElement?.parentElement;

          if (fightContainer) {
            // Get all potential headshot images
            const allImages = fightContainer.querySelectorAll('img');
            for (const candidate of allImages) {
              const src = candidate.src || candidate.getAttribute('data-src') || '';
              // Check if this is a headshot that matches our fighter
              if (isHeadshotImage(src) && src.toLowerCase().includes(slug.toLowerCase().replace(/-/g, ''))) {
                imageUrl = src;
                break;
              }
            }

            // If no exact match, look for any headshot near this fighter's link
            if (!imageUrl) {
              // Get position of this link
              const linkRect = link.getBoundingClientRect();

              for (const candidate of allImages) {
                const src = candidate.src || candidate.getAttribute('data-src') || '';
                if (!isHeadshotImage(src)) continue;

                // Check if this image is close to our link (within same section)
                const imgRect = candidate.getBoundingClientRect();
                const horizontalDistance = Math.abs(imgRect.left - linkRect.left);

                // If image is within 300px horizontally and this is a headshot
                if (horizontalDistance < 300) {
                  imageUrl = src;
                  break;
                }
              }
            }
          }

          // 2. Try parent and grandparent for headshot images
          if (!imageUrl) {
            const parent = link.parentElement;
            const grandparent = parent?.parentElement;

            const searchContainers = [parent, grandparent].filter(Boolean);
            for (const container of searchContainers) {
              const imgs = container.querySelectorAll('img');
              for (const candidate of imgs) {
                const src = candidate.src || candidate.getAttribute('data-src') || '';
                if (isHeadshotImage(src)) {
                  imageUrl = src;
                  break;
                }
              }
              if (imageUrl) break;
            }
          }

          // 3. Direct link image check
          if (!imageUrl) {
            const directImg = link.querySelector('img');
            if (directImg) {
              const src = directImg.src || directImg.getAttribute('data-src') || '';
              if (isHeadshotImage(src)) {
                imageUrl = src;
              }
            }
          }

          fighterMap.set(cleanedName, {
            name: cleanedName,
            url: href,
            imageUrl
          });
        });

        // Convert to array for pairing
        const uniqueFighters = Array.from(fighterMap.values());

        // Pair fighters - assuming they're listed in fight order (fighter A, fighter B, fighter A, fighter B...)
        for (let i = 0; i < uniqueFighters.length - 1; i += 2) {
          const fighterA = uniqueFighters[i];
          const fighterB = uniqueFighters[i + 1];

          if (!fighterA || !fighterB) continue;

          // Skip if same fighter (shouldn't happen after dedup)
          if (fighterA.name === fighterB.name) continue;

          const pairKey = [fighterA.name, fighterB.name].sort().join('|');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          allFights.push({
            fightId: `pfl-fight-${globalOrder}`,
            order: globalOrder++,
            cardType: 'Main Card',
            weightClass: '',
            isTitle: false,
            fighterA: {
              name: fighterA.name,
              imageUrl: fighterA.imageUrl,
              athleteUrl: fighterA.url,
              rank: '',
              country: '',
              odds: ''
            },
            fighterB: {
              name: fighterB.name,
              imageUrl: fighterB.imageUrl,
              athleteUrl: fighterB.url,
              rank: '',
              country: '',
              odds: ''
            }
          });
        }

        // Strategy 2: Look for "vs" patterns in text if strategy 1 didn't find enough
        if (allFights.length < 3) {
          // Get all text content and look for vs patterns
          const htmlContent = fightCardContainer.innerHTML;

          // Look for patterns like "Nemkov vs Cyborg" in text
          const vsRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+vs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
          let match;

          while ((match = vsRegex.exec(htmlContent)) !== null) {
            const fighterA = cleanFighterName(match[1]);
            const fighterB = cleanFighterName(match[2]);

            if (!isValidFighterName(fighterA) || !isValidFighterName(fighterB)) continue;

            const pairKey = [fighterA, fighterB].sort().join('|');
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);

            allFights.push({
              fightId: `pfl-fight-${globalOrder}`,
              order: globalOrder++,
              cardType: 'Main Card',
              weightClass: '',
              isTitle: false,
              fighterA: {
                name: fighterA,
                imageUrl: null,
                athleteUrl: '',
                rank: '',
                country: '',
                odds: ''
              },
              fighterB: {
                name: fighterB,
                imageUrl: null,
                athleteUrl: '',
                rank: '',
                country: '',
                odds: ''
              }
            });
          }
        }

        // Strategy 3: Look for fighter images with name labels
        if (allFights.length < 3) {
          // Find all images that might be fighter headshots
          const images = fightCardContainer.querySelectorAll('img[src*="fighter"], img[src*="athlete"], img[src*="headshot"]');
          const fighterFromImages = [];

          images.forEach(img => {
            // Try to get name from alt text or nearby text
            const alt = img.getAttribute('alt') || '';
            const nearbyText = img.closest('a')?.textContent || img.parentElement?.textContent || '';

            let name = '';
            if (alt && isValidFighterName(alt)) {
              name = cleanFighterName(alt);
            } else if (nearbyText) {
              // Extract name from nearby text
              const cleanText = nearbyText.replace(/\s+/g, ' ').trim();
              if (cleanText.length < 40 && isValidFighterName(cleanText.split(' ').slice(0, 3).join(' '))) {
                name = cleanFighterName(cleanText.split(' ').slice(0, 3).join(' '));
              }
            }

            if (name && !fighterFromImages.find(f => f.name === name)) {
              fighterFromImages.push({
                name,
                imageUrl: img.src || img.getAttribute('data-src'),
                athleteUrl: img.closest('a')?.href || ''
              });
            }
          });

          // Pair up consecutive fighters
          for (let i = 0; i < fighterFromImages.length - 1; i += 2) {
            const fighterA = fighterFromImages[i];
            const fighterB = fighterFromImages[i + 1];

            if (!fighterA || !fighterB) continue;

            const pairKey = [fighterA.name, fighterB.name].sort().join('|');
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);

            allFights.push({
              fightId: `pfl-fight-${globalOrder}`,
              order: globalOrder++,
              cardType: 'Main Card',
              weightClass: '',
              isTitle: false,
              fighterA: {
                name: fighterA.name,
                imageUrl: fighterA.imageUrl,
                athleteUrl: fighterA.athleteUrl,
                rank: '',
                country: '',
                odds: ''
              },
              fighterB: {
                name: fighterB.name,
                imageUrl: fighterB.imageUrl,
                athleteUrl: fighterB.athleteUrl,
                rank: '',
                country: '',
                odds: ''
              }
            });
          }
        }
      }

      // Fallback: Look for headline matchup on page (e.g., "Nemkov vs Cyborg")
      if (allFights.length === 0) {
        const headlineEl = document.querySelector('h1, h2, .hero-title, .event-title');
        if (headlineEl) {
          const headlineText = headlineEl.textContent || '';
          const vsMatch = headlineText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+vs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
          if (vsMatch) {
            const fighterA = vsMatch[1].trim();
            const fighterB = vsMatch[2].trim();

            if (isValidFighterName(fighterA) && isValidFighterName(fighterB)) {
              allFights.push({
                fightId: `pfl-fight-${globalOrder}`,
                order: globalOrder++,
                cardType: 'Main Card',
                weightClass: '',
                isTitle: true,  // Headline fight is likely main event
                fighterA: {
                  name: fighterA,
                  imageUrl: null,
                  athleteUrl: '',
                  rank: '',
                  country: '',
                  odds: ''
                },
                fighterB: {
                  name: fighterB,
                  imageUrl: null,
                  athleteUrl: '',
                  rank: '',
                  country: '',
                  odds: ''
                }
              });
            }
          }
        }
      }

      return {
        eventImageUrl,
        eventStartTime,
        eventStartTimeISO,
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
  console.log('\n🚀 Starting PFL Data Scraping Orchestrator\n');
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
      const eventData = await scrapeEventPage(browser, event.eventUrl, event.eventSlug);

      // Merge event data
      const completeEventData = {
        ...event,
        ...eventData,
        eventImageUrl: eventData.eventImageUrl || event.eventImageUrl
      };

      allEventData.push(completeEventData);

      // Collect unique athletes
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          if (fight.fighterA.name && !uniqueAthletes.has(fight.fighterA.name)) {
            uniqueAthletes.set(fight.fighterA.name, {
              name: fight.fighterA.name,
              url: fight.fighterA.athleteUrl || '',
              imageUrl: fight.fighterA.imageUrl
            });
          }
          if (fight.fighterB.name && !uniqueAthletes.has(fight.fighterB.name)) {
            uniqueAthletes.set(fight.fighterB.name, {
              name: fight.fighterB.name,
              url: fight.fighterB.athleteUrl || '',
              imageUrl: fight.fighterB.imageUrl
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Download images
    console.log('\n\n🖼️  STEP 3: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/pfl');
    const athleteImagesDir = path.join(imagesDir, 'athletes/pfl');

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
            event.localImagePath = `/images/events/pfl/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/pfl/${filename}`;
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
      if (athlete.imageUrl) {
        const athleteSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            await downloadImage(browser, athlete.imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/pfl/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename} (${currentCount}/${athletesToDownload.length})`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/pfl/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/pfl');
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
  console.log(`🚀 Starting PFL scraper in ${SCRAPER_MODE} mode...`);
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
