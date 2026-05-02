/**
 * PFL Live Event Scraper
 *
 * Fetches live fight data from pflmma.com event pages during active events.
 * Uses Puppeteer because pflmma.com loads the fight card via AJAX into
 * `#fight_card_component`.
 *
 * HTML structure (verified against pfl-belfast-2026, pfl-chicago-2026,
 * pfl-africa-pretoria, pfl-pittsburgh, 2026-pfl-madrid, pfl-sioux-falls-2026):
 *
 *   <div class="matchupRow" id="fightCardWrapper{N}">
 *     <div id="fightCardRow{N}">     <!-- collapsed (mobile/default) -->
 *       <div class="fight_status_{fighterIdA} winner|loser">
 *         <span class="winBy">KO|TKO|Submission|Decision</span>
 *         <span class="roundTime">R1 0:37</span>  (or "R1, 2:09" — both seen)
 *       </div>
 *       <div class="fight_status_{fighterIdB} winner|loser"> ... </div>
 *       <a href="/fighter/{slug}" ...>
 *       <h4>{LastName}</h4>
 *     </div>
 *     <div id="fightCardModal{N}"> <!-- expanded (duplicate, has full names) -->
 *       <h4>{First}<br>{Last}</h4>
 *       ...
 *     </div>
 *   </div>
 *   <div id="liveNow_{N}" style="display: none;">LIVE</div>
 *
 * Discrimination:
 *   - .winner / .loser class on fight_status div → fight COMPLETED
 *   - liveNow_{N} display != 'none' → fight LIVE in progress
 *   - Neither → UPCOMING
 *
 * To avoid duplicate iteration, we iterate fightCardWrapper containers and
 * read names/results from the EXPANDED view (full first+last names).
 *
 * Usage:
 *   npx ts-node src/services/pflLiveScraper.ts [eventUrl] [intervalSeconds]
 */

import puppeteer, { Browser } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// ============== TYPE DEFINITIONS ==============

export interface PFLFighterInfo {
  name: string;
  firstName: string;
  lastName: string;
  athleteUrl?: string;
  imageUrl?: string;
  pflFighterId?: string; // numeric ID from fight_status_{id} class
  isWinner: boolean;
}

export interface PFLFightResult {
  winner?: string;          // Winner's display name
  winnerSide?: 'A' | 'B';   // Which fighter won
  method?: string;          // Normalized: KO, TKO, SUB, DEC
  round?: number;
  time?: string;            // "M:SS" format
}

export interface PFLFightData {
  fightId: string;
  order: number;            // From fightCardWrapper{N}
  weightClass: string;
  sport: string;            // Always "MMA" for PFL
  isTitle: boolean;
  fighterA: PFLFighterInfo;
  fighterB: PFLFighterInfo;
  hasStarted: boolean;
  isComplete: boolean;
  isLive?: boolean;
  result?: PFLFightResult;
}

export interface PFLEventData {
  eventId: string;
  eventName: string;
  eventUrl: string;
  venue?: string;
  status: 'upcoming' | 'live' | 'complete';
  hasStarted: boolean;
  isComplete: boolean;
  fights: PFLFightData[];
  timestamp: string;
  scrapeDuration?: number;
}

interface PFLScraperSnapshot {
  data: PFLEventData;
  changes: string[];
}

// ============== HELPER FUNCTIONS ==============

/**
 * Map pflmma.com's method vocabulary to the app's enum.
 * Verified vocab across 5 events: KO, TKO, Submission, Decision.
 * Defensive: unknown methods pass through uppercased and the parser will log.
 */
export function normalizePFLMethod(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase();
  switch (upper) {
    case 'KO':
      return 'KO';
    case 'TKO':
      return 'TKO';
    case 'SUBMISSION':
    case 'SUB':
      return 'SUB';
    case 'DECISION':
    case 'DEC':
      return 'DEC';
    case 'DQ':
    case 'DISQUALIFICATION':
      return 'DQ';
    case 'NC':
    case 'NO CONTEST':
      return 'NC';
    case 'DRAW':
      return 'DRAW';
    default:
      return upper;
  }
}

