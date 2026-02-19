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

  // Check for specific decision types first (most common in boxing)
  if (m.includes('unanimous')) return 'UD';
  if (m.includes('split')) return 'SD';
  if (m.includes('majority')) return 'MD';

  // Then check other methods
  if (m.includes('technical knockout') || m === 'tko') return 'TKO';
  if (m.includes('knockout') || m === 'ko') return 'KO';
  if (m.includes('submission') || m === 'sub') return 'SUB';
  if (m.includes('disqualification') || m === 'dq') return 'DQ';
  if (m.includes('no contest') || m === 'nc') return 'NC';
  if (m.includes('draw')) return 'DRAW';
  if (m.includes('rtd') || m.includes('corner stoppage') || m.includes('retirement')) return 'RTD';

  // Generic decision (without type specified)
  if (m.includes('decision') || m === 'dec') return 'DEC';

  // Return original if no match (capitalized)
  return method.trim();
}

/**
 * Parse round info from text like "Round 3" or "R3"
 */
function parseRound(text: string): number | undefined {
  const match = text.match(/(?:round|r)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Parse time from text like "2:34" or "at 2:34"
 */
function parseTime(text: string): string | undefined {
  const match = text.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : undefined;
}

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

      // Get event name
      const eventName = $('h1').first().text().trim() || 'Unknown Event';

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

      // Alternative: find all fighter link pairs
      if (fights.length === 0) {
        const fighterLinks = $('a[href*="/fightcenter/fighters/"]');
        const processedPairs = new Set<string>();

        for (let i = 0; i < fighterLinks.length - 1; i += 2) {
          const $fighterA = $(fighterLinks[i]);
          const $fighterB = $(fighterLinks[i + 1]);

          const nameA = $fighterA.text().trim();
          const nameB = $fighterB.text().trim();
          const urlA = $fighterA.attr('href') || '';
          const urlB = $fighterB.attr('href') || '';

          if (!nameA || !nameB) continue;
          // Skip if same fighter (profile links)
          if (urlA === urlB) continue;

          // Use URLs for deduplication (more reliable than names)
          const pairKey = [urlA, urlB].sort().join('|');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          order++;

          // Find the parent container for this fight
          const $container = $fighterA.closest('li, div[class*="fight"], section');

          // Check for winner (green W badge)
          let winner: string | undefined;
          const $winBadgeA = $fighterA.closest('div, li').find('.bg-green-500, [class*="bg-green"]');
          const $winBadgeB = $fighterB.closest('div, li').find('.bg-green-500, [class*="bg-green"]');

          // Check which fighter has the W badge near them
          const fighterASection = $fighterA.parent().parent();
          const fighterBSection = $fighterB.parent().parent();

          if (fighterASection.find('.bg-green-500').length > 0 ||
              fighterASection.find('[class*="bg-green"]').text().includes('W')) {
            winner = nameA;
          } else if (fighterBSection.find('.bg-green-500').length > 0 ||
                     fighterBSection.find('[class*="bg-green"]').text().includes('W')) {
            winner = nameB;
          }

          // Look for method - search up the DOM tree
          let method: string | undefined;
          let round: number | undefined;
          let time: string | undefined;

          // Search up to find the fight container with method info
          let $fightContainer = $fighterA.closest('li, section, [class*="fight"], [class*="bout"]');
          if ($fightContainer.length === 0) {
            // Go up multiple levels to find a container
            $fightContainer = $fighterA.parent().parent().parent().parent();
          }

          // Look for any text containing method keywords
          const containerText = $fightContainer.text();
          const methodPatterns = [
            /Decision,?\s*(Unanimous|Split|Majority)/i,
            /(Unanimous|Split|Majority)\s*Decision/i,
            /\b(TKO|KO)\b/i,
            /Technical\s*Knockout/i,
            /Submission/i,
            /\bNC\b|No\s*Contest/i,
            /\bDQ\b|Disqualification/i,
          ];

          for (const pattern of methodPatterns) {
            const match = containerText.match(pattern);
            if (match) {
              method = normalizeMethod(match[0]);
              break;
            }
          }

          // Also try finding method in uppercase span
          if (!method) {
            $fightContainer.find('span').each((_, el) => {
              const text = $(el).text().trim();
              if (text.includes('Decision') || text.includes('KO') || text.includes('Submission')) {
                method = normalizeMethod(text);
                return false; // break
              }
            });
          }

          const isComplete = !!winner || !!method;

          fights.push({
            order,
            fighterA: { name: nameA, url: $fighterA.attr('href') },
            fighterB: { name: nameB, url: $fighterB.attr('href') },
            isComplete,
            isCancelled: false,
            result: isComplete ? { winner, method, round, time } : undefined,
          });
        }
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
