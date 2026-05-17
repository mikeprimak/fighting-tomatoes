/**
 * Sherdog Play-by-Play Live Scraper
 *
 * Sherdog publishes round-by-round live blogs for major cards. The HTML is
 * highly structured:
 *   - A TOC <ul> at the top lists every fight with a "Live NOW!" prefix on
 *     the fight currently in progress.
 *   - Each fight is wrapped in <div class="event"> with an anchor name like
 *     "chris-avila-(164)-brandon-jenkins-(1642)".
 *   - Inside each fight div: <h2> with /fighter/Name-{ID} links per fighter,
 *     <h3>Round N</h3> blocks of prose, <h4>Sherdog Scores</h4> with 3
 *     judges' per-round scores, and finally <h3>The Official Result</h3>
 *     containing a sentence like "Brandon Jenkins def. Chris Avila via Split
 *     Decision (29-28, 28-29, 29-28)" (or "R1 0:22 via KO (Punch)" for
 *     finishes).
 *
 * The Live NOW! marker is the cleanest fight-start signal we get from any
 * source — it transitions as the writer moves down the card, often before
 * any prose has been typed. The Official Result block populates within
 * 1-5 min of the fight ending. Together this is enough for sub-5-min
 * start AND end signals on most cards.
 *
 * This scraper is generic — it works for any Sherdog PBP URL, not just MVP.
 * The same structure is used for UFC, ONE, PFL, Top Rank, Golden Boy, etc.
 * any time Sherdog covers the card.
 *
 * Returns null if the URL doesn't resolve to a PBP page (Sherdog only writes
 * PBP for staffed cards — coverage detection lives at the caller).
 */

import * as cheerio from 'cheerio';

// ============== TYPE DEFINITIONS ==============

export interface SherdogFighter {
  /** Best-effort first name (everything before the last whitespace-separated token). */
  firstName: string;
  /** Last name as written by Sherdog (e.g. "Jenkins", "Masson-Wong"). */
  lastName: string;
  /** Full name as written by Sherdog (e.g. "Brandon Jenkins"). */
  name: string;
  /** Stable Sherdog fighter ID from /fighter/Name-{ID} link, e.g. "155641". null if no link. */
  sherdogId: string | null;
}

export interface SherdogFightResult {
  /** Winner's last name as written by Sherdog. Null on draw/NC. */
  winner: string | null;
  /** Normalized method: KO, TKO, SUB, UD, SD, MD, DEC, DRAW, NC, DQ, RTD. */
  method: string | null;
  /** Ending round for finishes (KO/TKO/SUB). Null for decisions/draws/NC. */
  round: number | null;
  /** Ending time M:SS for finishes. Null for decisions. */
  time: string | null;
  /** Raw result sentence ("Brandon Jenkins def. Chris Avila via..."). For debugging. */
  raw: string;
}

export interface SherdogFight {
  /** Position in the card as Sherdog renders it (1 = first listed = usually main event). */
  cardOrder: number;
  fighterA: SherdogFighter;
  fighterB: SherdogFighter;
  /** The Live NOW! marker is on this fight in the TOC. */
  isLive: boolean;
  /** Round 1 prose has been written OR fight has a result OR isLive. */
  hasStarted: boolean;
  /** "The Official Result" block contains a result sentence. */
  isComplete: boolean;
  /** Result of the fight, when isComplete is true. */
  result: SherdogFightResult | null;
}

export interface SherdogEventData {
  eventName: string;
  eventUrl: string;
  /** Any fight on the card has started (or is live, or is complete). */
  hasStarted: boolean;
  /** All non-cancelled fights have results. */
  isComplete: boolean;
  fights: SherdogFight[];
  scrapedAt: string;
}

// ============== HELPERS ==============

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DECISION_METHODS = new Set(['UD', 'SD', 'MD', 'DEC', 'DRAW', 'NC']);

function normalizeMethod(method: string): string {
  const m = method.toLowerCase().trim();
  // No contest / draw first — phrases like "No Contest, Accidental Knockdown"
  // contain "knockout" and must not fall through to KO.
  if (m.includes('no contest') || m === 'nc') return 'NC';
  if (m.includes('draw')) return 'DRAW';
  if (m.includes('unanimous')) return 'UD';
  if (m.includes('split')) return 'SD';
  if (m.includes('majority')) return 'MD';
  if (m.includes('ko/tko')) return 'TKO';
  if (m.includes('technical knockout') || m.startsWith('tko')) return 'TKO';
  if (m.includes('knockout') || m.startsWith('ko ') || m === 'ko') return 'KO';
  if (m.includes('submission') || m.startsWith('sub')) return 'SUB';
  if (m.includes('disqualification') || m === 'dq') return 'DQ';
  if (m.includes('rtd') || m.includes('corner stoppage') || m.includes('retirement')) return 'RTD';
  if (m.includes('decision') || m === 'dec') return 'DEC';
  return method.trim().toUpperCase();
}

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  const idx = trimmed.lastIndexOf(' ');
  if (idx < 0) return { firstName: '', lastName: trimmed };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

