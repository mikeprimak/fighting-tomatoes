/**
 * Matchroom Boxing Live Event Scraper
 *
 * Scrapes live fight data from matchroomboxing.com event pages during active events.
 * Polls the event page periodically to detect:
 * - Event start (first fight begins)
 * - Individual fight start times
 * - Fight completions with results (winner, method, round, time)
 *
 * Note: Matchroom may not provide real-time round-by-round updates like UFC.com.
 * This scraper focuses on detecting fight results as they're posted.
 *
 * Usage:
 *   npx ts-node src/services/matchroomLiveScraper.ts [eventUrl] [intervalSeconds]
 *
 * Example:
 *   npx ts-node src/services/matchroomLiveScraper.ts https://www.matchroomboxing.com/events/inoue-vs-picasso/ 60
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// ============== TYPE DEFINITIONS ==============

interface BoxerInfo {
  name: string;
  record?: string;
  country?: string;
  isWinner?: boolean;
}

interface FightResult {
  winner?: string;
  method?: string;        // "KO", "TKO", "UD", "SD", "MD", "RTD", "DQ", etc.
  round?: number;
  time?: string;          // "2:34" format
  scorecards?: string[];  // For decisions: ["116-112", "115-113", "115-113"]
}

interface MatchroomFightData {
  fightId: string;
  order: number;
  status: 'upcoming' | 'live' | 'complete';
  weightClass: string;
  isTitle: boolean;
  titleName?: string;
  scheduledRounds: number;
  boxerA: BoxerInfo;
  boxerB: BoxerInfo;
  // Live tracking
  currentRound?: number;
  hasStarted: boolean;
  isComplete: boolean;
  // Result (when complete)
  result?: FightResult;
  // Raw text for debugging
  rawText?: string;
}

interface MatchroomEventData {
  eventId: string;
  eventName: string;
  eventUrl: string;
  venue?: string;
  location?: string;
  eventDate?: string;
  status: 'upcoming' | 'live' | 'complete';
  hasStarted: boolean;
  isComplete: boolean;
  fights: MatchroomFightData[];
  timestamp: string;
  scrapeDuration?: number;
}

interface MatchroomScraperSnapshot {
  data: MatchroomEventData;
  changes: string[];
}

// ============== MATCHROOM LIVE SCRAPER CLASS ==============

class MatchroomLiveScraper {
  private outputDir: string;
  private eventUrl: string;
  private snapshots: MatchroomScraperSnapshot[] = [];
  private previousState: MatchroomEventData | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(eventUrl: string, outputDir?: string) {
    this.eventUrl = eventUrl;
    this.outputDir = outputDir || path.join(__dirname, '../../live-event-data/matchroom');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Fetch the Matchroom event page HTML
   */
  private async fetchEventPage(): Promise<string> {
    const startTime = Date.now();

    try {
      const response = await axios.get(this.eventUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        timeout: 30000,
      });

      const duration = Date.now() - startTime;
      console.log(`  📥 Page fetched in ${duration}ms (${Math.round(response.data.length / 1024)}KB)`);

      return response.data;
    } catch (error: any) {
      console.error(`  ❌ Fetch error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse boxer name and record from fight card
   * Handles formats like:
   * - "Naoya Inoue" with record below
   * - "INOUE" (abbreviated)
   */
  private parseBoxerInfo($corner: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): BoxerInfo {
    // Try multiple selectors for boxer name
    const nameSelectors = [
      '.fighter-name',
      '.boxer-name',
      '.name',
      'h3',
      'h4',
      '.c-listing-fight__corner-name',
    ];

    let name = '';
    for (const selector of nameSelectors) {
      const nameEl = $corner.find(selector).first();
      if (nameEl.length && nameEl.text().trim()) {
        name = nameEl.text().trim();
        break;
      }
    }

    // Fallback: get any text that looks like a name
    if (!name) {
      const text = $corner.text().trim();
      // Look for capitalized words (names)
      const nameMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
      if (nameMatch) {
        name = nameMatch[1];
      }
    }

    // Parse record (format: "31-0-0" or "W 31 / KO 27 / L 0")
    let record: string | undefined;
    const recordText = $corner.text();
    const recordMatch = recordText.match(/(\d+)-(\d+)-(\d+)/);
    if (recordMatch) {
      record = recordMatch[0];
    } else {
      const wldMatch = recordText.match(/W\s*(\d+).*L\s*(\d+).*D\s*(\d+)/i);
      if (wldMatch) {
        record = `${wldMatch[1]}-${wldMatch[2]}-${wldMatch[3]}`;
      }
    }

    // Check for winner indicator
    const isWinner = $corner.hasClass('winner') ||
                     $corner.find('.winner').length > 0 ||
                     $corner.find('[class*="win"]').length > 0 ||
                     $corner.text().toLowerCase().includes('winner');

    // Country/flag
    const country = $corner.find('.country, .flag, [class*="country"]').text().trim() || undefined;

    return {
      name: name || 'Unknown',
      record,
      country,
      isWinner,
    };
  }

  /**
   * Parse fight result from result text
   * Handles formats like:
   * - "Inoue wins by KO Round 6 2:34"
   * - "TKO R3 1:45"
   * - "UD 116-112, 115-113, 115-113"
   * - "Decision (Unanimous)"
   */
  private parseResult(resultText: string, boxerA: BoxerInfo, boxerB: BoxerInfo): FightResult | undefined {
    if (!resultText || resultText.length < 2) return undefined;

    const normalized = resultText.toLowerCase().trim();
    const result: FightResult = {};

    // Determine winner
    if (boxerA.isWinner) {
      result.winner = boxerA.name;
    } else if (boxerB.isWinner) {
      result.winner = boxerB.name;
    } else {
      // Try to find winner from text
      const winnerMatch = normalized.match(/^([a-z\s]+)\s+(?:wins?|defeats?|def\.?)/i);
      if (winnerMatch) {
        const winnerName = winnerMatch[1].trim();
        // Match to boxer
        if (boxerA.name.toLowerCase().includes(winnerName) ||
            winnerName.includes(boxerA.name.split(' ').pop()?.toLowerCase() || '')) {
          result.winner = boxerA.name;
        } else if (boxerB.name.toLowerCase().includes(winnerName) ||
                   winnerName.includes(boxerB.name.split(' ').pop()?.toLowerCase() || '')) {
          result.winner = boxerB.name;
        }
      }
    }

    // Parse method
    const methodPatterns = [
      { pattern: /\b(ko|knockout)\b/i, method: 'KO' },
      { pattern: /\b(tko|technical knockout)\b/i, method: 'TKO' },
      { pattern: /\b(ud|unanimous\s*decision)\b/i, method: 'UD' },
      { pattern: /\b(sd|split\s*decision)\b/i, method: 'SD' },
      { pattern: /\b(md|majority\s*decision)\b/i, method: 'MD' },
      { pattern: /\b(rtd|corner\s*stoppage|retired)\b/i, method: 'RTD' },
      { pattern: /\b(dq|disqualification)\b/i, method: 'DQ' },
      { pattern: /\b(nc|no\s*contest)\b/i, method: 'NC' },
      { pattern: /\bdraw\b/i, method: 'Draw' },
      { pattern: /\b(sub|submission)\b/i, method: 'SUB' },
    ];

    for (const { pattern, method } of methodPatterns) {
      if (pattern.test(normalized)) {
        result.method = method;
        break;
      }
    }

    // Parse round
    const roundPatterns = [
      /round\s*(\d+)/i,
      /r(\d+)/i,
      /rd\.?\s*(\d+)/i,
    ];

    for (const pattern of roundPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        result.round = parseInt(match[1], 10);
        break;
      }
    }

    // Parse time
    const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      result.time = `${timeMatch[1]}:${timeMatch[2]}`;
    }

    // Parse scorecards for decisions
    const scorecardPattern = /(\d{2,3})-(\d{2,3})/g;
    const scorecards: string[] = [];
    let scoreMatch;
    while ((scoreMatch = scorecardPattern.exec(resultText)) !== null) {
      scorecards.push(`${scoreMatch[1]}-${scoreMatch[2]}`);
    }
    if (scorecards.length > 0) {
      result.scorecards = scorecards;
    }

    // Only return if we found meaningful data
    if (result.winner || result.method) {
      return result;
    }

    return undefined;
  }

  /**
   * Extract fight data from page HTML
   */
  private extractFights(html: string): MatchroomFightData[] {
    const $ = cheerio.load(html);
    const fights: MatchroomFightData[] = [];

    // Try multiple selectors for fight cards
    const fightSelectors = [
      '.fight-card',
      '.bout',
      '.matchup',
      '.fight',
      '[class*="fight"]',
      '[class*="bout"]',
      'article',
    ];

    let $fights: cheerio.Cheerio<any> | null = null;
    for (const selector of fightSelectors) {
      const $selected = $(selector);
      if ($selected.length > 0) {
        $fights = $selected;
        console.log(`  🔍 Found ${$fights.length} elements with selector: ${selector}`);
        break;
      }
    }

    // If no fight cards found, try to parse from text structure
    if (!$fights || $fights.length === 0) {
      console.log('  ⚠️  No fight card elements found, parsing from text...');
      return this.extractFightsFromText(html);
    }

    let order = 1;
    $fights.each((index, element) => {
      const $fight = $(element);
      const fightText = $fight.text().trim();

      // Skip if too short (likely not a fight card)
      if (fightText.length < 10) return;

      // Skip navigation/header elements
      if (fightText.toLowerCase().includes('menu') ||
          fightText.toLowerCase().includes('navigation')) return;

      // Find corners (boxers)
      const $corners = $fight.find('[class*="corner"], [class*="fighter"], [class*="boxer"]');

      let boxerA: BoxerInfo = { name: 'TBA' };
      let boxerB: BoxerInfo = { name: 'TBA' };

      if ($corners.length >= 2) {
        boxerA = this.parseBoxerInfo($corners.eq(0), $);
        boxerB = this.parseBoxerInfo($corners.eq(1), $);
      } else {
        // Try to extract from "vs" pattern
        const vsMatch = fightText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:vs?\.?|VS)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        if (vsMatch) {
          boxerA = { name: vsMatch[1].trim() };
          boxerB = { name: vsMatch[2].trim() };
        }
      }

      // Skip if we couldn't identify boxers
      if (boxerA.name === 'TBA' && boxerB.name === 'TBA') return;

      // Weight class
      const weightClassPatterns = [
        /\b(heavyweight|cruiserweight|light heavyweight|super middleweight|middleweight|super welterweight|welterweight|super lightweight|lightweight|super featherweight|featherweight|super bantamweight|bantamweight|super flyweight|flyweight|light flyweight|minimumweight)\b/i,
        /\b(junior\s*\w+weight)\b/i,
      ];

      let weightClass = '';
      for (const pattern of weightClassPatterns) {
        const match = fightText.match(pattern);
        if (match) {
          weightClass = match[1];
          break;
        }
      }

      // Title fight detection
      const isTitle = /\b(title|championship|undisputed|world)\b/i.test(fightText);
      const titleName = isTitle ? this.extractTitleName(fightText) : undefined;

      // Scheduled rounds (boxing: 12 for title, 10-12 for non-title)
      const roundsMatch = fightText.match(/(\d+)\s*(?:rounds?|rds?)/i);
      const scheduledRounds = roundsMatch ? parseInt(roundsMatch[1], 10) : (isTitle ? 12 : 12);

      // Status detection
      let status: 'upcoming' | 'live' | 'complete' = 'upcoming';
      let hasStarted = false;
      let isComplete = false;
      let currentRound: number | undefined;
      let result: FightResult | undefined;

      // Check for live indicators
      if (/\b(live|now|in progress|round \d+)\b/i.test(fightText)) {
        status = 'live';
        hasStarted = true;
        const liveRoundMatch = fightText.match(/round\s*(\d+)/i);
        if (liveRoundMatch) {
          currentRound = parseInt(liveRoundMatch[1], 10);
        }
      }

      // Check for completion indicators
      if (/\b(winner|wins?|defeats?|ko|tko|decision|draw|nc|dq)\b/i.test(fightText) ||
          boxerA.isWinner || boxerB.isWinner) {
        status = 'complete';
        hasStarted = true;
        isComplete = true;
        result = this.parseResult(fightText, boxerA, boxerB);
      }

      const fight: MatchroomFightData = {
        fightId: `matchroom-${index}`,
        order: order++,
        status,
        weightClass: weightClass || 'Unknown',
        isTitle,
        titleName,
        scheduledRounds,
        boxerA,
        boxerB,
        currentRound,
        hasStarted,
        isComplete,
        result,
        rawText: fightText.substring(0, 500), // Truncate for debugging
      };

      fights.push(fight);
    });

    return fights;
  }

  /**
   * Fallback: Extract fights from plain text when no structured elements found
   */
  private extractFightsFromText(html: string): MatchroomFightData[] {
    const $ = cheerio.load(html);
    const pageText = $('body').text();
    const fights: MatchroomFightData[] = [];

    // Look for "X vs Y" or "X v Y" patterns
    const vsPattern = /([A-Z][a-zA-Z\s\-']+?)\s+(?:vs?\.?|VS)\s+([A-Z][a-zA-Z\s\-']+?)(?:\n|$|(?=\s*(?:Undisputed|World|Championship|Title|\d+\s*Rounds)))/gi;

    let match;
    let order = 1;
    while ((match = vsPattern.exec(pageText)) !== null) {
      const boxerA = { name: match[1].trim() };
      const boxerB = { name: match[2].trim() };

      // Skip if names are too short or too long (likely parsing errors)
      if (boxerA.name.length < 3 || boxerA.name.length > 50) continue;
      if (boxerB.name.length < 3 || boxerB.name.length > 50) continue;

      fights.push({
        fightId: `matchroom-text-${order}`,
        order: order++,
        status: 'upcoming',
        weightClass: 'Unknown',
        isTitle: false,
        scheduledRounds: 12,
        boxerA,
        boxerB,
        hasStarted: false,
        isComplete: false,
      });
    }

    return fights;
  }

  /**
   * Extract title name from fight text
   */
  private extractTitleName(text: string): string | undefined {
    const patterns = [
      /(undisputed\s+world\s+\w+\s+championship)/i,
      /(world\s+\w+\s+(?:title|championship))/i,
      /((?:WBA|WBC|WBO|IBF|IBO)\s+\w+\s+(?:title|championship))/i,
      /(\w+\s+world\s+(?:title|championship))/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract event metadata
   */
  private extractEventMetadata(html: string): Partial<MatchroomEventData> {
    const $ = cheerio.load(html);

    // Event name from title or h1
    let eventName = $('title').text().trim().replace(/\s*\|\s*Matchroom.*$/i, '');
    if (!eventName) {
      eventName = $('h1').first().text().trim();
    }

    // Venue and location
    const venueText = $('.venue, [class*="venue"], [class*="location"]').text().trim();
    const venue = venueText.split(',')[0]?.trim();
    const location = venueText;

    // Event date
    let eventDate: string | undefined;
    const datePatterns = [
      /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
    ];
    const pageText = $('body').text();
    for (const pattern of datePatterns) {
      const match = pageText.match(pattern);
      if (match) {
        eventDate = match[0];
        break;
      }
    }

    // Event status
    let status: 'upcoming' | 'live' | 'complete' = 'upcoming';
    if (/\b(live now|in progress)\b/i.test(pageText)) {
      status = 'live';
    } else if (/\b(complete|finished|results)\b/i.test(pageText)) {
      status = 'complete';
    }

    return {
      eventName,
      venue,
      location,
      eventDate,
      status,
      hasStarted: status !== 'upcoming',
      isComplete: status === 'complete',
    };
  }

  /**
   * Detect changes between current and previous state
   */
  private detectChanges(current: MatchroomEventData): string[] {
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
        f.boxerA.name === fight.boxerA.name && f.boxerB.name === fight.boxerB.name
      );

      if (!prevFight) {
        changes.push(`➕ New fight: ${fight.boxerA.name} vs ${fight.boxerB.name}`);
        continue;
      }

      // Fight started
      if (fight.hasStarted && !prevFight.hasStarted) {
        changes.push(`🥊 FIGHT STARTED: ${fight.boxerA.name} vs ${fight.boxerB.name}`);
      }

      // Fight completed
      if (fight.isComplete && !prevFight.isComplete) {
        const resultStr = fight.result
          ? ` - ${fight.result.winner || 'Unknown'} wins by ${fight.result.method || 'Unknown'}${fight.result.round ? ` R${fight.result.round}` : ''}${fight.result.time ? ` ${fight.result.time}` : ''}`
          : '';
        changes.push(`🏆 FIGHT COMPLETE: ${fight.boxerA.name} vs ${fight.boxerB.name}${resultStr}`);
      }

      // Round change (if live tracking is available)
      if (fight.currentRound && prevFight.currentRound !== fight.currentRound) {
        changes.push(`🔔 Round ${fight.currentRound}: ${fight.boxerA.name} vs ${fight.boxerB.name}`);
      }
    }

    return changes;
  }

  /**
   * Main scrape function
   */
  public async scrape(): Promise<MatchroomEventData> {
    const startTime = Date.now();
    console.log(`\n⏰ [${new Date().toISOString()}] Scraping Matchroom event...`);
    console.log(`   URL: ${this.eventUrl}`);

    try {
      const html = await this.fetchEventPage();
      const metadata = this.extractEventMetadata(html);
      const fights = this.extractFights(html);

      const scrapeDuration = Date.now() - startTime;

      const eventData: MatchroomEventData = {
        eventId: this.eventUrl.split('/').filter(Boolean).pop() || 'unknown',
        eventName: metadata.eventName || 'Unknown Event',
        eventUrl: this.eventUrl,
        venue: metadata.venue,
        location: metadata.location,
        eventDate: metadata.eventDate,
        status: metadata.status || 'upcoming',
        hasStarted: metadata.hasStarted || false,
        isComplete: metadata.isComplete || false,
        fights,
        timestamp: new Date().toISOString(),
        scrapeDuration,
      };

      // Detect and log changes
      const changes = this.detectChanges(eventData);

      console.log(`\n📊 Event: ${eventData.eventName}`);
      console.log(`   Status: ${eventData.status}`);
      console.log(`   Fights: ${fights.length}`);
      console.log(`   Duration: ${scrapeDuration}ms`);

      if (changes.length > 0 && changes[0] !== 'Initial scrape') {
        console.log('\n📢 CHANGES DETECTED:');
        changes.forEach(c => console.log(`   ${c}`));
      }

      // Log fights
      console.log('\n🥊 Fight Card:');
      fights.forEach((fight, i) => {
        const statusIcon = fight.isComplete ? '✅' : fight.hasStarted ? '🔴' : '⏳';
        const resultStr = fight.result
          ? ` → ${fight.result.winner || '?'} by ${fight.result.method || '?'}`
          : '';
        console.log(`   ${i + 1}. ${statusIcon} ${fight.boxerA.name} vs ${fight.boxerB.name}${resultStr}`);
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
    console.log('\n🚀 Starting Matchroom Live Scraper...');
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
   * Stop polling
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.save();
    console.log('\n🛑 Scraper stopped\n');
  }

  /**
   * Save snapshots to file
   */
  public save(): void {
    const eventSlug = this.eventUrl.split('/').filter(Boolean).pop() || 'unknown';
    const filename = `matchroom-${eventSlug}-${Date.now()}.json`;
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
   * Get current state (for integration with live event tracker)
   */
  public getCurrentState(): MatchroomEventData | null {
    return this.previousState;
  }

  /**
   * Get all changes detected across all snapshots
   */
  public getAllChanges(): string[] {
    return this.snapshots.flatMap(s => s.changes);
  }
}

// ============== EXPORTS ==============

export default MatchroomLiveScraper;
export { MatchroomEventData, MatchroomFightData, FightResult };

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://www.matchroomboxing.com/events/inoue-vs-picasso/';
  const intervalSeconds = parseInt(process.argv[3] || '60', 10);

  const scraper = new MatchroomLiveScraper(eventUrl);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down...');
    scraper.stop();
    process.exit(0);
  });

  // Start polling
  scraper.startPolling(intervalSeconds).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

  console.log('\n💡 Press Ctrl+C to stop and save results\n');
}
