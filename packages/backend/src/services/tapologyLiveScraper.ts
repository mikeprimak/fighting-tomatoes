/**
 * Tapology Live Event Scraper
 *
 * Fetches live fight results from Tapology event pages.
 * Works for any promotion that has events on Tapology.
 *
 * Usage:
 *   const scraper = new TapologyLiveScraper('https://www.tapology.com/fightcenter/events/137070-zuffa-boxing');
 *   const data = await scraper.scrape();
 */

import * as cheerio from 'cheerio';

// ============== TYPE DEFINITIONS ==============

export interface TapologyFighter {
  name: string;
  url?: string;
}

export interface TapologyFightResult {
  winner?: string;       // Winner's name
  method?: string;       // "KO", "TKO", "UD", "SD", "SUB", etc.
  round?: number;
  time?: string;         // "2:34" format
}

export interface TapologyFight {
  order: number;
  boutOrder?: number;     // Tapology's card position (1 = opener, N = main event)
  fighterA: TapologyFighter;
  fighterB: TapologyFighter;
  weightClass?: string;
  scheduledRounds?: number;
  isComplete: boolean;    // Used by parser to detect -> COMPLETED transition
  isCancelled: boolean;   // Used by parser to detect -> CANCELLED transition
  result?: TapologyFightResult;
}

export interface TapologyEventData {
  eventName: string;
  eventUrl: string;
  status: 'upcoming' | 'live' | 'complete';
  fights: TapologyFight[];
  scrapedAt: string;
}

// ============== HELPER FUNCTIONS ==============

/**
 * Normalize method string to standard format
 * Handles formats like "Decision, Unanimous" or just "TKO"
 */
function normalizeMethod(method: string): string {
  const m = method.toLowerCase().trim();

  // No contest / draw checked first — these can contain the word "knockout"
  // (e.g. "No Contest, Accidental Knockdown") and must not be misclassified.
  if (m.includes('no contest') || m === 'nc') return 'NC';
  if (m.includes('draw')) return 'DRAW';

  // Check for specific decision types first (most common in boxing)
  if (m.includes('unanimous')) return 'UD';
  if (m.includes('split')) return 'SD';
  if (m.includes('majority')) return 'MD';

  // Then check other methods
  if (m.includes('ko/tko')) return 'TKO';  // Tapology uses "KO/TKO" format
  if (m.includes('technical knockout') || m === 'tko') return 'TKO';
  if (m.includes('knockout') || m === 'ko') return 'KO';
  if (m.includes('submission') || m === 'sub') return 'SUB';
  if (m.includes('disqualification') || m === 'dq') return 'DQ';
  if (m.includes('rtd') || m.includes('corner stoppage') || m.includes('retirement')) return 'RTD';

  // Generic decision (without type specified)
  if (m.includes('decision') || m === 'dec') return 'DEC';

  // Return original if no match (capitalized)
  return method.trim();
}

/**
 * Parse round info from result-row text like "Round 7/12" or "Round 2 of 8".
 * Word boundary on "round" prevents matching the trailing r in unrelated
 * words ("Champion 55 kg" used to match as r→55).
 */