/**
 * Parse "/fighter/Brandon-Jenkins-177205" → "177205".
 */
function extractSherdogId(href: string | undefined): string | null {
  if (!href) return null;
  const match = href.match(/\/fighter\/[^/]*-(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Parse the Official Result sentence into structured fields.
 *
 * Two canonical shapes Sherdog uses:
 *   1. Decisions: "Winner def. Loser via {Type} Decision (score, score, score)"
 *   2. Finishes:  "Winner def. Loser R{n} {M:SS} via {Method} ({detail})"
 *
 * Returns null if the sentence doesn't parse — caller treats as in-progress.
 */
function parseOfficialResult(text: string): SherdogFightResult | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || !/def\.|defeats/i.test(clean)) return null;

  // Pull winner name (everything before "def.")
  const defMatch = clean.match(/^(.+?)\s+def\.\s+(.+?)(?:\s+(?:R\d+|via\b)|\s*$)/i);
  if (!defMatch) return null;
  const winnerFull = defMatch[1].trim();
  const winnerLast = splitName(winnerFull).lastName;

  // Finish format: "R{n} {M:SS} via {Method [Detail]} [(...)]"
  // Method phrase can be "Submission" / "KO" / "Technical Submission" /
  // "Technical Decision" / "KO/TKO" — capture letters, slashes, spaces until
  // an open-paren or end of string. normalizeMethod handles the variants.
  const finishMatch = clean.match(/R(\d+)\s+(\d{1,2}:\d{2})\s+via\s+([A-Za-z/ ]+?)(?:\s*\(([^)]+)\)|\s*$)/i);
  if (finishMatch) {
    return {
      winner: winnerLast,
      method: normalizeMethod(finishMatch[3] + (finishMatch[4] ? ` ${finishMatch[4]}` : '')),
      round: parseInt(finishMatch[1], 10),
      time: finishMatch[2],
      raw: clean,
    };
  }

  // Decision format: "via {Type} Decision (...)"
  const decisionMatch = clean.match(/via\s+([A-Za-z ]*decision)/i);
  if (decisionMatch) {
    return {
      winner: winnerLast,
      method: normalizeMethod(decisionMatch[1]),
      round: null,
      time: null,
      raw: clean,
    };
  }

  // Generic "via X" fallback — unknown finish style
  const genericMatch = clean.match(/via\s+([A-Za-z/]+)/i);
  if (genericMatch) {
    return {
      winner: winnerLast,
      method: normalizeMethod(genericMatch[1]),
      round: null,
      time: null,
      raw: clean,
    };
  }

  return null;
}

// ============== SCRAPER ==============

export class SherdogLiveScraper {
  constructor(private pbpUrl: string) {}

