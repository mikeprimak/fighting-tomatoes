/**
 * RAF Live Event Scraper
 *
 * Fetches a single RAF event page and extracts live fight results.
 * Uses cheerio (no Puppeteer) since the Webflow site is server-rendered.
 *
 * Usage: node scrapeRAFLiveEvent.js <event_url> <output_dir>
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const eventUrl = process.argv[2];
const outputDir = process.argv[3] || path.join(__dirname, '../../live-event-data/raf');

if (!eventUrl) {
  console.error('Usage: node scrapeRAFLiveEvent.js <event_url> [output_dir]');
  process.exit(1);
}

async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function scrapeRAFLiveEvent() {
  console.log(`[RAF LIVE SCRAPER] Fetching: ${eventUrl}`);

  const html = await fetchHTML(eventUrl);
  const $ = cheerio.load(html);

  // Event name
  const eventName = $('.logo-text').first().text().trim() || 'RAF Event';

  // Is it a past event?
  const pastEventTag = $('div.past-event-tag');
  const isPastEvent = pastEventTag.length > 0 && !pastEventTag.hasClass('w-condition-invisible');

  // Check heading: "Match results" visible = event has results
  const matchResultsHeading = $('.event-card_heading').filter((_, el) => {
    const $el = $(el);
    return $el.text().trim().toLowerCase() === 'match results' && !$el.hasClass('w-condition-invisible');
  });
  const hasResults = matchResultsHeading.length > 0;

  // Parse fights
  const fights = [];
  let fightOrder = 0;

  $('.matchups-list .w-dyn-item').each((i, el) => {
    const $fight = $(el);
    fightOrder++;

    const weightClass = $fight.find('.event-card_card-eyebrow').first().text().trim();

    // Championship tag
    const champTags = $fight.find('.event-card_championship-tag');
    let isTitle = false;
    champTags.each((_, tag) => {
      if (!$(tag).hasClass('w-condition-invisible')) {
        isTitle = true;
      }
    });

    // Fighter names
    const nameWrappers = $fight.find('.event-card_card-heading-wrapper .event-card_athlete-name-wrapper');
    const fighter1Name = nameWrappers.eq(0).find('.event-card_card-heading-text').text().trim();
    const fighter2Name = nameWrappers.eq(1).find('.event-card_card-heading-text').text().trim();

    if (!fighter1Name || !fighter2Name) return;

    // Win/loss detection
    let winner = null;
    const f1Win = nameWrappers.eq(0).find('.win-tag');
    const f2Win = nameWrappers.eq(1).find('.win-tag');

    if (f1Win.length > 0 && !f1Win.hasClass('w-condition-invisible')) winner = 'fighter1';
    else if (f2Win.length > 0 && !f2Win.hasClass('w-condition-invisible')) winner = 'fighter2';

    // Scores
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
            const roundLabel = $r.text().trim();
            if (roundLabel.toLowerCase().includes('round')) {
              scoreData.rounds.push({ fighter1: left, fighter2: right });
            }
          }
        });
        scores = scoreData;
      }
    });

    // Takedowns
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

    const isComplete = winner !== null;

    fights.push({
      order: fightOrder,
      weightClass,
      isTitle,
      fighter1Name,
      fighter2Name,
      status: isComplete ? 'complete' : 'upcoming',
      hasStarted: isComplete, // We can't detect "in progress" from static HTML
      isComplete,
      winner,
      scores,
      takedowns,
    });
  });

  // Determine overall event status
  const completedFights = fights.filter(f => f.isComplete).length;
  const totalFights = fights.length;
  let eventStatus = 'upcoming';
  if (isPastEvent || (totalFights > 0 && completedFights === totalFights)) {
    eventStatus = 'complete';
  } else if (completedFights > 0) {
    eventStatus = 'live';
  }

  const result = {
    events: [{
      eventName,
      eventUrl,
      isLiveEvent: eventStatus === 'live',
      hasStarted: completedFights > 0 || isPastEvent,
      isComplete: eventStatus === 'complete',
      status: eventStatus,
      fights,
      scrapedAt: new Date().toISOString(),
    }],
  };

  // Save output
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(outputDir, `raf-live-${timestamp}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

  console.log(`[RAF LIVE SCRAPER] Event: ${eventName}, Status: ${eventStatus}`);
  console.log(`[RAF LIVE SCRAPER] Fights: ${totalFights} total, ${completedFights} complete`);
  console.log(`[RAF LIVE SCRAPER] Saved: ${outputFile}`);
}

scrapeRAFLiveEvent().catch(error => {
  console.error('[RAF LIVE SCRAPER] Fatal:', error.message);
  process.exit(1);
});
