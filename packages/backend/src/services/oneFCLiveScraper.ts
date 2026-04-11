/**
 * ONE FC Live Event Scraper
 *
 * Fetches live fight data from ONE FC event pages during active events.
 * Uses Puppeteer to scrape HTML as ONE FC doesn't have a public results API.
 *
 * HTML Structure:
 * - .event-matchup - Each fight card
 * - .is-live - Indicates currently live fight (at top of matchup)
 * - .sticker.is-win - Winner indicator with method/round
 * - .face.face1, .face.face2 - Fighter links
 * - .versus - "FighterA vs. FighterB" text
 * - .title - Weight class
 *
 * Fight Status Detection:
 * - Complete: Has .sticker.is-win element
 * - Live: Has .is-live element
 * - Upcoming: No .is-live and no .is-win
 *
 * Usage:
 *   npx ts-node src/services/oneFCLiveScraper.ts [eventUrl] [intervalSeconds]
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// ============== TYPE DEFINITIONS ==============

interface OneFCFighterInfo {
  name: string;
  lastName: string;
  firstName: string;
  athleteUrl?: string;
  imageUrl?: string;
  country?: string;
  isWinner: boolean;
}

interface OneFCFightResult {
  winner?: string;        // Winner's name
  winnerSide?: 'A' | 'B'; // Which fighter won
  method?: string;        // "KO", "TKO", "UD", etc.
  round?: number;
  time?: string;          // "2:34" format
}

interface OneFCFightData {
  fightId: string;
  order: number;
  weightClass: string;
  sport: string;          // "MMA", "Muay Thai", "Kickboxing"
  isTitle: boolean;
  fighterA: OneFCFighterInfo;
  fighterB: OneFCFighterInfo;
  hasStarted: boolean;    // True if live or complete (used by parser to detect UPCOMING -> LIVE)
  isComplete: boolean;    // True if fight has ended (used by parser to detect -> COMPLETED)
  isLive?: boolean;       // True if fight is currently happening
  result?: OneFCFightResult;
}

export interface OneFCEventData {
  eventId: string;
  eventName: string;
  eventUrl: string;
  venue?: string;
  location?: string;
  eventDate?: string;
  status: 'upcoming' | 'live' | 'complete';
  hasStarted: boolean;    // Used by parser to detect event started
  isComplete: boolean;    // Used by parser to detect event complete
  fights: OneFCFightData[];
  timestamp: string;
  scrapeDuration?: number;
}

interface OneFCScraperSnapshot {
  data: OneFCEventData;
  changes: string[];
}

// ============== HELPER FUNCTIONS ==============

/**
 * Parse fighter name into first and last name
 * Prefers athlete URL slug over display name for consistency with the daily scraper,
 * which also parses from URL slugs. This is critical for Thai Muay Thai fighters
 * whose display names (e.g., "Payakrut") differ from their URL slugs
 * (e.g., "/athletes/payakrut-suajantokmuaythai/").
 */
function parseFighterName(fullName: string, athleteUrl?: string): { firstName: string; lastName: string } {
  // Try URL slug first (matches daily scraper's parseOneFCFighterName logic)
  if (athleteUrl) {
    const urlMatch = athleteUrl.match(/\/athletes\/([^/]+)\/?$/);
    if (urlMatch) {
      let slug = urlMatch[1];
      try {
        if (/%[0-9A-Fa-f]{2}/.test(slug)) {
          slug = decodeURIComponent(slug);
        }
      } catch (e) {
        // Keep original slug if decoding fails
      }
      const parts = slug.split('-').map(p =>
        p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      );
      if (parts.length >= 2) {
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
      } else if (parts.length === 1) {
        return { firstName: '', lastName: parts[0] };
      }
    }
  }

  // Fallback: parse from display name
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    // Single name fighter - store in lastName
    return { firstName: '', lastName: parts[0] };
  }
  // Last part is lastName, rest is firstName
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

/**
 * Parse method and round from sticker text
 * Examples: "TKO (R2)", "UD (R3)", "KO (R1)", "SUB (R2)"
 */