/**
 * Parse round + time from .roundTime span text.
 * Formats observed: "R1 0:37" (newer) and "R1, 2:09" (older).
 * Returns { round, time } where time is "M:SS".
 */
export function parseRoundTime(raw: string | undefined): { round?: number; time?: string } {
  if (!raw) return {};
  const m = raw.match(/R(\d+)[,\s]+(\d{1,2}:\d{2})/);
  if (m) return { round: parseInt(m[1], 10), time: m[2] };
  // Fallback: just round
  const r = raw.match(/R(\d+)/);
  if (r) return { round: parseInt(r[1], 10) };
  return {};
}

/**
 * Parse fighter name from URL slug or display name.
 * URL slug is most reliable (e.g. "/fighter/darragh-kelly" → "Darragh Kelly").
 */
export function parsePFLFighterName(
  displayName: string,
  athleteUrl?: string
): { firstName: string; lastName: string } {
  if (athleteUrl) {
    const slugMatch = athleteUrl.match(/\/fighter\/([^/?#]+)/);
    if (slugMatch) {
      let slug = slugMatch[1];
      try {
        if (/%[0-9A-Fa-f]{2}/.test(slug)) slug = decodeURIComponent(slug);
      } catch {
        // keep raw slug
      }
      const parts = slug
        .split('-')
        .filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
      if (parts.length >= 2) {
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
      }
      if (parts.length === 1) {
        return { firstName: '', lastName: parts[0] };
      }
    }
  }
  const cleaned = (displayName || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ============== SCRAPER CLASS ==============

export class PFLLiveScraper {
  private outputDir: string;
  private eventUrl: string;
  private eventSlug: string;
  private snapshots: PFLScraperSnapshot[] = [];
  private previousState: PFLEventData | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private browser: Browser | null = null;

  constructor(eventUrl: string, outputDir?: string) {
    this.eventUrl = eventUrl;
    const m = eventUrl.match(/\/event\/([^/?#]+)/);
    this.eventSlug = m ? m[1] : 'unknown-pfl-event';
    this.outputDir = outputDir || path.join(__dirname, '../../live-event-data/pfl');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  /**
   * Render the page and extract raw fight data from the DOM.
   * Pure DOM extraction — no normalization. parseEventData() handles that.
   */
  private async scrapeEventPage(): Promise<any> {
    const startTime = Date.now();
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    try {
      console.log(`  📡 Fetching: ${this.eventUrl}`);
      await page.goto(this.eventUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      try {
        await page.waitForSelector('#fight_card_component', { timeout: 15000 });
        // pflmma loads fight card via AJAX after the component mounts
        await new Promise(r => setTimeout(r, 4000));
      } catch {
        console.log('  ⚠ #fight_card_component not found; trying anyway');
      }

      const eventData = await page.evaluate(() => {
        const titleEl = document.querySelector('h1, .event-title');
        const eventName =
          titleEl?.textContent?.trim() ||
          document.title.split('|')[0].trim() ||
          'PFL Event';

        const venueEl = document.querySelector('.event-venue, .venue, .event-location');
        const venue = venueEl?.textContent?.trim() || '';

        // One container per fight; iterate these (NOT [id^="fightCardRow"] —
        // those exist twice each via collapsed/expanded views).
        const wrappers = Array.from(
          document.querySelectorAll('[id^="fightCardWrapper"]')
        );

        const fights: any[] = [];

        for (const wrapper of wrappers) {
          const idMatch = wrapper.id.match(/fightCardWrapper(\d+)/);
          if (!idMatch) continue;
          const order = parseInt(idMatch[1], 10);

          // Live indicator lives outside the wrapper but is keyed by N
          const liveNow = document.getElementById(`liveNow_${order}`);
          const liveDisplay = liveNow ? (liveNow.style.display || '').toLowerCase() : 'none';
          const isLive = !!liveNow && liveDisplay !== 'none';

          // Use collapsed view as the primary source. It's always present and
          // contains everything we need. Expanded view ("Modal") is hidden by
          // default and duplicates everything.
          const collapsed =
            wrapper.querySelector(`#fightCardRow${order}`) ||
            wrapper.querySelector('[id^="fightCardRow"]') ||
            wrapper;

          // Two fighter status divs: fight_status_{id} possibly with .winner/.loser
          const statusDivs = Array.from(
            collapsed.querySelectorAll('div[class^="fight_status_"], div[class*=" fight_status_"]')
          ).filter(d => /fight_status_\d+/.test(d.className));

          if (statusDivs.length < 2) continue;

          // Take the first two status divs as fighter A and fighter B
          const sideA = statusDivs[0];
          const sideB = statusDivs[1];

          const parseSide = (statusDiv: Element) => {
            const classMatch = statusDiv.className.match(/fight_status_(\d+)/);
            const fighterId = classMatch ? classMatch[1] : '';
            const isWinner = / winner(\s|$)/.test(' ' + statusDiv.className);
            const isLoser = / loser(\s|$)/.test(' ' + statusDiv.className);
            const winByEl = statusDiv.querySelector('span.winBy');
            const roundTimeEl = statusDiv.querySelector('span.roundTime');
            const winBy = winByEl?.textContent?.trim() || '';
            const roundTime = roundTimeEl?.textContent?.trim() || '';
            return { fighterId, isWinner, isLoser, winBy, roundTime };
          };

          const aSide = parseSide(sideA);
          const bSide = parseSide(sideB);

          // Find each fighter's profile link + headshot. The collapsed view
          // arranges them in two columns; we identify by proximity to each
          // fight_status div (same parent ancestor).
          //
          // Strategy: for each side, walk up to find the closest .col ancestor
          // and search within it for /fighter/ links + img.
          // Read h4 text via innerHTML so we can normalize <br> to a space
          // before stripping tags. Headless Puppeteer's innerText collapses
          // <br> with no separator, producing "DarraghKelly" instead of
          // "Darragh Kelly".
          const readH4 = (h4: HTMLElement | null) => {
            if (!h4) return '';
            return h4.innerHTML
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          };

          const findFighterAssets = (statusDiv: Element) => {
            let p: Element | null = statusDiv;
            for (let i = 0; i < 6 && p; i++) {
              p = p.parentElement;
              if (!p) break;
              const a = p.querySelector('a[href*="/fighter/"]') as HTMLAnchorElement | null;
              if (a) {
                const img = p.querySelector('img.fightcard-headshot, img') as HTMLImageElement | null;
                const h4 = p.querySelector('h4') as HTMLElement | null;
                return {
                  athleteUrl: a.href,
                  imageUrl: img?.src || img?.getAttribute('data-src') || '',
                  displayName: readH4(h4),
                };
              }
            }
            return { athleteUrl: '', imageUrl: '', displayName: '' };
          };

          const aAssets = findFighterAssets(sideA);
          const bAssets = findFighterAssets(sideB);

          // Try to use the EXPANDED view for full names if available.
          // Collapsed h4 is just last name; expanded h4 is "First<br>Last".
          const expanded = wrapper.querySelector(`#fightCardModal${order}`);
          const expandedFullNames = expanded
            ? Array.from(expanded.querySelectorAll('h4'))
                .map(h => readH4(h as HTMLElement))
                .filter(s => s && s.length > 1)
            : [];

          const weightClassEl = collapsed.querySelector('h5');
          const weightClass = weightClassEl?.textContent?.trim() || '';
          const isTitle = /title|championship|belt/i.test(weightClass);

          const isComplete = !!(aSide.isWinner || aSide.isLoser || bSide.isWinner || bSide.isLoser);
          const winBy = aSide.winBy || bSide.winBy;
          const roundTime = aSide.roundTime || bSide.roundTime;

          fights.push({
            order,
            weightClass,
            isTitle,
            isComplete,
            isLive,
            winBy,
            roundTime,
            sideA: {
              ...aAssets,
              ...aSide,
              expandedFullName: expandedFullNames[0] || '',
            },
            sideB: {
              ...bAssets,
              ...bSide,
              expandedFullName: expandedFullNames[1] || '',
            },
          });
        }

        return { eventName, venue, fights };
      });

      console.log(
        `  📥 Page scraped in ${Date.now() - startTime}ms, found ${eventData.fights.length} fights`
      );
      await page.close();
      return eventData;
    } catch (err) {
      await page.close();
      throw err;
    }
  }

  /**
   * Normalize raw DOM extraction into PFLEventData.
   */
  private parseEventData(raw: any): PFLEventData {
    const fights: PFLFightData[] = [];

    for (const f of raw.fights || []) {
      const aDisplay = f.sideA.expandedFullName || f.sideA.displayName || '';
      const bDisplay = f.sideB.expandedFullName || f.sideB.displayName || '';

      const aNames = parsePFLFighterName(aDisplay, f.sideA.athleteUrl);
      const bNames = parsePFLFighterName(bDisplay, f.sideB.athleteUrl);

      let result: PFLFightResult | undefined;
      if (f.isComplete) {
        const { round, time } = parseRoundTime(f.roundTime);
        const aWon = !!f.sideA.isWinner;
        result = {
          winner: aWon
            ? `${aNames.firstName} ${aNames.lastName}`.trim() || aDisplay
            : `${bNames.firstName} ${bNames.lastName}`.trim() || bDisplay,
          winnerSide: aWon ? 'A' : 'B',
          method: normalizePFLMethod(f.winBy),
          round,
          time,
        };
      }

      fights.push({
        fightId: `pfl-${this.eventSlug}-${f.order}`,
        order: f.order,
        weightClass: (f.weightClass || '').trim(),
        sport: 'MMA',
        isTitle: f.isTitle,
        fighterA: {
          name: aDisplay,
          firstName: aNames.firstName,
          lastName: aNames.lastName,
          athleteUrl: f.sideA.athleteUrl,
          imageUrl: f.sideA.imageUrl,
          pflFighterId: f.sideA.fighterId,
          isWinner: !!f.sideA.isWinner,
        },
        fighterB: {
          name: bDisplay,
          firstName: bNames.firstName,
          lastName: bNames.lastName,
          athleteUrl: f.sideB.athleteUrl,
          imageUrl: f.sideB.imageUrl,
          pflFighterId: f.sideB.fighterId,
          isWinner: !!f.sideB.isWinner,
        },
        hasStarted: !!(f.isComplete || f.isLive),
        isComplete: !!f.isComplete,
        isLive: !!f.isLive,
        result,
      });
    }

    fights.sort((a, b) => a.order - b.order);

    const total = fights.length;
    const completed = fights.filter(x => x.isComplete).length;
    const live = fights.filter(x => x.isLive).length;

    let status: 'upcoming' | 'live' | 'complete' = 'upcoming';
    let hasStarted = false;
    let isComplete = false;
    if (total > 0) {
      if (completed === total) {
        status = 'complete';
        hasStarted = true;
        isComplete = true;
      } else if (completed > 0 || live > 0) {
        status = 'live';
        hasStarted = true;
      }
    }

    return {
      eventId: this.eventSlug,
      eventName: raw.eventName || this.eventSlug,
      eventUrl: this.eventUrl,
      venue: raw.venue,
      status,
      hasStarted,
      isComplete,
      fights,
      timestamp: new Date().toISOString(),
    };
  }

  private detectChanges(current: PFLEventData): string[] {
    const changes: string[] = [];
    if (!this.previousState) {
      changes.push('Initial scrape');
      return changes;
    }
    const prev = this.previousState;
    if (current.hasStarted && !prev.hasStarted) changes.push('🔴 EVENT STARTED');
    if (current.isComplete && !prev.isComplete) changes.push('✅ EVENT COMPLETE');
    for (const f of current.fights) {
      const prevF = prev.fights.find(p => p.order === f.order);
      if (!prevF) {
        changes.push(`➕ New fight #${f.order}: ${f.fighterA.name} vs ${f.fighterB.name}`);
        continue;
      }
      if (f.hasStarted && !prevF.hasStarted) {
        changes.push(`🥊 FIGHT STARTED: ${f.fighterA.name} vs ${f.fighterB.name}`);
      }
      if (f.isComplete && !prevF.isComplete) {
        const r = f.result
          ? ` - ${f.result.winner} by ${f.result.method || '?'}${f.result.round ? ` R${f.result.round}` : ''}${f.result.time ? ` ${f.result.time}` : ''}`
          : '';
        changes.push(`🏆 FIGHT COMPLETE: ${f.fighterA.name} vs ${f.fighterB.name}${r}`);
      }
    }
    return changes;
  }

  public async scrape(): Promise<PFLEventData> {
    const startTime = Date.now();
    console.log(`\n⏰ [${new Date().toISOString()}] Scraping PFL event...`);
    console.log(`   URL: ${this.eventUrl}`);

    try {
      const raw = await this.scrapeEventPage();
      const data = this.parseEventData(raw);
      data.scrapeDuration = Date.now() - startTime;

      const changes = this.detectChanges(data);

      console.log(`\n📊 Event: ${data.eventName}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Fights: ${data.fights.length}`);
      console.log(`   Duration: ${data.scrapeDuration}ms`);

      if (changes.length > 0 && changes[0] !== 'Initial scrape') {
        console.log('\n📢 CHANGES DETECTED:');
        changes.forEach(c => console.log(`   ${c}`));
      }

      console.log('\n🥊 Fight Card:');
      for (const f of data.fights) {
        const icon = f.isComplete ? '✅' : f.isLive ? '🔴' : '⏳';
        const r = f.result
          ? ` → ${f.result.winner} by ${f.result.method || '?'}${f.result.round ? ` R${f.result.round}` : ''}${f.result.time ? ` ${f.result.time}` : ''}`
          : '';
        console.log(`   ${f.order}. ${icon} ${f.fighterA.name} vs ${f.fighterB.name}${r}`);
      }

      this.snapshots.push({ data, changes });
      this.previousState = data;
      return data;
    } catch (err: any) {
      console.error(`\n❌ Scrape failed: ${err.message}`);
      throw err;
    }
  }

  public async startPolling(intervalSeconds = 60): Promise<void> {
    console.log('\n🚀 Starting PFL Live Scraper...');
    console.log(`📊 Polling every ${intervalSeconds}s\n📁 Output: ${this.outputDir}\n`);
    await this.scrape();
    this.intervalId = setInterval(async () => {
      try {
        await this.scrape();
        if (this.snapshots.length % 10 === 0) this.save();
      } catch (err: any) {
        console.error(`Scrape error: ${err.message}`);
      }
    }, intervalSeconds * 1000);
  }

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

  public save(): void {
    if (this.snapshots.length === 0) return;
    const filename = `pfl-${this.eventSlug}-${Date.now()}.json`;
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(
      filepath,
      JSON.stringify(
        {
          eventUrl: this.eventUrl,
          totalSnapshots: this.snapshots.length,
          firstScrape: this.snapshots[0]?.data.timestamp,
          lastScrape: this.snapshots[this.snapshots.length - 1]?.data.timestamp,
          snapshots: this.snapshots,
        },
        null,
        2
      )
    );
    console.log(`\n💾 Saved ${this.snapshots.length} snapshots to ${filename}`);
  }

  public getCurrentState(): PFLEventData | null {
    return this.previousState;
  }
}

// ============== EXPORTS ==============

export default PFLLiveScraper;

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://pflmma.com/event/pfl-belfast-2026';
  const intervalSeconds = parseInt(process.argv[3] || '0', 10);
  const scraper = new PFLLiveScraper(eventUrl);

  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    await scraper.stop();
    process.exit(0);
  });

  if (intervalSeconds > 0) {
    scraper.startPolling(intervalSeconds).catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
    console.log('\n💡 Press Ctrl+C to stop and save results\n');
  } else {
    // Single-shot mode (stop() calls save() internally)
    scraper
      .scrape()
      .then(async () => {
        await scraper.stop();
      })
      .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
      });
  }
}