  async scrape(): Promise<SherdogEventData | null> {
    console.log(`\n[Sherdog] Scraping: ${this.pbpUrl}`);
    const t0 = Date.now();

    const response = await fetch(this.pbpUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.status === 404) {
      console.warn(`[Sherdog] 404 — no PBP page for this URL`);
      return null;
    }
    if (!response.ok) {
      throw new Error(`Sherdog HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const eventName = $('h1').first().text().replace(/^Live\s*Now!\s*/i, '').trim() || 'Sherdog PBP';

    // === Find the Live NOW! anchor from the TOC ===
    // The TOC <ul> has <li><a href="#anchor"><font color="#FF6600">Live NOW!</font> Fighter A vs Fighter B</a></li>
    // for the currently-live fight only. Capture the anchor it points at.
    let liveAnchor: string | null = null;
    $('a').each((_, el) => {
      const $a = $(el);
      if ($a.find('font[color="#FF6600"]').text().toLowerCase().includes('live now')) {
        const href = $a.attr('href') || '';
        if (href.startsWith('#')) {
          liveAnchor = href.slice(1);
          return false;
        }
      }
    });

    // === Iterate <div class="event"> fight blocks ===
    const fights: SherdogFight[] = [];
    let cardOrder = 0;

    $('div.event').each((_, el) => {
      const $div = $(el);

      // Anchor identifies the fight (for matching against liveAnchor).
      const anchor = $div.find('a[name]').first().attr('name') || '';

      // Two fighter links inside the <h2>.
      const fighterLinks = $div.find('h2 a[href^="/fighter/"]');
      if (fighterLinks.length < 2) return;

      const $aLink = $(fighterLinks[0]);
      const $bLink = $(fighterLinks[1]);
      const fullA = $aLink.text().replace(/\s+/g, ' ').trim();
      const fullB = $bLink.text().replace(/\s+/g, ' ').trim();
      if (!fullA || !fullB) return;

      cardOrder++;
      const splitA = splitName(fullA);
      const splitB = splitName(fullB);

      const fighterA: SherdogFighter = {
        firstName: splitA.firstName,
        lastName: splitA.lastName,
        name: fullA,
        sherdogId: extractSherdogId($aLink.attr('href')),
      };
      const fighterB: SherdogFighter = {
        firstName: splitB.firstName,
        lastName: splitB.lastName,
        name: fullB,
        sherdogId: extractSherdogId($bLink.attr('href')),
      };

      // === Detect Round 1 prose ===
      // Sherdog writes the <h3>Round 1</h3> followed by paragraph prose, then
      // <h4>Sherdog Scores</h4>, then 3 judge lines. When no prose exists yet,
      // the structure is just Round 1 -> Sherdog Scores. We detect by looking
      // at text between the first Round 1 and the first Sherdog Scores header.
      let hasRound1Prose = false;
      const $round1 = $div.find('h3').filter((_, h) => /round\s+1/i.test($(h).text())).first();
      if ($round1.length) {
        // Walk siblings until we hit h4 (Sherdog Scores) or another h3.
        let cursor = $round1[0].nextSibling;
        let proseLen = 0;
        while (cursor) {
          if (cursor.type === 'tag') {
            const tag = (cursor as any).tagName?.toLowerCase();
            if (tag === 'h3' || tag === 'h4') break;
          }
          const t = $(cursor as any).text?.() ?? '';
          proseLen += t.trim().length;
          cursor = (cursor as any).nextSibling;
        }
        hasRound1Prose = proseLen > 50; // Threshold ignores stray whitespace/markup.
      }

      // === Detect Official Result block content ===
      const $officialResult = $div
        .find('h3')
        .filter((_, h) => /official result/i.test($(h).text()))
        .first();
      let resultText = '';
      if ($officialResult.length) {
        let cursor = $officialResult[0].nextSibling;
        while (cursor) {
          if (cursor.type === 'tag' && (cursor as any).tagName?.toLowerCase() === 'h3') break;
          const t = $(cursor as any).text?.() ?? '';
          resultText += ' ' + t;
          cursor = (cursor as any).nextSibling;
        }
        resultText = resultText.replace(/\s+/g, ' ').trim();
      }

      const result = resultText ? parseOfficialResult(resultText) : null;
      const isComplete = !!result;
      const isLive = !!liveAnchor && liveAnchor === anchor;
      const hasStarted = isLive || hasRound1Prose || isComplete;

      fights.push({
        cardOrder,
        fighterA,
        fighterB,
        isLive,
        hasStarted,
        isComplete,
        result,
      });
    });

    const anyStarted = fights.some(f => f.hasStarted);
    const anyIncomplete = fights.some(f => !f.isComplete);

    const data: SherdogEventData = {
      eventName,
      eventUrl: this.pbpUrl,
      hasStarted: anyStarted,
      isComplete: !anyIncomplete && fights.length > 0,
      fights,
      scrapedAt: new Date().toISOString(),
    };

    const dt = Date.now() - t0;
    console.log(`[Sherdog] Parsed ${fights.length} fights in ${dt}ms — liveAnchor=${liveAnchor ?? 'none'}`);
    fights.forEach(f => {
      const tag = f.isComplete ? '✅' : f.isLive ? '🔴 LIVE' : f.hasStarted ? '⏳' : '⌛';
      const res = f.result ? ` → ${f.result.winner} via ${f.result.method}${f.result.round ? ` R${f.result.round} ${f.result.time}` : ''}` : '';
      console.log(`  ${f.cardOrder}. ${tag} ${f.fighterA.name} vs ${f.fighterB.name}${res}`);
    });

    return data;
  }
}

export default SherdogLiveScraper;

// ============== CLI ==============

if (require.main === module) {
  const url =
    process.argv[2] ||
    'https://www.sherdog.com/news/news/MVP-Rousey-vs-Carano-playbyplay-results-round-scoring-201197';
  new SherdogLiveScraper(url)
    .scrape()
    .then(d => {
      if (!d) {
        console.error('No data returned.');
        process.exit(1);
      }
      console.log('\n📊 Final:');
      console.log(JSON.stringify(d, null, 2));
    })
    .catch(e => {
      console.error('Fatal:', e);
      process.exit(1);
    });
}
