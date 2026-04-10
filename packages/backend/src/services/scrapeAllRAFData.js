/**
 * RAF (Real American Freestyle) Daily Scraper
 *
 * Scrapes event and fight card data from realamericanfreestyle.com.
 * The site is a Webflow CMS with server-rendered HTML — no Puppeteer needed.
 *
 * Usage:
 * - Manual: node src/services/scrapeAllRAFData.js
 * - Automated: SCRAPER_MODE=automated node src/services/scrapeAllRAFData.js
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const SCRAPER_MODE = process.env.SCRAPER_MODE || 'manual';
const BASE_URL = 'https://www.realamericanfreestyle.com';
const EVENTS_GALLERY_URL = `${BASE_URL}/events-gallery`;

const DELAY_BETWEEN_EVENTS = SCRAPER_MODE === 'automated' ? 1000 : 2000;

// Month name to number mapping
const MONTHS = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11,
};

/**
 * Parse date string like "March 28, 2026" or "March 28, 2026 8:00 PM"
 */
function parseRAFDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  // Match "Month Day, Year [Time]"
  const match = cleaned.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i);
  if (!match) return null;

  const monthName = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const month = MONTHS[monthName];
  if (month === undefined) return null;

  const date = new Date(year, month, day);

  // Keep raw 12h time string (e.g. "8:00 PM") for eventTimeToUTC in the parser
  const rawTime = match[4] ? `${match[4]}:${match[5]} ${match[6]}` : null;

  return {
    date: date.toISOString(),
    startTime: rawTime,
  };
}

/**
 * Fetch HTML from a URL
 */