function parseRound(text: string): number | undefined {
  const match = text.match(/\bround\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Parse round-end time. Boxing/MMA rounds cap at 5 minutes, so a real
 * stoppage time is M:SS with M = 0-5. This excludes scheduled-distance
 * totals like "36:00 Total".
 */
function parseTime(text: string): string | undefined {
  const match = text.match(/\b([0-5]:[0-5]\d)\b/);
  return match ? match[1] : undefined;
}

const DECISION_METHODS = new Set(['DEC', 'UD', 'SD', 'MD', 'DRAW', 'NC']);

// ============== SCRAPER CLASS ==============

export class TapologyLiveScraper {
  private eventUrl: string;

  constructor(eventUrl: string) {
    this.eventUrl = eventUrl;
  }

  /**
   * Fetch and parse event data from Tapology
   */
  async scrape(): Promise<TapologyEventData> {
    console.log(`\n[Tapology] Scraping: ${this.eventUrl}`);
    const startTime = Date.now();

    try {
      // Fetch the page
      const response = await fetch(this.eventUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Get event name - skip cookie consent banners that may have h1 tags
      let eventName = $('.eventPageHeaderTitles h1, .header h1, #main h1, .content h1').first().text().trim();
      if (!eventName || /consent|cookie|privacy/i.test(eventName)) {
        // Fall back to first h1 that doesn't look like a consent banner
        $('h1').each((_, el) => {
          const text = $(el).text().trim();
          if (text && !/consent|cookie|privacy/i.test(text)) {
            eventName = text;
            return false; // break
          }
        });
      }
      if (!eventName || /consent|cookie|privacy/i.test(eventName)) {
        // Last resort: extract from page title
        const titleMatch = $('title').text().match(/^(.+?)(?:\s*[-|])/);
        eventName = titleMatch ? titleMatch[1].trim() : 'Unknown Event';
      }

      // Determine event status
      let status: 'upcoming' | 'live' | 'complete' = 'upcoming';
      const statusText = $('.eventStatus, .event-status').text().toLowerCase();
      if (statusText.includes('complete') || statusText.includes('final')) {
        status = 'complete';
      } else if (statusText.includes('progress') || statusText.includes('live')) {
        status = 'live';
      }

      // Parse fights
      const fights: TapologyFight[] = [];
      let order = 0;

      // Tapology fight cards - look for fight containers
      // Each fight typically has fighter links and result info
      $('ul.fightCard li, .fightCardBout, [data-controller="fightcard"]').each((_, element) => {
        order++;
        const $el = $(element);
        const fight = this.parseFight($, $el, order);
        if (fight) {
          fights.push(fight);
        }
      });

      // Alternative: iterate fight <li> elements directly
      // Tapology renders fights inside <li class="border-b border-dotted"> within a <ul>.
      // Each <li> contains fighter links AND a result row with method/round/time.
      // Fighter links appear multiple times on the page (mobile/desktop duplicates),
      // so we iterate the <li> containers rather than pairing links by index.
      if (fights.length === 0) {
        const processedPairs = new Set<string>();

        // Find fight list items — Tapology uses <li> with border-b styling for fights
        $('li.border-b, li[class*="border-b"]').each((_, element) => {
          const $li = $(element);

          // Find unique fighter links within this <li>
          const fighterLinksInLi: { name: string; url: string }[] = [];
          const seenUrls = new Set<string>();
          $li.find('a[href*="/fightcenter/fighters/"]').each((_, el) => {
            const name = $(el).text().trim();
            const url = $(el).attr('href') || '';
            if (!name || name.length < 3 || seenUrls.has(url)) return;
            seenUrls.add(url);
            fighterLinksInLi.push({ name, url });
          });

          // Need exactly 2 unique fighters per fight
          if (fighterLinksInLi.length < 2) return;

          const nameA = fighterLinksInLi[0].name;
          const nameB = fighterLinksInLi[1].name;
          const urlA = fighterLinksInLi[0].url;
          const urlB = fighterLinksInLi[1].url;

          // Deduplicate fights
          const pairKey = [urlA, urlB].sort().join('|');
          if (processedPairs.has(pairKey)) return;
          processedPairs.add(pairKey);

          // Extract Tapology's bout position (e.g. "11" for main event, "1" for opener).
          // The span lives inside <div id="boutCompactNumber{boutId}"> within the same <li>.
          // If missing, fall back to iteration counter.
          let boutOrder: number | undefined;
          const $orderDiv = $li.find('[id^="boutCompactNumber"]').first();
          if ($orderDiv.length) {
            const orderText = $orderDiv.find('span').first().text().trim();
            const parsed = parseInt(orderText, 10);
            if (!isNaN(parsed) && parsed > 0) boutOrder = parsed;
          }

          order++;

          // Check for winner — look for green W badge or green background gradient
          let winner: string | undefined;
          const liText = $li.text();

          // Tapology uses bg-gradient-to-r with green colors for the winner's section
          // and red/pink for the loser. Also has a green "W" badge.
          const $allFighterLinks = $li.find('a[href*="/fightcenter/fighters/"]');
          const $firstLink = $($allFighterLinks[0]);
          const $secondLink = $li.find(`a[href="${urlB}"]`).first();

          // Check which fighter's parent container has the green background or W badge
          const fighterAParent = $firstLink.parent().parent().parent();
          const fighterBParent = $secondLink.length > 0 ? $secondLink.parent().parent().parent() : null;

          if (fighterAParent.attr('class')?.includes('from-[#d1f7d2]') ||
              fighterAParent.find('.bg-green-500').length > 0) {
            winner = nameA;
          } else if (fighterBParent && (
            fighterBParent.attr('class')?.includes('from-[#d1f7d2]') ||
            fighterBParent.find('.bg-green-500').length > 0)) {
            winner = nameB;
          }

          // Extract method from the uppercase span in the result row
          let method: string | undefined;
          let round: number | undefined;
          let time: string | undefined;
          let methodEl: any;

          $li.find('span.uppercase, span[class*="uppercase"]').each((_, el) => {
            const text = $(el).text().trim();
            // Match any text containing a known result keyword. "No Contest" and
            // "Draw" are checked before KO/TKO because normalizeMethod gives them
            // priority — a "No Contest, Accidental Knockdown" must map to NC.
            if (text && (
              text.includes('No Contest') || /\bNC\b/.test(text) ||
              text.includes('Draw') ||
              text.includes('Decision') ||
              text.includes('KO') || text.includes('TKO') ||
              text.includes('Submission') ||
              text.includes('DQ') || text.includes('Disqualification') ||
              text.includes('RTD') || text.includes('Retirement')
            )) {
              method = normalizeMethod(text);
              methodEl = el;
              return false; // break
            }
          });

          // Extract round/time from the result row only (the method span's
          // parent), not the entire <li>. The full <li> text contains
          // fighter weight classes ("Champion 55 kg") and scheduled-distance
          // totals ("12 Rounds, 36:00 Total") that the loose old regexes
          // were misinterpreting as fight-end round/time.
          // Decisions/draws/NC went the distance — leave round/time empty.
          if (method && methodEl && !DECISION_METHODS.has(method)) {
            const resultText = $(methodEl).parent().text();
            // Stoppage rows on Tapology read like:
            //   "KO/TKO 1:47 Round 7/12, 19:47 Total"
            //   "KO/TKO, Body Shots 1:58 Round 4/10, 10:58 Total"
            // Pull end-time and ended-round from the leading "M:SS Round X"
            // pair to avoid grabbing the trailing total elapsed.
            const stoppageMatch = resultText.match(/([0-5]:[0-5]\d)\s*Round\s+(\d+)/i);
            if (stoppageMatch) {
              time = stoppageMatch[1];
              round = parseInt(stoppageMatch[2], 10);
            } else {
              round = parseRound(resultText);
              time = parseTime(resultText);
            }
          }

          // Check for cancellation
          const isCancelled = liText.toLowerCase().includes('cancelled') ||
                             liText.toLowerCase().includes('canceled');

          const isComplete = !isCancelled && (!!winner || !!method);

          fights.push({
            order,
            boutOrder,
            fighterA: { name: nameA, url: urlA },
            fighterB: { name: nameB, url: urlB },
            isComplete,
            isCancelled,
            result: isComplete ? { winner, method, round, time } : undefined,
          });
        });
      }

      const duration = Date.now() - startTime;
      console.log(`[Tapology] Scraped ${fights.length} fights in ${duration}ms`);
      console.log(`[Tapology] Event status: ${status}`);

      // Log fight summary
      fights.forEach((f, i) => {
        const statusIcon = f.isComplete ? '✅' : f.isCancelled ? '❌' : '⏳';
        const resultStr = f.result ? ` → ${f.result.winner} by ${f.result.method}` : '';
        console.log(`  ${i + 1}. ${statusIcon} ${f.fighterA.name} vs ${f.fighterB.name}${resultStr}`);
      });

      return {
        eventName,
        eventUrl: this.eventUrl,
        status,
        fights,
        scrapedAt: new Date().toISOString(),
      };

    } catch (error: any) {
      console.error(`[Tapology] Scrape error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse a single fight element (primary selector)
   */
  private parseFight($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>, order: number): TapologyFight | null {
    try {
      // Get fighter names - usually in links or spans
      const fighterLinks = $el.find('a[href*="/fightcenter/fighters/"]');
      const fighterNames = $el.find('.fighterName, .fighter-name, .name');

      let fighterAName = '';
      let fighterBName = '';
      let fighterAUrl = '';
      let fighterBUrl = '';

      if (fighterLinks.length >= 2) {
        fighterAName = $(fighterLinks[0]).text().trim();
        fighterBName = $(fighterLinks[1]).text().trim();
        fighterAUrl = $(fighterLinks[0]).attr('href') || '';
        fighterBUrl = $(fighterLinks[1]).attr('href') || '';
      } else if (fighterNames.length >= 2) {
        fighterAName = $(fighterNames[0]).text().trim();
        fighterBName = $(fighterNames[1]).text().trim();
      }

      if (!fighterAName || !fighterBName) {
        return null;
      }

      // Check if cancelled
      const isCancelled = $el.text().toLowerCase().includes('cancelled') ||
                         $el.text().toLowerCase().includes('canceled') ||
                         $el.hasClass('cancelled');

      // Check for result
      let isComplete = false;
      let result: TapologyFightResult | undefined;

      // Look for winner indicator (usually bold, highlighted, or has "def." text)
      const resultText = $el.find('.result, .bout-result, .decision').text().trim();
      const defText = $el.text();

      if (defText.includes('def.') || defText.includes('defeats') || resultText) {
        isComplete = true;

        // Parse the result
        const methodMatch = defText.match(/(?:def\.|defeats)[^(]*\(([^)]+)\)/i);
        if (methodMatch) {
          const fullResult = methodMatch[1];
          result = {
            method: normalizeMethod(fullResult.split(',')[0] || fullResult),
            round: parseRound(fullResult),
            time: parseTime(fullResult),
          };

          // Determine winner - usually the first fighter mentioned before "def."
          const defIndex = defText.indexOf('def.');
          if (defIndex > -1) {
            const beforeDef = defText.substring(0, defIndex).trim();
            // Winner is likely fighterA if their name appears before "def."
            if (beforeDef.toLowerCase().includes(fighterAName.split(' ').pop()?.toLowerCase() || '')) {
              result.winner = fighterAName;
            } else {
              result.winner = fighterBName;
            }
          }
        }
      }

      // Get weight class
      const weightText = $el.find('.weightClass, .weight-class, .division').text().trim();

      return {
        order,
        fighterA: { name: fighterAName, url: fighterAUrl },
        fighterB: { name: fighterBName, url: fighterBUrl },
        weightClass: weightText || undefined,
        isComplete,
        isCancelled,
        result,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse fight using alternative selectors
   */
  private parseFightAlternative($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>, order: number): TapologyFight | null {
    // Similar logic but with different selectors
    return this.parseFight($, $el, order);
  }
}

// ============== CLI USAGE ==============

if (require.main === module) {
  const eventUrl = process.argv[2] || 'https://www.tapology.com/fightcenter/events/137070-zuffa-boxing';

  const scraper = new TapologyLiveScraper(eventUrl);
  scraper.scrape()
    .then(data => {
      console.log('\n📊 Final Data:');
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default TapologyLiveScraper;
