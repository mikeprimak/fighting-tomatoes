/**
 * Scrape upcoming UFC events from UFC.com/events
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  console.log('📄 Loading UFC events page...');
  await page.goto('https://www.ufc.com/events', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait for event cards to load
  await page.waitForSelector('.c-card-event--result__logo', { timeout: 10000 });

  console.log('✅ Page loaded, extracting events...\n');

  const events = await page.evaluate(() => {
    const eventCards = document.querySelectorAll('.l-listing__item');
    const extractedEvents = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Set to start of today for comparison

    eventCards.forEach((card) => {
      // Get event URL and extract event type/number
      const logoLink = card.querySelector('.c-card-event--result__logo a');
      if (!logoLink) return;

      const eventUrl = logoLink.getAttribute('href');
      const fullUrl = `https://www.ufc.com${eventUrl}`;

      // Parse event name from URL
      let eventName = '';
      let eventType = '';

      if (eventUrl.includes('fight-night')) {
        eventType = 'Fight Night';
        // Extract fighters from URL (e.g., "ufc-fight-night-november-22-2025")
        const urlParts = eventUrl.split('/').pop();
        eventName = 'UFC Fight Night'; // Will update with fighters later if needed
      } else {
        // Extract UFC number (e.g., "ufc-320")
        const numberMatch = eventUrl.match(/ufc-(\d+)/);
        if (numberMatch) {
          eventType = 'Numbered';
          const eventNumber = numberMatch[1];
          eventName = `UFC ${eventNumber}`;
        }
      }

      // Get headline from card (contains main event fighters)
      const headlineEl = card.querySelector('.c-card-event--result__headline');
      const headline = headlineEl ? headlineEl.textContent.trim() : '';

      // Extract fighter names from headline if available
      if (headline) {
        // Headline format is usually "Fighter A vs Fighter B" or "Fighter A vs Fighter B 2" for rematches
        const vsMatch = headline.match(/(.+?)\s+vs\.?\s+(.+)/i);
        if (vsMatch) {
          let fighterA = vsMatch[1].trim();
          let fighterB = vsMatch[2].trim();

          // Remove trailing rematch numbers (e.g., "Pereira 2" -> "Pereira")
          fighterA = fighterA.replace(/\s+\d+$/, '');
          fighterB = fighterB.replace(/\s+\d+$/, '');

          // Extract last names (take last word after removing numbers)
          const fighterALastName = fighterA.split(' ').pop();
          const fighterBLastName = fighterB.split(' ').pop();

          if (eventType === 'Fight Night') {
            eventName = `UFC Fight Night ${fighterALastName} vs. ${fighterBLastName}`;
          } else if (eventType === 'Numbered') {
            const numberMatch = eventUrl.match(/ufc-(\d+)/);
            if (numberMatch) {
              eventName = `UFC ${numberMatch[1]}: ${fighterALastName} vs. ${fighterBLastName}`;
            }
          }
        }
      }

      // Get location (city/state/country)
      const locationEl = card.querySelector('.field--name-location .address');
      let city = '';
      let state = '';
      let country = '';

      if (locationEl) {
        const localityEl = locationEl.querySelector('.locality');
        const adminAreaEl = locationEl.querySelector('.administrative-area');
        const countryEl = locationEl.querySelector('.country');

        city = localityEl ? localityEl.textContent.trim() : '';
        state = adminAreaEl ? adminAreaEl.textContent.trim() : '';
        country = countryEl ? countryEl.textContent.trim() : '';
      }

      // Get venue/arena
      const venueEl = card.querySelector('.field--name-taxonomy-term-title h5');
      const venue = venueEl ? venueEl.textContent.trim() : '';

      // Get date
      const dateEl = card.querySelector('.c-card-event--result__date');
      const dateText = dateEl ? dateEl.textContent.trim() : '';

      // Parse date to filter out past events
      let eventDate = null;
      if (dateText) {
        // Date format: "Sat, Oct 4 / 10:00 PM EDT / Main Card"
        const dateMatch = dateText.match(/([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d{1,2})/);
        if (dateMatch) {
          const monthStr = dateMatch[2];
          const day = parseInt(dateMatch[3], 10);

          // Map month abbreviations to numbers
          const months = {
            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
          };

          const month = months[monthStr];
          if (month !== undefined) {
            let year = now.getFullYear();
            eventDate = new Date(year, month, day);
            eventDate.setHours(0, 0, 0, 0);

            // If the event is in the past, skip it (don't try next year)
            if (eventDate < now) {
              return;
            }
          }
        }
      }

      // Get event status (upcoming/live/past)
      const statusEl = card.querySelector('.c-card-event--result__status');
      const status = statusEl ? statusEl.textContent.trim() : 'Upcoming';

      extractedEvents.push({
        eventName,
        eventType,
        headline,
        eventUrl: fullUrl,
        venue,
        city,
        state,
        country,
        dateText,
        status
      });
    });

    return extractedEvents;
  });

  await browser.close();

  // Display results
  console.log(`\n=== UFC UPCOMING EVENTS ===\n`);
  console.log(`Total Events Found: ${events.length}\n`);

  events.forEach((event, index) => {
    console.log(`${index + 1}. ${event.eventName}`);
    console.log(`   Date: ${event.dateText}`);
    console.log(`   Venue: ${event.venue}`);
    console.log(`   Location: ${[event.city, event.state, event.country].filter(Boolean).join(', ')}`);
    console.log(`   URL: ${event.eventUrl}`);
    console.log(`   Status: ${event.status}`);
    console.log('');
  });

  // Save to file
  const outputDir = path.join(__dirname, '../../test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'ufc-events.json');
  fs.writeFileSync(outputPath, JSON.stringify({ events }, null, 2));

  console.log(`💾 Saved to: ${outputPath}`);
  console.log('✅ Done!');
})().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