async function fetchHTML(url) {
  console.log(`  Fetching: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

/**
 * Sleep for ms milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scrape the events gallery page to get all events
 */
async function scrapeEventsGallery() {
  console.log('\n📋 Scraping RAF events gallery...\n');

  const html = await fetchHTML(EVENTS_GALLERY_URL);
  const $ = cheerio.load(html);

  const events = [];

  // Each event is a w-dyn-item inside the main events grid
  $('div.w-dyn-item').each((i, el) => {
    const $el = $(el);

    // Look for the event card structure
    const nameEl = $el.find('.text-block-21');
    const headlineEl = $el.find('.text-block-22');
    const dateEl = $el.find('.event-card_date');
    const locationEl = $el.find('.event-card_location');
    const bannerDiv = $el.find('.div-block-100');
    const eventLink = $el.find('a[href^="/events/"]');

    const eventName = nameEl.text().trim();
    if (!eventName) return; // Skip non-event items

    // Default to Upcoming — authoritative status comes from the event page's
    // `div.past-event-tag` (isPastEvent), resolved per-event below.
    const status = 'Upcoming';

    // Get event page URL
    let eventPageUrl = '';
    if (eventLink.length > 0) {
      const href = eventLink.attr('href');
      if (href) {
        eventPageUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      }
    }

    // Get banner image from background-image style
    let bannerImage = '';
    const bgStyle = bannerDiv.attr('style') || '';
    const bgMatch = bgStyle.match(/url\("?([^")\s]+)"?\)/);
    if (bgMatch) {
      bannerImage = bgMatch[1];
    }

    events.push({
      eventName,
      headline: headlineEl.text().trim(),
      dateText: dateEl.first().text().trim(),
      location: locationEl.first().text().trim(),
      bannerImage,
      eventPageUrl,
      status,
    });
  });

  // Deduplicate by eventName (the hero section may duplicate the latest event)
  const seen = new Set();
  const uniqueEvents = events.filter(e => {
    const key = e.eventName.toUpperCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`✅ Found ${uniqueEvents.length} RAF events\n`);
  return uniqueEvents;
}

/**
 * Scrape a single event page for fight card details
 */
async function scrapeEventPage(eventUrl, eventName) {
  console.log(`\n📋 Scraping event: ${eventName}`);

  const html = await fetchHTML(eventUrl);
  const $ = cheerio.load(html);

  // Parse date/time from header
  const dateTimeText = $('.eyebrow_text.text-color-secondary').first().text().trim();
  const timezoneText = $('.eyebrow_text.eyebrow-margin').first().text().trim();
  const parsedDate = parseRAFDate(dateTimeText);

  // Parse venue/location from header
  const venue = $('.g_header_subheading-text').first().text().trim();

  // Event name from logo text
  const eventNumber = $('.logo-text').first().text().trim();

  // Is it a past event?
  const pastEventTag = $('div.past-event-tag');
  const isPastEvent = pastEventTag.length > 0 && !pastEventTag.hasClass('w-condition-invisible');

  // Parse fight card
  const fights = [];
  let fightOrder = 0;

  $('.matchups-list .w-dyn-item').each((i, el) => {
    const $fight = $(el);
    fightOrder++;

    // Weight class
    const weightClass = $fight.find('.event-card_card-eyebrow').first().text().trim();

    // Championship?
    const champTags = $fight.find('.event-card_championship-tag');
    let isTitle = false;
    let isInterim = false;
    champTags.each((_, tag) => {
      if (!$(tag).hasClass('w-condition-invisible')) {
        const text = $(tag).text().trim().toLowerCase();
        if (text.includes('interim')) isInterim = true;
        else isTitle = true;
      }
    });

    // Fighter names and links
    const nameWrappers = $fight.find('.event-card_card-heading-wrapper .event-card_athlete-name-wrapper');
    const fighter1Wrapper = nameWrappers.eq(0);
    const fighter2Wrapper = nameWrappers.eq(1);

    const fighter1Name = fighter1Wrapper.find('.event-card_card-heading-text').text().trim();
    const fighter2Name = fighter2Wrapper.find('.event-card_card-heading-text').text().trim();
    const fighter1Slug = (fighter1Wrapper.attr('href') || '').replace('/athletes/', '');
    const fighter2Slug = (fighter2Wrapper.attr('href') || '').replace('/athletes/', '');

    if (!fighter1Name || !fighter2Name) return;

    // Win/loss detection via w-condition-invisible
    let winner = null;
    const f1Win = fighter1Wrapper.find('.win-tag');
    const f1Loss = fighter1Wrapper.find('.loss-tag');
    const f2Win = fighter2Wrapper.find('.win-tag');
    const f2Loss = fighter2Wrapper.find('.loss-tag');

    const f1HasWin = f1Win.length > 0 && !f1Win.hasClass('w-condition-invisible');
    const f2HasWin = f2Win.length > 0 && !f2Win.hasClass('w-condition-invisible');

    if (f1HasWin) winner = 'fighter1';
    else if (f2HasWin) winner = 'fighter2';

    // Fighter images (desktop, not mobile)
    const desktopFighters = $fight.find('.event-card_fighters-wrapper');
    const fighterImages = desktopFighters.find('img.event-card_fighter-image').not('.mobile');
    const fighter1Image = fighterImages.eq(0).attr('src') || '';
    const fighter2Image = fighterImages.eq(1).attr('src') || '';

    // Fighter stats
    const statsRows = desktopFighters.find('.fighter-stats_row');
    let fighter1Country = '', fighter2Country = '';
    let fighter1Age = '', fighter2Age = '';
    let fighter1Club = '', fighter2Club = '';
    let fighter1Hometown = '', fighter2Hometown = '';

    statsRows.each((_, row) => {
      const $row = $(row);
      const label = $row.find('.fighter-stat-label .stat-text').text().trim().toLowerCase();
      const leftStat = $row.find('.fighter-left-stat .stat-text').text().trim();
      const rightStat = $row.find('.fighter-right-stat .country-text, .fighter-right-stat .stat-text').text().trim();

      if (label === 'age') {
        fighter1Age = leftStat;
        fighter2Age = rightStat;
      } else if (label === 'club') {
        fighter1Club = leftStat;
        fighter2Club = rightStat;
      } else if (label === 'hometown') {
        fighter1Hometown = leftStat;
        fighter2Hometown = rightStat;
      }

      // Country from flag wrappers
      const countries = $row.find('.fighter-country-wrapper .country-text');
      if (countries.length >= 2) {
        fighter1Country = countries.eq(0).text().trim();
        fighter2Country = countries.eq(1).text().trim();
      }
    });

    // Champion tag
    const championTags = desktopFighters.find('.fighter-tag .tag-text');
    let fighter1IsChampion = false;
    let fighter2IsChampion = false;
    const headshots = desktopFighters.find('.fighter-headshot-wrapper').not('.mobile');
    headshots.each((idx, hs) => {
      const tag = $(hs).find('.fighter-tag .tag-text').text().trim().toLowerCase();
      if (tag === 'champion') {
        if (idx === 0) fighter1IsChampion = true;
        else fighter2IsChampion = true;
      }
    });

    // Score section (for completed fights)
    let scores = null;
    $fight.find('.event-card_takedowns-content').each((_, section) => {
      const $section = $(section);
      if ($section.hasClass('w-condition-invisible')) return;

      const heading = $section.find('.event-card_takedowns-heading-text').text().trim().toLowerCase();
      if (heading === 'score') {
        const rows = $section.find('.fighter-stats_row');
        const scoreData = { total: { fighter1: '', fighter2: '' }, rounds: [] };
        rows.each((ri, row) => {
          const $r = $(row);
          const left = $r.find('.fighter-left-stat .stat-text, .fighter-left-stat div').first().text().trim();
          const right = $r.find('.fighter-right-stat .stat-text, .fighter-right-stat .country-text, .fighter-right-stat div').first().text().trim();
          if ($r.hasClass('totals')) {
            scoreData.total = { fighter1: left, fighter2: right };
          } else {
            scoreData.rounds.push({ fighter1: left, fighter2: right });
          }
        });
        scores = scoreData;
      }
    });

    // Takedowns section
    let takedowns = null;
    $fight.find('.event-card_takedowns-content').each((_, section) => {
      const $section = $(section);
      if ($section.hasClass('w-condition-invisible')) return;

      const heading = $section.find('.event-card_takedowns-heading-text').text().trim().toLowerCase();
      if (heading === 'takedowns') {
        const rows = $section.find('.fighter-stats_row');
        rows.each((ri, row) => {
          const $r = $(row);
          if ($r.hasClass('totals')) {
            const left = $r.find('.fighter-left-stat .stat-text, .fighter-left-stat div').first().text().trim();
            const right = $r.find('.fighter-right-stat .stat-text, .fighter-right-stat .country-text, .fighter-right-stat div').first().text().trim();
            takedowns = { fighter1: left, fighter2: right };
          }
        });
      }
    });

    fights.push({
      order: fightOrder,
      weightClass,
      isTitle: isTitle || isInterim,
      isInterim,
      fighter1: {
        name: fighter1Name,
        slug: fighter1Slug,
        imageUrl: fighter1Image,
        country: fighter1Country,
        age: fighter1Age,
        club: fighter1Club,
        hometown: fighter1Hometown,
        isChampion: fighter1IsChampion,
      },
      fighter2: {
        name: fighter2Name,
        slug: fighter2Slug,
        imageUrl: fighter2Image,
        country: fighter2Country,
        age: fighter2Age,
        club: fighter2Club,
        hometown: fighter2Hometown,
        isChampion: fighter2IsChampion,
      },
      winner,
      scores,
      takedowns,
      status: winner ? 'complete' : 'upcoming',
    });
  });

  console.log(`  Found ${fights.length} fights`);

  return {
    eventName: eventNumber || eventName,
    eventUrl,
    venue,
    dateTimeText,
    timezone: timezoneText,
    parsedDate: parsedDate?.date || null,
    startTime: parsedDate?.startTime || null,
    isPastEvent,
    fights,
  };
}

/**
 * Main scraper function
 */
async function main() {
  console.log('\n========================================');
  console.log('🤼 RAF (Real American Freestyle) Scraper');
  console.log(`   Mode: ${SCRAPER_MODE}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log('========================================\n');

  const outputDir = path.join(__dirname, '../../scraped-data/raf');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Get all events from gallery
  const galleryEvents = await scrapeEventsGallery();

  // Step 2: Scrape each event page for fight details
  const allEvents = [];
  const allAthletes = new Map();

  // Fallback status from gallery date text: Complete only if the event date
  // is more than 24h in the past, otherwise Upcoming. Used when the event
  // page can't be scraped and isPastEvent isn't available.
  const fallbackStatusFromDate = (dateText) => {
    const parsed = parseRAFDate(dateText);
    if (!parsed?.date) return 'Upcoming';
    const eventTime = new Date(parsed.date).getTime();
    return eventTime + 24 * 60 * 60 * 1000 < Date.now() ? 'Complete' : 'Upcoming';
  };

  for (const galleryEvent of galleryEvents) {
    if (!galleryEvent.eventPageUrl) {
      console.log(`  ⚠ Skipping ${galleryEvent.eventName} - no event page URL`);
      allEvents.push({
        eventName: galleryEvent.eventName,
        eventUrl: '',
        venue: '',
        location: galleryEvent.location,
        dateText: galleryEvent.dateText,
        eventDate: null,
        bannerImage: galleryEvent.bannerImage,
        status: fallbackStatusFromDate(galleryEvent.dateText),
        fights: [],
      });
      continue;
    }

    try {
      const eventData = await scrapeEventPage(galleryEvent.eventPageUrl, galleryEvent.eventName);

      // Collect athletes
      for (const fight of eventData.fights) {
        for (const f of [fight.fighter1, fight.fighter2]) {
          if (f.name && !allAthletes.has(f.name.toLowerCase())) {
            allAthletes.set(f.name.toLowerCase(), {
              name: f.name,
              slug: f.slug,
              imageUrl: f.imageUrl,
              country: f.country,
              club: f.club,
              hometown: f.hometown,
            });
          }
        }
      }

      // Trust the event page's past-event-tag as ground truth when present.
      // This is RAF's own CMS flag and flips both directions cleanly.
      const resolvedStatus = eventData.isPastEvent ? 'Complete' : 'Upcoming';

      allEvents.push({
        eventName: eventData.eventName,
        eventUrl: galleryEvent.eventPageUrl,
        venue: eventData.venue,
        location: galleryEvent.location,
        dateText: galleryEvent.dateText,
        eventDate: eventData.parsedDate,
        startTime: eventData.startTime,
        timezone: eventData.timezone,
        bannerImage: galleryEvent.bannerImage,
        status: resolvedStatus,
        fights: eventData.fights,
      });

      await sleep(DELAY_BETWEEN_EVENTS);
    } catch (error) {
      console.error(`  ✗ Failed to scrape ${galleryEvent.eventName}: ${error.message}`);
      allEvents.push({
        eventName: galleryEvent.eventName,
        eventUrl: galleryEvent.eventPageUrl,
        venue: '',
        location: galleryEvent.location,
        dateText: galleryEvent.dateText,
        eventDate: null,
        bannerImage: galleryEvent.bannerImage,
        status: fallbackStatusFromDate(galleryEvent.dateText),
        fights: [],
      });
    }
  }

  // Save events data
  const eventsOutput = { events: allEvents, scrapedAt: new Date().toISOString() };
  const eventsFile = path.join(outputDir, 'latest-events.json');
  fs.writeFileSync(eventsFile, JSON.stringify(eventsOutput, null, 2));
  console.log(`\n💾 Saved ${allEvents.length} events to ${eventsFile}`);

  // Save athletes data
  const athletesOutput = { athletes: Array.from(allAthletes.values()), scrapedAt: new Date().toISOString() };
  const athletesFile = path.join(outputDir, 'latest-athletes.json');
  fs.writeFileSync(athletesFile, JSON.stringify(athletesOutput, null, 2));
  console.log(`💾 Saved ${allAthletes.size} unique athletes to ${athletesFile}`);

  console.log(`\n✅ ${allEvents.length} events scraped, ${allAthletes.size} unique athletes\n`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