function parseMethodAndRound(stickerText: string): { method?: string; round?: number; time?: string } {
  const cleaned = stickerText.replace(/WIN/i, '').trim();

  // Match patterns like "TKO (R2)" or "UD (R3)"
  const match = cleaned.match(/^(\w+)\s*\(R(\d+)\)/i);
  if (match) {
    return {
      method: match[1].toUpperCase(),
      round: parseInt(match[2], 10)
    };
  }

  // Try pattern with time like "TKO (R2 2:34)"
  const matchWithTime = cleaned.match(/^(\w+)\s*\(R(\d+)[\s,]+(\d+:\d+)\)/i);
  if (matchWithTime) {
    return {
      method: matchWithTime[1].toUpperCase(),
      round: parseInt(matchWithTime[2], 10),
      time: matchWithTime[3]
    };
  }

  // Just method without round
  const methodOnly = cleaned.match(/^(\w+)/);
  if (methodOnly) {
    return { method: methodOnly[1].toUpperCase() };
  }

  return {};
}

/**
 * Determine sport from weight class text
 */
function parseSport(weightClass: string): string {
  const lower = weightClass.toLowerCase();
  if (lower.includes('muay thai')) return 'Muay Thai';
  if (lower.includes('kickboxing')) return 'Kickboxing';
  if (lower.includes('submission grappling')) return 'Submission Grappling';
  if (lower.includes('mma')) return 'MMA';
  // Default to MMA if no sport specified
  return 'MMA';
}

/**
 * Clean weight class string
 */
function cleanWeightClass(raw: string): string {
  return raw
    .replace(/muay thai/gi, '')
    .replace(/kickboxing/gi, '')
    .replace(/submission grappling/gi, '')
    .replace(/mma/gi, '')
    .replace(/world championship/gi, '')
    .replace(/championship/gi, '')
    .trim();
}

// ============== ONE FC LIVE SCRAPER CLASS ==============

class OneFCLiveScraper {
  private outputDir: string;
  private eventUrl: string;
  private eventSlug: string;
  private snapshots: OneFCScraperSnapshot[] = [];
  private previousState: OneFCEventData | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private browser: Browser | null = null;

