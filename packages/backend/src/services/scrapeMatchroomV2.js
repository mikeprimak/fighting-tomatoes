/**
 * Matchroom Boxing Scraper V2 - Clean rewrite
 *
 * Simple, linear flow:
 * 1. Scrape events list from matchroomboxing.com/events/
 * 2. For each upcoming event, scrape the event page
 * 3. Extract fighters and fights using DOM selectors
 * 4. Upload images directly to R2
 * 5. Save to database
 *
 * NO local image storage - everything goes to R2
 * NO text parsing fallbacks - DOM only
 * NO complex branching - simple linear flow
 */

const puppeteer = require('puppeteer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// ============== CONFIGURATION ==============

const CONFIG = {
  baseUrl: 'https://www.matchroomboxing.com',
  eventsUrl: 'https://www.matchroomboxing.com/events/',
  timeouts: {
    navigation: 60000,
    contentLoad: 3000,
  },
  delays: {
    betweenEvents: 1000,
  }
};

// ============== R2 STORAGE ==============

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) {
      throw new Error('R2 environment variables not configured');
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
    });
  }
  return s3Client;
}

function getR2PublicUrl(key) {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
  return `https://${process.env.R2_BUCKET}.r2.dev/${key}`;
}

async function uploadImageToR2(imageUrl, fighterName) {
  if (!imageUrl || imageUrl.includes('silhouette')) {
    return null;
  }

  try {
    const client = getS3Client();

    // Generate filename from fighter name
    const cleanName = fighterName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 6);
    const extension = imageUrl.match(/\.(png|jpg|jpeg|webp)$/i)?.[1] || 'png';
    const key = `fighters/matchroom-${cleanName}-${hash}.${extension}`;

    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.log(`    [R2] Failed to download: ${imageUrl}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Upload to R2
    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      CacheControl: 'public, max-age=31536000',
    }));

    const publicUrl = getR2PublicUrl(key);
    console.log(`    [R2] Uploaded: ${fighterName} -> ${key}`);
    return publicUrl;

  } catch (error) {
    console.log(`    [R2] Upload failed for ${fighterName}: ${error.message}`);
    return null;
  }
}

// ============== SCRAPING ==============

async function scrapeEventsList(browser) {
  console.log('\n📋 Step 1: Scraping events list...\n');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  await page.goto(CONFIG.eventsUrl, {
    waitUntil: 'networkidle2',
    timeout: CONFIG.timeouts.navigation
  });

  // Wait for dynamic content
  await new Promise(r => setTimeout(r, CONFIG.timeouts.contentLoad));

  // Extract events from the page
  const events = await page.evaluate((baseUrl) => {
    const now = new Date();
    const results = [];

    // Find all event links
    const eventLinks = document.querySelectorAll('a[href*="/events/"]');

    eventLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href === '/events/' || href.includes('page')) return;

      // Extract slug from URL
      const slugMatch = href.match(/\/events\/([^/]+)\/?$/);
      if (!slugMatch) return;
      const slug = slugMatch[1];

      // Skip duplicates
      if (results.some(e => e.slug === slug)) return;

      // Get parent container to find date
      const container = link.closest('.facetwp-template > div') || link.parentElement?.parentElement;
      if (!container) return;

      const text = container.innerText || '';

      // Extract date (format: "24 Jan" or "24 January")
      const dateMatch = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i);
      if (!dateMatch) return;

      const day = parseInt(dateMatch[1], 10);
      const monthStr = dateMatch[2].toLowerCase().substring(0, 3);
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const month = months[monthStr];

      // Determine year (assume current or next year if month is before current)
      let year = now.getFullYear();
      const testDate = new Date(year, month, day);
      if (testDate < now) {
        // Event is in the past for this year, could be next year
        const nextYearDate = new Date(year + 1, month, day);
        // Only bump to next year if the event would be within reasonable future (not past)
        if (testDate.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) {
          // More than a week in the past - might be next year OR past event
          // Skip past events
          return;
        }
      }

      const eventDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

      // Skip past events
      if (eventDate < now) return;

      // Extract event name from the text (usually the fighter names like "Muratalla VS Cruz")
      const nameMatch = text.match(/([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+VS\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
      const eventName = nameMatch ? `${nameMatch[1]} vs ${nameMatch[2]}` : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // Extract location
      const locationMatch = text.match(/(?:USA|UK|Spain|Mexico|Japan|Germany|Australia|France|Italy|Ireland|Saudi Arabia|Dubai)/i);
      const location = locationMatch ? locationMatch[0] : '';

      results.push({
        slug,
        url: baseUrl + '/events/' + slug + '/',
        name: eventName,
        date: eventDate.toISOString(),
        location
      });
    });

    return results;
  }, CONFIG.baseUrl);

  await page.close();

  console.log(`✅ Found ${events.length} upcoming events\n`);
  return events;
}

async function scrapeEventPage(browser, event) {
  console.log(`\n📦 Scraping: ${event.name} (${event.date.split('T')[0]})`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(event.url, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeouts.navigation
    });

    await new Promise(r => setTimeout(r, CONFIG.timeouts.contentLoad));

    // Extract all data from the page using DOM
    const pageData = await page.evaluate(() => {
      const results = {
        fights: [],
        eventBanner: null,
        venue: null,
        fullDate: null
      };

      // Get event banner from og:image
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage?.content) {
        results.eventBanner = ogImage.content;
      }

      // Get venue and date from page text
      const pageText = document.body.innerText || '';
      const venueMatch = pageText.match(/(?:at|@)\s+([A-Za-z0-9\s,]+(?:Arena|Center|Centre|Stadium|Garden|Hall|Casino|Hotel))/i);
      if (venueMatch) {
        results.venue = venueMatch[1].trim();
      }

      // Extract full date
      const dateMatch = pageText.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
      if (dateMatch) {
        results.fullDate = dateMatch[1];
      }

      // Helper to extract fighter data from a boxer div
      function extractFighter(boxerDiv) {
        if (!boxerDiv) return null;

        // Get name from h2 with first-name/last-name spans
        const h2 = boxerDiv.querySelector('h2');
        let name = '';
        if (h2) {
          const firstName = h2.querySelector('.first-name')?.textContent?.trim() || '';
          const lastName = h2.querySelector('.last-name')?.textContent?.trim() || '';
          name = `${firstName} ${lastName}`.trim();

          // Fallback: get all text from h2 if no structured name
          if (!name) {
            name = h2.textContent?.trim() || '';
          }
        }

        // Skip if no name
        if (!name || name.length < 3) return null;

        // Get record from .record div
        const recordDiv = boxerDiv.querySelector('.record');
        let wins = 0, kos = 0, losses = 0, draws = 0;
        if (recordDiv) {
          const text = recordDiv.textContent || '';
          wins = parseInt(text.match(/W\s*(\d+)/i)?.[1] || '0', 10);
          kos = parseInt(text.match(/KO\s*(\d+)/i)?.[1] || '0', 10);
          losses = parseInt(text.match(/L\s*(\d+)/i)?.[1] || '0', 10);
          draws = parseInt(text.match(/D\s*(\d+)/i)?.[1] || '0', 10);
        }

        // Get image
        const img = boxerDiv.querySelector('.boxer-image img') || boxerDiv.querySelector('img');
        let imageUrl = img?.src || null;

        // Skip silhouette/placeholder images
        if (imageUrl && (imageUrl.includes('silhouette') || imageUrl.includes('placeholder'))) {
          imageUrl = null;
        }

        return {
          name,
          wins,
          kos,
          losses,
          draws,
          record: `${wins}-${losses}-${draws}`,
          imageUrl
        };
      }

      // Extract main event from hero section
      const heroSection = document.querySelector('section.single-event-hero');
      if (heroSection) {
        const boxer1 = extractFighter(heroSection.querySelector('.boxer-1'));
        const boxer2 = extractFighter(heroSection.querySelector('.boxer-2'));

        if (boxer1) {
          results.fights.push({
            cardType: 'Main Event',
            fighter1: boxer1,
            fighter2: boxer2 || { name: 'TBA', wins: 0, kos: 0, losses: 0, draws: 0, record: '0-0-0', imageUrl: null }
          });
        }
      }

      // Extract undercard fights
      const fightDivs = document.querySelectorAll('section.undercard div.fight');
      fightDivs.forEach(fightDiv => {
        const boxer1 = extractFighter(fightDiv.querySelector('.boxer-1'));
        const boxer2 = extractFighter(fightDiv.querySelector('.boxer-2'));

        if (boxer1) {
          results.fights.push({
            cardType: 'Undercard',
            fighter1: boxer1,
            fighter2: boxer2 || { name: 'TBA', wins: 0, kos: 0, losses: 0, draws: 0, record: '0-0-0', imageUrl: null }
          });
        }
      });

      return results;
    });

    console.log(`  Found ${pageData.fights.length} fights`);

    // Upload images to R2 for each fighter
    for (const fight of pageData.fights) {
      if (fight.fighter1.imageUrl) {
        fight.fighter1.r2ImageUrl = await uploadImageToR2(fight.fighter1.imageUrl, fight.fighter1.name);
      }
      if (fight.fighter2.imageUrl) {
        fight.fighter2.r2ImageUrl = await uploadImageToR2(fight.fighter2.imageUrl, fight.fighter2.name);
      }
    }

    await page.close();

    return {
      ...event,
      ...pageData
    };

  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
    await page.close();
    return null;
  }
}

// ============== DATABASE IMPORT ==============

async function importToDatabase(events) {
  const { PrismaClient, Gender, Sport } = require('@prisma/client');
  const prisma = new PrismaClient();

  console.log('\n📥 Importing to database...\n');

  const TBA_FIGHTER_ID = 'tba-fighter-global';

  for (const event of events) {
    if (!event || !event.fights || event.fights.length === 0) continue;

    console.log(`  Event: ${event.name}`);

    // Parse date
    const eventDate = new Date(event.date);

    // Create or update event
    let dbEvent = await prisma.event.findFirst({
      where: {
        promotion: 'Matchroom Boxing',
        date: eventDate
      }
    });

    if (dbEvent) {
      dbEvent = await prisma.event.update({
        where: { id: dbEvent.id },
        data: {
          name: event.name,
          venue: event.venue || undefined,
          location: event.location || undefined,
          bannerImage: event.eventBanner || undefined,
        }
      });
    } else {
      dbEvent = await prisma.event.create({
        data: {
          name: event.name,
          promotion: 'Matchroom Boxing',
          date: eventDate,
          venue: event.venue || undefined,
          location: event.location || undefined,
          bannerImage: event.eventBanner || undefined,
        }
      });
    }

    // Import fights
    for (let i = 0; i < event.fights.length; i++) {
      const fight = event.fights[i];

      // Create/find fighter 1
      const f1Name = parseFighterName(fight.fighter1.name);
      const fighter1 = await prisma.fighter.upsert({
        where: {
          firstName_lastName: { firstName: f1Name.firstName, lastName: f1Name.lastName }
        },
        update: {
          wins: fight.fighter1.wins || undefined,
          losses: fight.fighter1.losses || undefined,
          draws: fight.fighter1.draws || undefined,
          profileImage: fight.fighter1.r2ImageUrl || undefined,
        },
        create: {
          firstName: f1Name.firstName,
          lastName: f1Name.lastName,
          wins: fight.fighter1.wins || 0,
          losses: fight.fighter1.losses || 0,
          draws: fight.fighter1.draws || 0,
          profileImage: fight.fighter1.r2ImageUrl || null,
          gender: Gender.MALE,
          sport: Sport.BOXING,
          isActive: true,
        }
      });

      // Create/find fighter 2 (or use TBA)
      let fighter2Id = TBA_FIGHTER_ID;
      if (fight.fighter2.name !== 'TBA') {
        const f2Name = parseFighterName(fight.fighter2.name);
        const fighter2 = await prisma.fighter.upsert({
          where: {
            firstName_lastName: { firstName: f2Name.firstName, lastName: f2Name.lastName }
          },
          update: {
            wins: fight.fighter2.wins || undefined,
            losses: fight.fighter2.losses || undefined,
            draws: fight.fighter2.draws || undefined,
            profileImage: fight.fighter2.r2ImageUrl || undefined,
          },
          create: {
            firstName: f2Name.firstName,
            lastName: f2Name.lastName,
            wins: fight.fighter2.wins || 0,
            losses: fight.fighter2.losses || 0,
            draws: fight.fighter2.draws || 0,
            profileImage: fight.fighter2.r2ImageUrl || null,
            gender: Gender.MALE,
            sport: Sport.BOXING,
            isActive: true,
          }
        });
        fighter2Id = fighter2.id;
      }

      // Create fight (upsert to avoid duplicates)
      await prisma.fight.upsert({
        where: {
          eventId_fighter1Id_fighter2Id: {
            eventId: dbEvent.id,
            fighter1Id: fighter1.id,
            fighter2Id: fighter2Id,
          }
        },
        update: {
          cardType: fight.cardType,
          orderOnCard: i + 1,
        },
        create: {
          eventId: dbEvent.id,
          fighter1Id: fighter1.id,
          fighter2Id: fighter2Id,
          cardType: fight.cardType,
          orderOnCard: i + 1,
          scheduledRounds: 12,
          hasStarted: false,
          isComplete: false,
        }
      });

      console.log(`    ✓ ${fight.fighter1.name} vs ${fight.fighter2.name}`);
    }
  }

  await prisma.$disconnect();
  console.log('\n✅ Database import complete\n');
}

function parseFighterName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: '', lastName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

// ============== MAIN ==============

async function main() {
  console.log('\n🥊 Matchroom Boxing Scraper V2\n');
  console.log('=' .repeat(50));

  // Verify R2 is configured
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY || !process.env.R2_BUCKET) {
    console.error('❌ R2 environment variables not configured!');
    console.error('Required: R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET');
    process.exit(1);
  }
  console.log('✓ R2 storage configured');

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Step 1: Get events list
    const eventsList = await scrapeEventsList(browser);

    if (eventsList.length === 0) {
      console.log('No upcoming events found');
      return;
    }

    // Step 2: Scrape each event
    const scrapedEvents = [];
    for (const event of eventsList) {
      const eventData = await scrapeEventPage(browser, event);
      if (eventData) {
        scrapedEvents.push(eventData);
      }
      await new Promise(r => setTimeout(r, CONFIG.delays.betweenEvents));
    }

    // Step 3: Import to database
    await importToDatabase(scrapedEvents);

    console.log('=' .repeat(50));
    console.log(`\n🎉 Complete! Scraped ${scrapedEvents.length} events\n`);

  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };
