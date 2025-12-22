/**
 * Master orchestrator for scraping all OKTAGON MMA data
 *
 * This script:
 * 1. Scrapes oktagonmma.com/en/events for upcoming events
 * 2. Scrapes each event page for fight cards (filters out non-fight events like press conferences)
 * 3. Extracts athlete information from embedded JSON data
 * 4. Downloads event banners and athlete images
 * 5. Saves all data in structured JSON format
 *
 * Note: OKTAGON uses Next.js with embedded JSON data in __NEXT_DATA__ script tag,
 * making extraction cleaner than HTML parsing.
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
const OVERALL_TIMEOUT = parseInt(process.env.SCRAPER_TIMEOUT || '1500000', 10); // 25 minutes default

// Delays in milliseconds
const DELAYS = {
  manual: {
    betweenEvents: 1000,
    betweenAthletes: 500,
    betweenImages: 400,
  },
  automated: {
    betweenEvents: 300,
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

  await page.goto('https://oktagonmma.com/en/events/', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for the page to load - OKTAGON uses React so we need to wait for content
  await page.waitForSelector('a[href*="/en/events/"]', { timeout: 15000 });

  const events = await page.evaluate(() => {
    const extractedEvents = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Try to extract __NEXT_DATA__ for structured data
    const nextDataScript = document.getElementById('__NEXT_DATA__');
    if (nextDataScript) {
      try {
        const nextData = JSON.parse(nextDataScript.textContent);

        // OKTAGON uses React Query's dehydrated state pattern
        // Data is in: props.pageProps.dehydratedState.queries[].state.data
        const dehydratedState = nextData?.props?.pageProps?.dehydratedState;
        const queries = dehydratedState?.queries || [];

        // Find tournaments in the query cache
        let tournaments = [];
        for (const query of queries) {
          const data = query?.state?.data;
          // Look for array of tournaments or single tournament object
          if (Array.isArray(data)) {
            // Check if it's an array of tournament objects
            const hasTournaments = data.some(item =>
              item && (item.type === 'TOURNAMENT' || item.type === 'CONFERENCE' || item.startDate)
            );
            if (hasTournaments) {
              tournaments = tournaments.concat(data);
            }
          } else if (data && typeof data === 'object') {
            // Check for paginated response or nested data
            if (data.items && Array.isArray(data.items)) {
              tournaments = tournaments.concat(data.items);
            } else if (data.tournaments && Array.isArray(data.tournaments)) {
              tournaments = tournaments.concat(data.tournaments);
            } else if (data.startDate || data.type === 'TOURNAMENT') {
              tournaments.push(data);
            }
          }
        }

        // Also check direct pageProps
        const pageProps = nextData?.props?.pageProps;
        if (pageProps?.tournaments) {
          tournaments = tournaments.concat(pageProps.tournaments);
        }
        if (pageProps?.upcomingTournaments) {
          tournaments = tournaments.concat(pageProps.upcomingTournaments);
        }

        // Deduplicate by id or slug
        const seen = new Set();
        const uniqueTournaments = tournaments.filter(t => {
          if (!t) return false;
          const key = t.id || t.slug;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Helper to get localized text (prefer 'en', fallback to 'cs' or first available)
        const getLocalizedText = (obj) => {
          if (!obj) return '';
          if (typeof obj === 'string') return obj;
          return obj.en || obj.cs || obj.de || Object.values(obj)[0] || '';
        };

        // Helper to get localized URL
        const getLocalizedUrl = (obj) => {
          if (!obj) return null;
          if (typeof obj === 'string') return obj;
          if (obj.url) {
            if (typeof obj.url === 'string') return obj.url;
            return obj.url.en || obj.url.cs || Object.values(obj.url)[0] || null;
          }
          return obj.en || obj.cs || Object.values(obj)[0] || null;
        };

        uniqueTournaments.forEach(tournament => {
          // Skip non-tournament events (conferences, press events)
          if (tournament.type === 'CONFERENCE') {
            return;
          }

          // Parse date from OKTAGON format (ISO format: 2025-12-28T...)
          let eventDate = null;
          const dateStr = tournament.startDate || tournament.date;

          if (dateStr) {
            eventDate = new Date(dateStr);
            if (isNaN(eventDate.getTime())) {
              eventDate = null;
            }
          }

          // Skip past events
          if (eventDate && eventDate < now) {
            return;
          }

          const slug = tournament.slug || '';
          const eventUrl = `https://oktagonmma.com/en/events/${slug}/?eventDetail=true`;

          // Get location info
          const location = tournament.location || {};

          // Get cover image URL (handle localized URLs)
          let coverImageUrl = null;
          if (tournament.coverImage) {
            coverImageUrl = getLocalizedUrl(tournament.coverImage);
          } else if (tournament.mobileAppDetailImage) {
            coverImageUrl = getLocalizedUrl(tournament.mobileAppDetailImage);
          }

          // Get event title (handle localized titles)
          const eventTitle = getLocalizedText(tournament.title) ||
                            getLocalizedText(tournament.shortTitle) ||
                            slug;

          extractedEvents.push({
            eventName: eventTitle,
            eventUrl,
            slug,
            dateText: dateStr || '',
            eventDate: eventDate ? eventDate.toISOString() : null,
            venue: getLocalizedText(location.name) || getLocalizedText(tournament.venue) || '',
            city: getLocalizedText(location.city) || '',
            country: location.country || '',
            eventImageUrl: coverImageUrl,
            status: tournament.state === 'ACTIVE' ? 'Upcoming' : tournament.state || 'Upcoming',
            type: tournament.type || 'TOURNAMENT'
          });
        });

        if (extractedEvents.length > 0) {
          return extractedEvents;
        }
      } catch (e) {
        console.error('Error parsing __NEXT_DATA__:', e.message);
      }
    }

    // Fallback: scrape from DOM if __NEXT_DATA__ parsing fails
    const eventLinks = document.querySelectorAll('a[href*="/en/events/"][href*="eventDetail"], a[href*="/events/"][href$="/"]');
    const seenUrls = new Set();

    eventLinks.forEach(link => {
      const href = link.href || link.getAttribute('href');
      if (!href || seenUrls.has(href)) return;

      // Skip non-event links
      if (href.includes('/fighters/') || href.includes('/rankings/')) return;

      seenUrls.add(href);

      // Extract event name from link text or nearby elements
      let eventName = link.textContent?.trim() || '';
      if (!eventName || eventName.length < 3) {
        const parent = link.closest('div, article, section');
        const titleEl = parent?.querySelector('h1, h2, h3, h4, strong');
        eventName = titleEl?.textContent?.trim() || '';
      }

      // Extract slug from URL
      const slugMatch = href.match(/\/events\/([^/?]+)/);
      const slug = slugMatch ? slugMatch[1] : '';

      // Skip if no valid slug
      if (!slug || slug === 'events') return;

      const fullUrl = href.includes('eventDetail') ? href :
        (href.startsWith('http') ? `${href}?eventDetail=true` : `https://oktagonmma.com${href}?eventDetail=true`);

      extractedEvents.push({
        eventName,
        eventUrl: fullUrl,
        slug,
        dateText: '',
        eventDate: null,
        venue: '',
        city: '',
        country: '',
        eventImageUrl: null,
        status: 'Upcoming'
      });
    });

    return extractedEvents;
  });

  await page.close();

  console.log(`✅ Found ${events.length} upcoming events\n`);
  return events;
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

    // Give React time to hydrate
    await new Promise(resolve => setTimeout(resolve, 2000));

    const eventData = await page.evaluate(() => {
      let eventImageUrl = null;
      const allFights = [];
      let globalOrder = 1;
      let hasFightCard = false;

      // Try to extract __NEXT_DATA__ for structured data
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (nextDataScript) {
        try {
          const nextData = JSON.parse(nextDataScript.textContent);
          const dehydratedState = nextData?.props?.pageProps?.dehydratedState;
          const queries = dehydratedState?.queries || [];

          // Find fight card data in queries (look for "fightCard" in queryKey)
          let fightCards = [];
          let tournament = null;

          for (const query of queries) {
            const queryKey = query?.queryKey || [];
            const data = query?.state?.data;

            // Look for fightCard query
            if (queryKey.includes('fightCard') && Array.isArray(data)) {
              fightCards = data;
            }

            // Look for tournament/event data for the image
            if (queryKey.includes('events') && !queryKey.includes('fightCard') && data && typeof data === 'object') {
              if (data.coverImage || data.title) {
                tournament = data;
              }
            }
          }

          // Also check direct pageProps for tournament
          const pageProps = nextData?.props?.pageProps;
          if (!tournament && pageProps?.tournament) {
            tournament = pageProps.tournament;
          }
          if (!tournament && pageProps?.event) {
            tournament = pageProps.event;
          }

          // Get event image
          if (tournament) {
            eventImageUrl = tournament.coverImage?.url ||
                            tournament.mobileAppDetailImage?.url ||
                            tournament.image?.url || null;
          }

          // If fightCards not found in queries, try tournament object
          if (fightCards.length === 0 && tournament) {
            fightCards = tournament.fightCards || tournament.cards || [];
          }

          // Helper to get localized text (prefer 'en', fallback to 'cs' or first available)
          const getLocalizedText = (obj) => {
            if (!obj) return '';
            if (typeof obj === 'string') return obj;
            return obj.en || obj.cs || obj.de || Object.values(obj)[0] || '';
          };

          // Helper to get localized URL (for images)
          const getLocalizedUrl = (obj) => {
            if (!obj) return null;
            if (typeof obj === 'string') return obj;
            if (obj.url) {
              if (typeof obj.url === 'string') return obj.url;
              return obj.url.en || obj.url.cs || Object.values(obj.url)[0] || null;
            }
            return obj.en || obj.cs || Object.values(obj)[0] || null;
          };

          // Process fight cards
          fightCards.forEach(card => {
            const cardTitle = getLocalizedText(card.title) || 'Main Card';
            const fights = card.fights || [];

            fights.forEach(fight => {
              hasFightCard = true;

              const fighter1 = fight.fighter1 || {};
              const fighter2 = fight.fighter2 || {};

              // Extract fighter records (MMA_PROFI scores)
              const getRecord = (fighter) => {
                const scores = fighter.scores || {};
                const mmaProfi = scores.MMA_PROFI || scores.mmaProfi || {};
                const wins = mmaProfi.wins || 0;
                const losses = mmaProfi.losses || 0;
                const draws = mmaProfi.draws || 0;
                return wins || losses ? `${wins}-${losses}-${draws}` : '';
              };

              // Get fighter image URL (handle nested localized URLs)
              const getImageUrl = (fighter) => {
                if (fighter.imageProfile?.url) {
                  const url = fighter.imageProfile.url;
                  if (typeof url === 'string') return url;
                  return url.en || url.cs || Object.values(url)[0] || null;
                }
                return getLocalizedUrl(fighter.image) || getLocalizedUrl(fighter.headshot) || null;
              };

              // Get fighter profile URL
              const getAthleteUrl = (fighter) => {
                const slug = fighter.slug || fighter.slugs?.[0] || '';
                return slug ? `https://oktagonmma.com/en/fighters/${slug}/` : '';
              };

              // Build fighter name
              const getName = (fighter) => {
                const firstName = (fighter.firstName || '').trim();
                const lastName = (fighter.lastName || '').trim();
                return `${firstName} ${lastName}`.trim();
              };

              // Get weight class from fight or fighters
              const getWeightClass = () => {
                const wc = fight.weightClass?.title ||
                          fighter1.weightClass?.title ||
                          fighter2.weightClass?.title;
                return getLocalizedText(wc) || wc || '';
              };
              const weightClass = getWeightClass();

              // Check if title fight (card title contains "TITLE" or titleFight flag)
              const isTitle = (cardTitle.toLowerCase().includes('title') ||
                              fight.titleFight === true ||
                              fight.isTitle === true ||
                              fight.championship === true);

              const fightData = {
                fightId: `oktagon-fight-${fight.id || globalOrder}`,
                order: globalOrder++,
                cardType: cardTitle,
                weightClass,
                isTitle,
                fighterA: {
                  name: getName(fighter1),
                  firstName: (fighter1.firstName || '').trim(),
                  lastName: (fighter1.lastName || '').trim(),
                  nickname: fighter1.nickName || fighter1.nickname || '',
                  record: getRecord(fighter1),
                  country: fighter1.country || fighter1.nationality || '',
                  imageUrl: getImageUrl(fighter1),
                  athleteUrl: getAthleteUrl(fighter1),
                  slug: fighter1.slug || fighter1.slugs?.[0] || '',
                  rank: '',
                  odds: ''
                },
                fighterB: {
                  name: getName(fighter2),
                  firstName: (fighter2.firstName || '').trim(),
                  lastName: (fighter2.lastName || '').trim(),
                  nickname: fighter2.nickName || fighter2.nickname || '',
                  record: getRecord(fighter2),
                  country: fighter2.country || fighter2.nationality || '',
                  imageUrl: getImageUrl(fighter2),
                  athleteUrl: getAthleteUrl(fighter2),
                  slug: fighter2.slug || fighter2.slugs?.[0] || '',
                  rank: '',
                  odds: ''
                }
              };

              allFights.push(fightData);
            });
          });

          return {
            eventImageUrl,
            fights: allFights,
            hasFightCard
          };
        } catch (e) {
          console.error('Error parsing event __NEXT_DATA__:', e.message);
        }
      }

      // Fallback: try to find og:image
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content) {
        eventImageUrl = ogImage.content;
      }

      return {
        eventImageUrl,
        fights: allFights,
        hasFightCard
      };
    });

    await page.close();

    // Filter out non-fight events (like press conferences)
    if (!eventData.hasFightCard || eventData.fights.length === 0) {
      console.log(`   ⏭️  Skipping (no fight card - likely a press conference)`);
      return { skipped: true, reason: 'No fight card' };
    }

    console.log(`   ✅ Scraped ${eventData.fights?.length || 0} fights`);
    return eventData;

  } catch (error) {
    await page.close();
    console.log(`   ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

// ========================================
// STEP 3: Scrape Athlete Pages (if needed)
// ========================================
async function scrapeAthletePage(browser, athleteUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(athleteUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const athleteData = await page.evaluate(() => {
      let record = null;
      let headshotUrl = null;
      let nickname = '';
      let weightClass = '';

      // Try to extract __NEXT_DATA__
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (nextDataScript) {
        try {
          const nextData = JSON.parse(nextDataScript.textContent);
          const pageProps = nextData?.props?.pageProps;
          const fighter = pageProps?.fighter || pageProps?.athlete || {};

          // Get record
          const scores = fighter.scores || {};
          const mmaProfi = scores.MMA_PROFI || scores.mmaProfi || {};
          const wins = mmaProfi.wins || 0;
          const losses = mmaProfi.losses || 0;
          const draws = mmaProfi.draws || 0;
          if (wins || losses) {
            record = `${wins}-${losses}-${draws}`;
          }

          // Get headshot
          headshotUrl = fighter.imageProfile?.url ||
                        fighter.image?.url ||
                        fighter.headshot?.url || null;

          nickname = fighter.nickName || fighter.nickname || '';
          weightClass = fighter.weightClass?.title || '';

        } catch (e) {
          console.error('Error parsing athlete data:', e.message);
        }
      }

      return {
        record,
        headshotUrl,
        nickname,
        weightClass
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
 * Download and crop athlete image to focus on head/face
 * OKTAGON images show mid-thigh to head, so we crop to upper portion
 */