  constructor(eventUrl: string, outputDir?: string) {
    this.eventUrl = eventUrl;

    // Extract slug from URL
    const match = eventUrl.match(/events\/([^/?]+)/);
    this.eventSlug = match ? match[1] : 'unknown-event';

    this.outputDir = outputDir || path.join(__dirname, '../../live-event-data/onefc');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize browser if not already running
   */
  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  /**
   * Scrape event page HTML
   */
  private async scrapeEventPage(): Promise<any> {
    const startTime = Date.now();
    const browser = await this.ensureBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
      console.log(`  📡 Fetching: ${this.eventUrl}`);

      await page.goto(this.eventUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for fight cards to load
      await page.waitForSelector('.event-matchup', { timeout: 10000 }).catch(() => {
        console.log('  ⚠ No .event-matchup found, trying alternative selectors...');
      });

      const eventData = await page.evaluate(() => {
        // Helper to extract short-form method text from a sticker element.
        // ONE FC stickers contain two spans: long form (e.g. "Unanimous Decision (R3)")
        // visible at xxl+ breakpoints, and short form (e.g. "UD (R3)") visible below xxl.
        // textContent concatenates both, breaking the parser. Prefer the short form.
        const getStickerMethodText = (sticker: Element): string => {
          const shortSpan = sticker.querySelector('.d-xxl-none');
          if (shortSpan?.textContent?.trim()) {
            return shortSpan.textContent.trim();
          }
          // Fallback to full textContent if no short span found
          return sticker.textContent?.trim() || '';
        };

        // Helper to create a unique fight signature
        const createFightSignature = (fighterA: string, fighterB: string) => {
          return [fighterA, fighterB]
            .map(n => n.toLowerCase().trim())
            .sort()
            .join('|');
        };

        // Track seen fights to avoid duplicates
        const seenFights = new Set<string>();
        let fightOrder = 0; // Counter for fight order

        // Get event name from page title or hero
        const titleEl = document.querySelector('h1, .event-title, .hero-title');
        const eventName = titleEl?.textContent?.trim() || document.title.split('|')[0].trim();

        // Get venue/location
        const venueEl = document.querySelector('.location, .venue, .event-location');
        const venue = venueEl?.textContent?.trim() || '';

        // Get all fight matchups.
        //
        // ONE FC's event pages render a "Next Event" hero section above the
        // fight list that includes an `.event-matchup`-classed duplicate of
        // the currently-featured/headline fight. The duplicate is a full
        // matchup node — same `.stats` table, same face1/face2 anchors with
        // real athlete URLs — so it can't be distinguished by content. But
        // it lives inside a `.box-post-event` / `.event-live-status` /
        // `.status-matchup` ancestor chain, while real main-list matchups
        // live inside the main content `.col-12.col-lg-9...` column.
        //
        // Prior to this filter, iterating `.event-matchup` in DOM order hit
        // the hero duplicate first. The `seenFights` dedup marked the
        // fighter pair as processed. The real matchup in the main list was
        // silently skipped. Worse: the hero version on a finished event
        // shows empty stickers (no `is-win` on either face), so whichever
        // fight was featured was permanently recorded as `isComplete: false`
        // — exactly the ONE 150 main event Kompet vs Attachai Kelasport
        // bug. The daily scraper hit the same duplicate, causing ONE 150's
        // `orderOnCard` values to start at 2 instead of 1.
        //
        // Reject any matchup that lives inside the hero section.
        const allMatchups = document.querySelectorAll('.event-matchup');
        const matchups = Array.from(allMatchups).filter((m) => {
          if (m.closest('.box-post-event')) return false;
          if (m.closest('.event-live-status')) return false;
          if (m.closest('.status-matchup')) return false;
          const hasStats = !!m.querySelector('.stats table tr.vs');
          const face1 = m.querySelector('a.face.face1') as HTMLAnchorElement | null;
          const face2 = m.querySelector('a.face.face2') as HTMLAnchorElement | null;
          const hasFace1 = !!(face1 && face1.href && face1.href.includes('/athletes/'));
          const hasFace2 = !!(face2 && face2.href && face2.href.includes('/athletes/'));
          return hasStats && hasFace1 && hasFace2;
        });
        const fights: any[] = [];

        matchups.forEach((matchup, index) => {
          // Get weight class / title
          const titleEl = matchup.querySelector('.title');
          const weightClass = titleEl?.textContent?.trim() || '';
          const isTitle = weightClass.toLowerCase().includes('championship') ||
                          weightClass.toLowerCase().includes('world title');

          // Get versus text
          const versusEl = matchup.querySelector('.versus');
          const versusText = versusEl?.textContent?.trim() || '';

          // Parse fighter names from versus
          let fighterAName = '';
          let fighterBName = '';

          const vsMatch = versusText.match(/(.+?)\s+vs\.?\s+(.+)/i);
          if (vsMatch) {
            fighterAName = vsMatch[1].trim();
            fighterBName = vsMatch[2].trim();
          }

          // Get fighter profile URLs and images
          const face1 = matchup.querySelector('a.face.face1') as HTMLAnchorElement;
          const face2 = matchup.querySelector('a.face.face2') as HTMLAnchorElement;

          const fighterAUrl = face1?.href || '';
          const fighterBUrl = face2?.href || '';

          const img1 = face1?.querySelector('img') as HTMLImageElement;
          const img2 = face2?.querySelector('img') as HTMLImageElement;

          const fighterAImg = img1?.src || img1?.getAttribute('data-src') || '';
          const fighterBImg = img2?.src || img2?.getAttribute('data-src') || '';

          // Check for WIN stickers.
          //
          // ONE FC's DOM structure puts `.sticker` elements INSIDE each
          // face anchor (`<a class="face faceN">`). Only the winning
          // fighter's face has its sticker flagged `is-win`. The prior
          // detection chain (methods 1-4) was broken: method 1 used
          // `face1.closest('[class*="matchup"]').querySelector('.sticker.is-win')`
          // which always returns the first winner sticker anywhere inside
          // the `.event-matchup` regardless of which face it belongs to,
          // so both `fighterAWon` and `fighterBWon` would get set to true
          // for every completed fight and the downstream `fighterAWon ? 'A' : 'B'`
          // defaulted every result to side A. (That's why every fight on
          // ONE 150 was being recorded with fighter1 as the winner.)
          //
          // Correct approach: scope the search strictly to each face's own
          // subtree. If `face1` contains a `.sticker.is-win`, fighter A
          // won; same for face2. Mutually exclusive by construction.
          let fighterAWon = false;
          let fighterBWon = false;
          let methodText = '';

          const face1WinSticker = face1?.querySelector('.sticker.is-win') || null;
          const face2WinSticker = face2?.querySelector('.sticker.is-win') || null;

          if (face1WinSticker) {
            fighterAWon = true;
            methodText = getStickerMethodText(face1WinSticker);
          }
          if (face2WinSticker) {
            fighterBWon = true;
            methodText = getStickerMethodText(face2WinSticker);
          }

          // Fallback for defensive legacy shapes: if neither face owns a
          // sticker but the matchup has one somewhere else (e.g. ONE FC
          // briefly restructures the DOM), walk up from the sticker to
          // find which face1/face2 ancestor owns it. Kept minimal.
          if (!fighterAWon && !fighterBWon) {
            const allStickers = matchup.querySelectorAll('.sticker.is-win');
            allStickers.forEach(sticker => {
              const stickerParent = sticker.parentElement;
              methodText = getStickerMethodText(sticker);

              // Walk up and check classList for face1/face2 indicators
              let parent = stickerParent;
              while (parent && parent !== matchup) {
                const classes = parent.className || '';
                if (classes.includes('face1') || classes.includes('fighter-1') || classes.includes('left')) {
                  fighterAWon = true;
                  break;
                }
                if (classes.includes('face2') || classes.includes('fighter-2') || classes.includes('right')) {
                  fighterBWon = true;
                  break;
                }
                parent = parent.parentElement;
              }
            });
          }

          // Determine fight status
          const isComplete = fighterAWon || fighterBWon;

          // Check for .is-live indicator - means this fight is currently happening
          // The is-live class can be on the matchup itself, or on a child element
          const matchupHasLiveClass = matchup.classList.contains('is-live');
          const liveIndicator = matchup.querySelector('.is-live');
          const statusText = matchup.querySelector('.status-text');
          const statusTextIsLive = statusText?.textContent?.toLowerCase().includes('live');

          // A fight is live if:
          // 1. It's not complete AND
          // 2. Has any live indicator (is-live class or "live" in status text)
          const isLive = !isComplete && (matchupHasLiveClass || liveIndicator !== null || statusTextIsLive);

          // Skip duplicates - check if we've already seen this fight
          const fightSignature = createFightSignature(fighterAName, fighterBName);
          if (seenFights.has(fightSignature)) {
            // Skip this duplicate
            return;
          }
          seenFights.add(fightSignature);
          fightOrder++;

          fights.push({
            order: fightOrder,
            weightClass,
            isTitle,
            fighterAName,
            fighterBName,
            fighterAUrl,
            fighterBUrl,
            fighterAImg,
            fighterBImg,
            fighterAWon,
            fighterBWon,
            isComplete,
            isLive: isLive,
            methodText
          });
        });

        return {
          eventName,
          venue,
          fights
        };
      });

      const duration = Date.now() - startTime;
      console.log(`  📥 Page scraped in ${duration}ms, found ${eventData.fights.length} fights`);

      await page.close();
      return eventData;

    } catch (error: any) {
      await page.close();
      throw error;
    }
  }

  /**
   * Parse scraped data into structured format
   */
  private parseEventData(rawData: any): OneFCEventData {
    const fights: OneFCFightData[] = [];

    for (const fight of rawData.fights || []) {
      const sport = parseSport(fight.weightClass);
      const weightClass = cleanWeightClass(fight.weightClass);

      const fighterANames = parseFighterName(fight.fighterAName, fight.fighterAUrl);
      const fighterBNames = parseFighterName(fight.fighterBName, fight.fighterBUrl);

      let result: OneFCFightResult | undefined;

      if (fight.isComplete) {
        const parsed = parseMethodAndRound(fight.methodText);
        result = {
          winner: fight.fighterAWon ? fight.fighterAName : fight.fighterBName,
          winnerSide: fight.fighterAWon ? 'A' : 'B',
          method: parsed.method,
          round: parsed.round,
          time: parsed.time
        };
      }

      // Determine hasStarted: true if fight is complete OR currently live
      const hasStarted = fight.isComplete || fight.isLive;

      fights.push({
        fightId: `onefc-${this.eventSlug}-${fight.order}`,
        order: fight.order,
        weightClass,
        sport,
        isTitle: fight.isTitle,
        fighterA: {
          name: fight.fighterAName,
          firstName: fighterANames.firstName,
          lastName: fighterANames.lastName,
          athleteUrl: fight.fighterAUrl,
          imageUrl: fight.fighterAImg,
          isWinner: fight.fighterAWon
        },
        fighterB: {
          name: fight.fighterBName,
          firstName: fighterBNames.firstName,
          lastName: fighterBNames.lastName,
          athleteUrl: fight.fighterBUrl,
          imageUrl: fight.fighterBImg,
          isWinner: fight.fighterBWon
        },
        hasStarted,
        isComplete: fight.isComplete,
        isLive: fight.isLive,
        result
      });
    }

    // Determine event status
    const completedFights = fights.filter(f => f.isComplete).length;
    const liveFights = fights.filter(f => f.isLive).length;
    const totalFights = fights.length;

    let status: 'upcoming' | 'live' | 'complete' = 'upcoming';
    let hasStarted = false;
    let isComplete = false;

    if (totalFights > 0) {
      if (completedFights === totalFights) {
        status = 'complete';
        hasStarted = true;
        isComplete = true;
      } else if (completedFights > 0 || liveFights > 0) {
        // Event is live if any fight has started or is currently live
        status = 'live';
        hasStarted = true;
      }
    }

    return {
      eventId: this.eventSlug,
      eventName: rawData.eventName || this.eventSlug,
      eventUrl: this.eventUrl,
      venue: rawData.venue,
      status,
      hasStarted,
      isComplete,
      fights,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detect changes between current and previous state
   */
  private detectChanges(current: OneFCEventData): string[] {
    const changes: string[] = [];

    if (!this.previousState) {
      changes.push('Initial scrape');
      return changes;
    }

    const prev = this.previousState;

    // Event-level changes
    if (current.hasStarted && !prev.hasStarted) {
      changes.push('🔴 EVENT STARTED');
    }
    if (current.isComplete && !prev.isComplete) {
      changes.push('✅ EVENT COMPLETE');
    }

    // Fight-level changes
    for (const fight of current.fights) {
      const prevFight = prev.fights.find(f =>
        f.fighterA.lastName === fight.fighterA.lastName &&
        f.fighterB.lastName === fight.fighterB.lastName
      );

      if (!prevFight) {
        changes.push(`➕ New fight: ${fight.fighterA.name} vs ${fight.fighterB.name}`);
        continue;
      }

      if (fight.hasStarted && !prevFight.hasStarted) {
        changes.push(`🥊 FIGHT STARTED: ${fight.fighterA.name} vs ${fight.fighterB.name}`);
      }

      if (fight.isComplete && !prevFight.isComplete) {
        const resultStr = fight.result
          ? ` - ${fight.result.winner} wins by ${fight.result.method || 'Unknown'}${fight.result.round ? ` R${fight.result.round}` : ''}`
          : '';
        changes.push(`🏆 FIGHT COMPLETE: ${fight.fighterA.name} vs ${fight.fighterB.name}${resultStr}`);
      }
    }

    return changes;
  }

  /**
   * Main scrape function
   */
  public async scrape(): Promise<OneFCEventData> {
    const startTime = Date.now();
    console.log(`\n⏰ [${new Date().toISOString()}] Scraping ONE FC event...`);
    console.log(`   URL: ${this.eventUrl}`);

    try {
      const rawData = await this.scrapeEventPage();
      const eventData = this.parseEventData(rawData);
      eventData.scrapeDuration = Date.now() - startTime;

      // Detect and log changes
      const changes = this.detectChanges(eventData);

      console.log(`\n📊 Event: ${eventData.eventName}`);
      console.log(`   Status: ${eventData.status}`);
      console.log(`   Fights: ${eventData.fights.length}`);
      console.log(`   Duration: ${eventData.scrapeDuration}ms`);

      if (changes.length > 0 && changes[0] !== 'Initial scrape') {
        console.log('\n📢 CHANGES DETECTED:');
        changes.forEach(c => console.log(`   ${c}`));
      }

      // Log fight card
      console.log('\n🥊 Fight Card:');
      eventData.fights.forEach((fight, i) => {
        let statusIcon = '⏳'; // upcoming
        if (fight.isComplete) {
          statusIcon = '✅'; // complete
        } else if (fight.isLive) {
          statusIcon = '🔴'; // live
        }
        const resultStr = fight.result
          ? ` → ${fight.result.winner} by ${fight.result.method || '?'}${fight.result.round ? ` R${fight.result.round}` : ''}`
          : '';
        console.log(`   ${i + 1}. ${statusIcon} ${fight.fighterA.name} vs ${fight.fighterB.name}${resultStr}`);
      });

      // Save snapshot
      this.snapshots.push({ data: eventData, changes });
      this.previousState = eventData;

      return eventData;

    } catch (error: any) {
      console.error(`\n❌ Scrape failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start polling
   */
  public async startPolling(intervalSeconds: number = 60): Promise<void> {
    console.log('\n🚀 Starting ONE FC Live Scraper...');
    console.log(`📊 Polling every ${intervalSeconds} seconds`);
    console.log(`📁 Output: ${this.outputDir}\n`);

    // Initial scrape
    await this.scrape();

    // Set up interval
    this.intervalId = setInterval(async () => {
      try {
        await this.scrape();

        // Auto-save every 10 snapshots
        if (this.snapshots.length % 10 === 0) {
          this.save();
        }
      } catch (error: any) {
        console.error(`Scrape error: ${error.message}`);
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Stop polling and close browser
   */
  public async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.save();
    console.log('\n🛑 Scraper stopped\n');
  }

  /**
   * Save snapshots to file
   */
  public save(): void {
    if (this.snapshots.length === 0) return;

    const filename = `onefc-${this.eventSlug}-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);

    const output = {
      eventUrl: this.eventUrl,
      totalSnapshots: this.snapshots.length,
      firstScrape: this.snapshots[0]?.data.timestamp,
      lastScrape: this.snapshots[this.snapshots.length - 1]?.data.timestamp,
      snapshots: this.snapshots,
    };

    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved ${this.snapshots.length} snapshots to ${filename}`);
  }

  /**
   * Get current state
   */
  public getCurrentState(): OneFCEventData | null {
    return this.previousState;
  }
}

// ============== EXPORTS ==============

export default OneFCLiveScraper;
export { OneFCFightData, OneFCFightResult };

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://www.onefc.com/events/one-friday-fights-139/';
  const intervalSeconds = parseInt(process.argv[3] || '60', 10);

  const scraper = new OneFCLiveScraper(eventUrl);

  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    await scraper.stop();
    process.exit(0);
  });

  scraper.startPolling(intervalSeconds).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

  console.log('\n💡 Press Ctrl+C to stop and save results\n');
}
