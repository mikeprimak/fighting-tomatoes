/**
 * Master orchestrator for scraping all Top Rank Boxing data
 *
 * This script:
 * 1. Scrapes toprank.com/events/upcoming for upcoming events
 * 2. Scrapes each event page for fight cards
 * 3. Downloads event banners and athlete images
 * 4. Saves all data in structured JSON format
 *
 * Configuration via environment variables:
 * - SCRAPER_MODE: 'manual' (default) or 'automated' (faster, for cron jobs)
 * - SCRAPER_TIMEOUT: Overall timeout in milliseconds (default: 600000 = 10min)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration based on mode
const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '1500000', 10); // 25 minutes default

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
  console.log('\n📋 STEP 1: Scraping upcoming events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto('https://toprank.com/events/upcoming', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for page to load - try multiple possible selectors
    await page.waitForSelector('a[href*="/events/"], .event-card, .event-item, [class*="event"]', { timeout: 15000 });

    // Debug: Take a screenshot to see what's on the page
    const screenshotPath = path.join(__dirname, '../../scraped-data/toprank-debug.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   📸 Debug screenshot saved: ${screenshotPath}`);

    // Debug: Log the page HTML structure
    const pageContent = await page.evaluate(() => {
      // Find all links that might be event links
      const allLinks = Array.from(document.querySelectorAll('a'));
      const eventLinks = allLinks.filter(a => a.href && a.href.includes('/events/') && !a.href.includes('/upcoming'));

      return {
        title: document.title,
        eventLinkCount: eventLinks.length,
        sampleLinks: eventLinks.slice(0, 5).map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 100) })),
        bodyClasses: document.body.className,
        // Get a sample of the main content structure
        mainContent: document.querySelector('main')?.innerHTML?.substring(0, 2000) ||
                     document.querySelector('#app')?.innerHTML?.substring(0, 2000) ||
                     document.querySelector('.content')?.innerHTML?.substring(0, 2000) ||
                     document.body.innerHTML.substring(0, 2000)
      };
    });

    console.log('   Page title:', pageContent.title);
    console.log('   Event links found:', pageContent.eventLinkCount);
    console.log('   Sample links:', JSON.stringify(pageContent.sampleLinks, null, 2));

    const events = await page.evaluate(() => {
      const extractedEvents = [];
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      // Top Rank site structure - look for event cards/links
      // Try multiple possible selectors based on common patterns
      const possibleSelectors = [
        'a[href*="/events/"][href*="-vs-"]',  // Links with "vs" pattern
        '.event-card a',
        '.event-item a',
        '[class*="EventCard"] a',
        '.card a[href*="/events/"]',
        'article a[href*="/events/"]',
        '.events-list a[href*="/events/"]',
        'a[href^="/events/"]:not([href="/events/upcoming"]):not([href="/events/past"])'
      ];

      let eventLinks = [];
      for (const selector of possibleSelectors) {
        const links = document.querySelectorAll(selector);
        if (links.length > 0) {
          eventLinks = Array.from(links);
          break;
        }
      }

      // Deduplicate by href and filter to only toprank.com URLs
      // Prefer links that have date info in their text (e.g., "Sat, Jan 31")
      const linksByUrl = new Map();
      const datePattern = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i;

      for (const link of eventLinks) {
        const href = link.href;
        // Only include toprank.com event URLs
        if (href &&
            href.includes('toprank.com/events/') &&
            !href.includes('/upcoming') && !href.includes('/past')) {
          const card = link.closest('.event-card, .event-item, [class*="card"], article, .event') || link.parentElement;
          const linkText = link.textContent || '';
          const cardText = card?.textContent || linkText;

          // Check if either has the date pattern
          const hasDateInLink = datePattern.test(linkText);
          const hasDateInCard = datePattern.test(cardText);
          const bestText = hasDateInLink ? linkText : cardText;
          const hasDate = hasDateInLink || hasDateInCard;

          // Prefer entries with date info, otherwise prefer longer text
          const existing = linksByUrl.get(href);
          const existingHasDate = existing?.hasDate || false;

          if (!existing || (hasDate && !existingHasDate) || (hasDate === existingHasDate && bestText.length > (existing.textLength || 0))) {
            linksByUrl.set(href, { link, card, textLength: bestText.length, cardText: bestText, hasDate });
          }
        }
      }
      const uniqueLinks = Array.from(linksByUrl.values()).map(v => ({ link: v.link, card: v.card, cardText: v.cardText }));

      // Process each unique event link
      for (const item of uniqueLinks) {
        const link = item.link;
        const eventUrl = link.href;

        // Use the card we already found (with the most text content)
        const card = item.card;
        const fullCardText = item.cardText || '';

        // Try to get the slug from URL for a clean name
        const urlSlug = eventUrl.split('/events/')[1]?.split('/')[0]?.split('?')[0];

        // Extract event name - prefer URL slug as it's more reliable
        let eventName = '';
        if (urlSlug) {
          // Decode URL-encoded characters first (e.g., M%c3%a9l%c3%a8dje → Mélèdje)
          let decodedSlug = urlSlug;
          try {
            if (/%[0-9A-Fa-f]{2}/.test(urlSlug)) {
              decodedSlug = decodeURIComponent(urlSlug);
            }
          } catch (e) {
            decodedSlug = urlSlug;
          }

          // Convert slug to title case: "zayas-vs-baraou" -> "Zayas vs Baraou"
          eventName = decodedSlug
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .replace(' Vs ', ' vs ');
        }

        // Fallback to card text if URL slug didn't work
        if (!eventName || !eventName.toLowerCase().includes('vs')) {
          const titleEl = card?.querySelector('h1, h2, h3, h4, .title, [class*="title"]') || link;
          const titleText = titleEl?.textContent?.trim() || '';
          if (titleText.toLowerCase().includes('vs') && titleText.length < 60) {
            eventName = titleText.replace(/\s+/g, ' ').trim();
          }
        }

        // Extract date and venue from card text
        // The card text often contains: "Zayas vs BaraouSat, Jan 31Coliseo De Puerto Rico | San Juan, Puerto Rico"
        let dateText = '';
        let venue = '';
        let city = '';
        let country = 'USA'; // Default for Top Rank

        // First try dedicated date/location elements
        const dateEl = card?.querySelector('[class*="date"], time, .date');
        if (dateEl) {
          dateText = dateEl.textContent?.trim() || dateEl.getAttribute('datetime') || '';
        }

        const locationEl = card?.querySelector('[class*="location"], [class*="venue"], .location, .venue');
        if (locationEl) {
          const locationText = locationEl.textContent?.trim() || '';
          const parts = locationText.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            venue = parts[0];
            city = parts[1];
            if (parts.length > 2) country = parts[2];
          } else {
            venue = locationText;
          }
        }

        // If no dedicated elements found, try to parse from the full card text
        if (!dateText || !venue) {
          const cardText = fullCardText || card?.textContent || link.textContent || '';

          // Look for date pattern: "Sat, Jan 31" or "Fri, Feb 14" etc.
          // Note: Text may be concatenated without spaces, e.g., "BaraouSat, Jan 31"
          const dateMatch = cardText.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
          if (dateMatch && !dateText) {
            // Reconstruct a clean date string
            dateText = `${dateMatch[1]}, ${dateMatch[2]} ${dateMatch[3]}`;
          }

          // Look for venue pattern: text before " | " followed by location
          // e.g., "Coliseo De Puerto Rico | San Juan, Puerto Rico"
          const venueMatch = cardText.match(/([A-Z][A-Za-z\s]+(?:Arena|Center|Centre|Stadium|Garden|Coliseo|Hall|Theater|Theatre|Pavilion)[A-Za-z\s]*)\s*\|\s*([^|]+)/i);
          if (venueMatch && !venue) {
            venue = venueMatch[1].trim();
            const locationParts = venueMatch[2].split(',').map(p => p.trim());
            city = locationParts[0] || '';
            country = locationParts[1] || 'USA';
          }

          // Alternative: look for pipe separator without specific venue words
          if (!venue) {
            const pipeMatch = cardText.match(/([A-Z][A-Za-z\s]{5,40})\s*\|\s*([A-Za-z\s,]+)/);
            if (pipeMatch) {
              // Check if this looks like a venue (not the event name)
              const potentialVenue = pipeMatch[1].trim();
              if (!potentialVenue.toLowerCase().includes('vs')) {
                venue = potentialVenue;
                const locationParts = pipeMatch[2].split(',').map(p => p.trim());
                city = locationParts[0] || '';
                country = locationParts[1] || 'USA';
              }
            }
          }
        }

        // Extract image
        let eventImageUrl = null;
        const imgEl = card?.querySelector('img');
        if (imgEl) {
          eventImageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('srcset')?.split(' ')[0];
        }

        // Do the date/venue extraction directly using fullCardText
        const cardTextForParsing = fullCardText || card?.textContent || link.textContent || '';

        // Parse date from card text
        const dateMatchResult = cardTextForParsing.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
        if (dateMatchResult) {
          dateText = `${dateMatchResult[1]}, ${dateMatchResult[2]} ${dateMatchResult[3]}`;
        }

        // Parse venue from card text
        const venueMatchResult = cardTextForParsing.match(/([A-Z][A-Za-z\s]+(?:Arena|Center|Centre|Stadium|Garden|Coliseo|Hall|Theater|Theatre|Pavilion)[A-Za-z\s]*)\s*\|\s*([^|]+)/i);
        if (venueMatchResult && !venue) {
          venue = venueMatchResult[1].trim();
          const locationParts = venueMatchResult[2].split(',').map(p => p.trim());
          city = locationParts[0] || '';
          country = locationParts[1] || 'USA';
        }

        extractedEvents.push({
          eventName: eventName || `Top Rank Boxing: ${urlSlug || 'Event'}`,
          eventUrl,
          dateText,
          venue,
          city,
          country,
          eventImageUrl,
          status: 'Upcoming'
        });
      }

      return extractedEvents;
    });

    await page.close();

    console.log(`✅ Found ${events.length} upcoming events\n`);
    if (events.length > 0) {
      events.forEach((e, i) => console.log(`   ${i + 1}. ${e.eventName} - ${e.eventUrl}`));
    }
    return events;

  } catch (error) {
    console.log(`❌ Error scraping events list: ${error.message}`);
    await page.close();
    return [];
  }
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
      timeout: 60000
    });

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Debug: Take screenshot
    const eventSlug = eventUrl.split('/events/')[1]?.split('/')[0] || 'event';
    const screenshotPath = path.join(__dirname, `../../scraped-data/toprank-${eventSlug}-debug.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   📸 Event screenshot saved: ${screenshotPath}`);

    const eventData = await page.evaluate(() => {
      // Extract event image
      let eventImageUrl = null;

      // Try og:image meta tag first
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        eventImageUrl = ogImage.content;
      }

      // Try hero/banner images
      if (!eventImageUrl) {
        const imageSelectors = [
          '.hero img',
          '.banner img',
          '.event-banner img',
          '.event-header img',
          '[class*="Hero"] img',
          '[class*="Banner"] img',
          'header img',
          'picture img'
        ];
        for (const selector of imageSelectors) {
          const imgEl = document.querySelector(selector);
          if (imgEl && imgEl.src) {
            eventImageUrl = imgEl.src;
            break;
          }
        }
      }

      // Extract event details
      let venue = '';
      let city = '';
      let dateText = '';

      // Look for event info sections
      const infoSelectors = [
        '.event-info', '.event-details', '[class*="EventInfo"]',
        '.event-meta', '[class*="meta"]', '.details'
      ];

      for (const selector of infoSelectors) {
        const infoEl = document.querySelector(selector);
        if (infoEl) {
          const text = infoEl.textContent || '';
          // Try to extract date
          const dateMatch = text.match(/(\w+,?\s+\w+\s+\d+,?\s+\d{4})|(\d{1,2}\/\d{1,2}\/\d{4})/);
          if (dateMatch) dateText = dateMatch[0];
          break;
        }
      }

      // Extract event start time
      let eventStartTime = null;
      let eventStartTimezone = null;

      // Search page text for time + timezone pattern (e.g., "9:00 PM ET")
      const pageText = document.body.innerText || '';
      const timePatterns = [
        /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(ET|EST|EDT|PT|PST|PDT|CT|CST|CDT|MT|MST|MDT)/i,
        /(\d{1,2}:\d{2}(?:am|pm))\s*(ET|EST|EDT|PT|PST|PDT|CT|CST|CDT|MT|MST|MDT)/i,
      ];

      for (const pattern of timePatterns) {
        const match = pageText.match(pattern);
        if (match) {
          eventStartTime = match[1].trim().toUpperCase();
          eventStartTimezone = match[2].trim().toUpperCase();
          break;
        }
      }

      // Extract fight card
      const allFights = [];
      let globalOrder = 1;

      // Boxing sites often use different structures - try multiple patterns
      const fightSelectors = [
        '.fight-card .fight, .fight-card .bout, .fight-card .matchup',
        '.bout-card, .matchup-card, .fight-item',
        '[class*="Bout"], [class*="Matchup"], [class*="Fight"]',
        '.card-body, .fight-row, .bout-row',
        'article[class*="fight"], article[class*="bout"]',
        '.fights > *, .bouts > *, .matchups > *'
      ];

      let fightElements = [];
      for (const selector of fightSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          fightElements = Array.from(elements);
          break;
        }
      }

      // If no fight elements found, try to find fighter pairs
      if (fightElements.length === 0) {
        // Look for sections that might contain vs patterns
        const vsElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent || '';
          return text.includes(' vs ') || text.includes(' VS ') || text.includes(' v ');
        });

        // Filter to most specific elements (those without children containing vs)
        fightElements = vsElements.filter(el => {
          const childrenWithVs = Array.from(el.children).filter(child =>
            (child.textContent || '').toLowerCase().includes(' vs ')
          );
          return childrenWithVs.length === 0;
        }).slice(0, 20); // Limit to avoid too many
      }

      // Track seen fights to avoid duplicates
      const seenFights = new Set();

      // Process fight elements
      fightElements.forEach((element) => {
        const text = element.textContent?.trim() || '';

        // Skip if too short or doesn't look like a fight
        if (text.length < 5) return;

        // Try to parse fighter names from "Fighter A vs Fighter B" pattern
        const vsMatch = text.match(/([A-Za-z\s.'"-]+)\s+(?:vs\.?|VS\.?|v\.?)\s+([A-Za-z\s.'"-]+)/i);

        if (!vsMatch) return;

        let fighterAName = vsMatch[1].trim();
        let fighterBName = vsMatch[2].trim();

        // Clean up names (remove extra whitespace, weight class info that might be attached)
        fighterAName = fighterAName.replace(/\s+/g, ' ').replace(/^\d+\s*lbs?\s*/i, '').trim();
        fighterBName = fighterBName.replace(/\s+/g, ' ').replace(/\s*\d+\s*lbs?$/i, '').trim();

        // Try to extract fighter records from nearby text
        // Common formats: "25-1-0", "(25-1)", "25W-1L-0D", "25 wins, 1 loss"
        let fighterARecord = '';
        let fighterBRecord = '';

        // Look for record patterns near fighter names in the element text
        // Pattern 1: "(W-L-D)" or "(W-L)" format
        const recordPatterns = [
          /\((\d{1,3})\s*[-–]\s*(\d{1,3})\s*[-–]?\s*(\d{1,3})?\)/g,  // (25-1-0) or (25-1)
          /(\d{1,3})\s*[-–]\s*(\d{1,3})\s*[-–]\s*(\d{1,3})/g,        // 25-1-0
          /(\d{1,3})W\s*[-–]?\s*(\d{1,3})L\s*[-–]?\s*(\d{1,3})?D?/gi, // 25W-1L-0D
        ];

        // Get text before and after "vs" to find records for each fighter
        const textLower = text.toLowerCase();
        const vsIndex = textLower.indexOf(' vs');
        const textBeforeVs = vsIndex > 0 ? text.substring(0, vsIndex) : '';
        const textAfterVs = vsIndex > 0 ? text.substring(vsIndex + 3) : '';

        for (const pattern of recordPatterns) {
          // Try to find record for fighter A (before vs)
          if (!fighterARecord) {
            const matchA = textBeforeVs.match(pattern);
            if (matchA) {
              const w = matchA[1] || '0';
              const l = matchA[2] || '0';
              const d = matchA[3] || '0';
              fighterARecord = `${w}-${l}-${d}`;
            }
          }
          // Try to find record for fighter B (after vs)
          if (!fighterBRecord) {
            const matchB = textAfterVs.match(pattern);
            if (matchB) {
              const w = matchB[1] || '0';
              const l = matchB[2] || '0';
              const d = matchB[3] || '0';
              fighterBRecord = `${w}-${l}-${d}`;
            }
          }
          // Reset lastIndex for global regex
          pattern.lastIndex = 0;
        }

        // Validate fighter names - skip junk entries
        // Valid names should be 2-40 chars, mostly letters/spaces
        const isValidName = (name) => {
          if (name.length < 2 || name.length > 40) return false;
          // Must be mostly letters (allow some punctuation for names like O'Brien)
          if (!/^[A-Za-z][A-Za-z\s.'"-]*[A-Za-z.]$/.test(name)) return false;
          // Skip if contains obvious junk words
          const junkWords = ['event', 'bundle', 'ticket', 'support', 'style', 'exclusive', 'ready', 'show'];
          const nameLower = name.toLowerCase();
          for (const junk of junkWords) {
            if (nameLower.includes(junk)) return false;
          }
          return true;
        };

        if (!isValidName(fighterAName) || !isValidName(fighterBName)) return;

        // Create keys to detect duplicate fights (including last-name-only versions)
        const fightKey = [fighterAName, fighterBName].sort().join(' vs ').toLowerCase();
        // Also extract last names for partial match detection
        const getLastName = (name) => {
          const parts = name.trim().split(' ');
          return parts[parts.length - 1].toLowerCase();
        };
        const lastNameKey = [getLastName(fighterAName), getLastName(fighterBName)].sort().join(' vs ');

        // Skip if we've seen this fight (either full name or last name only)
        if (seenFights.has(fightKey) || seenFights.has(lastNameKey)) return;

        // Prefer full names over last-name-only entries
        // If this is a last-name-only entry and we haven't seen the full name, record it
        const isLastNameOnly = !fighterAName.includes(' ') && !fighterBName.includes(' ');
        if (isLastNameOnly) {
          // Mark this last-name version as seen, but skip adding it to fights
          seenFights.add(lastNameKey);
          return;
        }

        // Record both the full key and the last-name key to prevent duplicates
        seenFights.add(fightKey);
        seenFights.add(lastNameKey);

        // Extract weight class if present
        let weightClass = '';
        const weightMatch = text.match(/(\d{3})\s*(?:lbs?|pounds?)/i);
        if (weightMatch) {
          weightClass = `${weightMatch[1]} lbs`;
        }

        // Look for weight class labels
        const weightClassEl = element.querySelector('[class*="weight"], [class*="division"]');
        if (weightClassEl) {
          weightClass = weightClassEl.textContent?.trim() || weightClass;
        }

        // Check for title fight
        const isTitle = text.toLowerCase().includes('title') ||
                        text.toLowerCase().includes('championship') ||
                        text.toLowerCase().includes('world');

        // Try to find fighter images
        let fighterAImage = null;
        let fighterBImage = null;
        const images = element.querySelectorAll('img');
        if (images.length >= 2) {
          fighterAImage = images[0]?.src || null;
          fighterBImage = images[1]?.src || null;
        }

        // Try to find fighter links/URLs
        let fighterAUrl = '';
        let fighterBUrl = '';
        const links = element.querySelectorAll('a[href*="/boxers/"], a[href*="/fighters/"], a[href*="/athlete"]');
        if (links.length >= 2) {
          fighterAUrl = links[0]?.href || '';
          fighterBUrl = links[1]?.href || '';
        }

        const fightData = {
          fightId: `toprank-fight-${globalOrder}`,
          order: globalOrder++,
          cardType: 'Main Card',
          weightClass,
          isTitle,
          fighterA: {
            name: fighterAName,
            athleteUrl: fighterAUrl,
            imageUrl: fighterAImage,
            record: fighterARecord,
            country: '',
          },
          fighterB: {
            name: fighterBName,
            athleteUrl: fighterBUrl,
            imageUrl: fighterBImage,
            record: fighterBRecord,
            country: '',
          }
        };

        allFights.push(fightData);
      });

      return {
        eventImageUrl,
        venue,
        city,
        dateText,
        eventStartTime,
        eventStartTimezone,
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
  console.log('\n🥊 Starting Top Rank Boxing Data Scraping Orchestrator\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // STEP 1: Get events list
    const events = await scrapeEventsList(browser);

    if (events.length === 0) {
      console.log('\n⚠️  No events found. The scraper may need selector adjustments.');
      console.log('   Check the debug screenshots in scraped-data/ folder.\n');
    }

    // STEP 2: Scrape each event
    console.log('\n📊 STEP 2: Scraping individual event pages...\n');
    const allEventData = [];
    const uniqueAthletes = new Map(); // athleteUrl -> athlete data

    for (const event of events) {
      console.log(`📄 ${event.eventName}`);
      const eventData = await scrapeEventPage(browser, event.eventUrl, event.eventName);

      const completeEventData = {
        ...event,
        ...eventData,
        eventImageUrl: eventData.eventImageUrl || event.eventImageUrl
      };

      allEventData.push(completeEventData);

      // Collect unique athletes
      if (eventData.fights) {
        eventData.fights.forEach(fight => {
          // Generate URL if not found
          const fighterAUrl = fight.fighterA.athleteUrl ||
            `toprank://fighter/${fight.fighterA.name.toLowerCase().replace(/\s+/g, '-')}`;
          const fighterBUrl = fight.fighterB.athleteUrl ||
            `toprank://fighter/${fight.fighterB.name.toLowerCase().replace(/\s+/g, '-')}`;

          if (!uniqueAthletes.has(fighterAUrl)) {
            uniqueAthletes.set(fighterAUrl, {
              name: fight.fighterA.name,
              url: fighterAUrl,
              imageUrl: fight.fighterA.imageUrl,
              record: fight.fighterA.record
            });
          }
          if (!uniqueAthletes.has(fighterBUrl)) {
            uniqueAthletes.set(fighterBUrl, {
              name: fight.fighterB.name,
              url: fighterBUrl,
              imageUrl: fight.fighterB.imageUrl,
              record: fight.fighterB.record
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Download images
    console.log('\n\n🖼️  STEP 3: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/toprank');
    const athleteImagesDir = path.join(imagesDir, 'athletes/toprank');

    // Create directories
    [imagesDir, eventImagesDir, athleteImagesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Download event banners
    console.log('   Event banners:');
    for (const event of allEventData) {
      if (event.eventImageUrl && event.eventImageUrl.startsWith('http')) {
        const filename = `${event.eventUrl.split('/events/')[1]?.split('/')[0] || 'event'}.jpg`;
        const filepath = path.join(eventImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, event.eventImageUrl, filepath);
            event.localImagePath = `/images/events/toprank/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/toprank/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete images
    console.log('\n   Athlete images:');
    let downloadCount = 0;

    for (const [url, athlete] of uniqueAthletes) {
      if (athlete.imageUrl && athlete.imageUrl.startsWith('http')) {
        const athleteSlug = athlete.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, athlete.imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/toprank/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/toprank/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/toprank');
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
  console.log(`🥊 Starting Top Rank Boxing scraper in ${SCRAPER_MODE} mode...`);
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