async function downloadAndCropAthleteImage(browser, url, filepath, retries = 3) {
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
            // OKTAGON images are typically portrait with fighter from mid-thigh to head
            // We want to crop to focus on the upper 45% (head/shoulders area)
            // and slightly zoom in by taking the center 70% horizontally

            const cropTop = 0; // Start from top
            const cropHeight = Math.floor(metadata.height * 0.45); // Take top 45%
            const horizontalMargin = Math.floor(metadata.width * 0.15); // 15% margin on each side
            const cropWidth = metadata.width - (horizontalMargin * 2); // Center 70%
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
  console.log('\n🚀 Starting OKTAGON MMA Data Scraping Orchestrator\n');
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
      const eventName = event.eventName || event.slug || 'Unknown Event';
      console.log(`📄 ${eventName}`);
      const eventData = await scrapeEventPage(browser, event.eventUrl, eventName);

      // Skip non-fight events (press conferences, etc.)
      if (eventData.skipped) {
        continue;
      }

      // Skip events with errors
      if (eventData.error) {
        continue;
      }

      // Merge event data
      const completeEventData = {
        ...event,
        ...eventData,
        // Preserve the original eventImageUrl if the event page returned null
        eventImageUrl: eventData.eventImageUrl || event.eventImageUrl
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
              slug: fight.fighterA.slug,
              imageUrl: fight.fighterA.imageUrl,
              country: fight.fighterA.country
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
              slug: fight.fighterB.slug,
              imageUrl: fight.fighterB.imageUrl,
              country: fight.fighterB.country
            });
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, delays.betweenEvents));
    }

    // STEP 3: Scrape athlete pages (optional - we already have most data from event pages)
    // Only scrape if we need additional info like detailed records
    console.log(`\n\n👤 STEP 3: Processing ${uniqueAthletes.size} unique athletes...\n`);

    // Note: OKTAGON embeds athlete data in event pages, so we may not need separate scraping
    // Only scrape athlete pages if imageUrl is missing
    let athleteCount = 0;
    for (const [url, athlete] of uniqueAthletes) {
      if (!athlete.imageUrl) {
        athleteCount++;
        console.log(`   ${athleteCount}/${uniqueAthletes.size} ${athlete.name} (fetching details)`);
        const athleteData = await scrapeAthletePage(browser, url);
        uniqueAthletes.set(url, { ...athlete, ...athleteData });
        await new Promise(resolve => setTimeout(resolve, delays.betweenAthletes));
      }
    }
    console.log(`   Fetched additional data for ${athleteCount} athletes`);

    // STEP 4: Download images
    console.log('\n\n🖼️  STEP 4: Downloading images...\n');

    const imagesDir = path.join(__dirname, '../../public/images');
    const eventImagesDir = path.join(imagesDir, 'events/oktagon');
    const athleteImagesDir = path.join(imagesDir, 'athletes/oktagon');

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
        const filename = `${event.slug || event.eventUrl.split('/').filter(Boolean).pop()}.jpg`;
        const filepath = path.join(eventImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          try {
            await downloadImage(browser, event.eventImageUrl, filepath);
            event.localImagePath = `/images/events/oktagon/${filename}`;
            console.log(`      ✅ ${filename}`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          event.localImagePath = `/images/events/oktagon/${filename}`;
          console.log(`      ⏭️  ${filename} (already exists)`);
        }
      }
    }

    // Download athlete images
    console.log('\n   Athlete images:');
    let downloadCount = 0;
    let currentCount = 0;
    const totalToDownload = Array.from(uniqueAthletes.values()).filter(a => {
      if (!a.imageUrl) return false;
      const athleteSlug = a.slug || a.url.split('/').filter(Boolean).pop();
      const filename = `${athleteSlug}.png`;
      const filepath = path.join(athleteImagesDir, filename);
      return !fs.existsSync(filepath);
    }).length;

    for (const [url, athlete] of uniqueAthletes) {
      if (athlete.imageUrl) {
        const athleteSlug = athlete.slug || url.split('/').filter(Boolean).pop();
        const filename = `${athleteSlug}.png`;
        const filepath = path.join(athleteImagesDir, filename);

        if (!fs.existsSync(filepath)) {
          currentCount++;
          try {
            await downloadAndCropAthleteImage(browser, athlete.imageUrl, filepath);
            athlete.localImagePath = `/images/athletes/oktagon/${filename}`;
            downloadCount++;
            console.log(`      ✅ ${filename} (${currentCount}/${totalToDownload}) [cropped]`);

            await new Promise(resolve => setTimeout(resolve, delays.betweenImages));
          } catch (error) {
            console.log(`      ❌ ${filename}: ${error.message}`);
          }
        } else {
          athlete.localImagePath = `/images/athletes/oktagon/${filename}`;
        }
      }
    }
    console.log(`   Downloaded ${downloadCount} new athlete images`);

    // Save all data
    console.log('\n\n💾 Saving data...\n');

    const outputDir = path.join(__dirname, '../../scraped-data/oktagon');
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
  console.log(`🚀 Starting OKTAGON scraper in ${SCRAPER_MODE} mode...`);
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
