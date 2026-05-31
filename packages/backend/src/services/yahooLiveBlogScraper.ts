/**
 * Yahoo / Uncrowned Live-Blog Scraper (boxing live tracker)
 *
 * Sherdog is MMA-only — it writes no play-by-play for boxing cards. The boxing
 * gap (MVP, Matchroom, Top Rank boxing, Golden Boy, DAZN) is filled by Yahoo
 * Sports' "Uncrowned" live blogs, which cover nearly every major boxing card.
 * Scouted live during MVPW-03 (Han vs. Holm 2, 2026-05-30); see the experiments
 * log in docs/areas/live-trackers.md.
 *
 * Two structured signals on a Yahoo live-blog page:
 *
 *   1. A *card recap* list that flips per-fight from "{A} vs. {B}" (upcoming)
 *      to "{Winner} def. {Loser} by {METHOD} ({scores})" the moment a result is
 *      announced. This is the same canonical shape Sherdog/promoter pages use:
 *        "Nazarena Romero def. Maria Salinas by UD (80-72 × 3)"
 *        "Alexander Gueche def. Joshua Montoya by UD (77-75, 78-74 x2)"
 *      It is the authoritative, low-noise result source. We parse only the
 *      completed ("def.") entries — upcoming fights need no DB action.
 *
 *   2. A schema.org `LiveBlogPosting` JSON-LD blob holding a rolling window of
 *      the ~20 most-recent `liveBlogUpdate` entries, each with `datePublished`
 *      + `headline` + `articleBody`. Used for freshness and a best-effort
 *      ring-walk / "fight is live" signal. Newest-first prose, not per-fight
 *      structured, so we lean on it only for the start signal — results come
 *      from the recap list above.
 *
 * This scraper emits the SAME shape as the Sherdog scraper (`SherdogEventData`)
 * so it feeds straight into the promotion-agnostic `parseSherdogLiveData`
 * reconciler (called with completionMethodOverride: 'yahoo-tracker'). No parser
 * fork.
 *
 * Returns null on 403/404/non-OK (caller treats as a no-op cycle).
 */

import * as cheerio from 'cheerio';
import type {
  SherdogEventData,
  SherdogFight,
  SherdogFighter,
  SherdogFightResult,
} from './sherdogLiveScraper';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============== HELPERS ==============

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ');
  const idx = trimmed.lastIndexOf(' ');
  if (idx < 0) return { firstName: '', lastName: trimmed };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

function mkFighter(full: string): SherdogFighter {
  const { firstName, lastName } = splitName(full);
  return { firstName, lastName, name: full.trim(), sherdogId: null };
}

/**
 * Normalize a boxing result method phrase to our enum.
 * Yahoo writes "by UD" / "by unanimous decision" / "by TKO" / "by KO" / "by
 * split decision" / "by majority decision" / "by PTS" (UK points) etc.
 */
function normalizeMethod(raw: string): string {
  const m = raw.toLowerCase().trim();
  if (m.includes('no contest') || m === 'nc') return 'NC';
  if (m.includes('draw')) return 'DRAW';
  if (m.includes('disqualif') || m === 'dq') return 'DQ';
  // Finishes
  if (m.includes('technical knockout') || /\btko\b/.test(m)) return 'TKO';
  if (m.includes('corner retirement') || m.includes('retirement') || /\brtd\b/.test(m)) return 'RTD';
  if (m.includes('knockout') || /\bko\b/.test(m)) return 'KO';
  // Decisions
  if (m.includes('technical decision') || /\btd\b/.test(m)) return 'TD';
  if (m.includes('unanimous') || /\bud\b/.test(m)) return 'UD';
  if (m.includes('split') || /\bsd\b/.test(m)) return 'SD';
  if (m.includes('majority') || /\bmd\b/.test(m)) return 'MD';
  if (m.includes('points') || /\bpts\b/.test(m) || m.includes('decision')) return 'DEC';
  return raw.trim().toUpperCase();
}

/** Last-name signature for de-duping completed results across recap + stream. */
function pairKey(aFull: string, bFull: string): string {
  return [splitName(aFull).lastName, splitName(bFull).lastName]
    .map((s) => s.toLowerCase())
    .sort()
    .join('|');
}

/**
 * Extract every completed result on the page in the canonical
 *   "{Winner} def. {Loser} by {METHOD} (optional scores/detail)"
 * shape. Left of "def." is the winner (def. = defeated), matching Sherdog.
 *
 * Name groups are lazy and constrained to letters/spaces/hyphens/apostrophes/
 * periods/accents — a ':' (weight-class label like "Super bantamweight:") or a
 * sentence boundary naturally bounds the start, so "Super bantamweight: Romero
 * def. Salinas" captures winner="Romero", not the label.
 */
function extractResults(text: string): SherdogFightResult[] {
  const NAME = "[A-Z][A-Za-zÀ-ÿ.'’-]+(?:\\s+[A-Z][A-Za-zÀ-ÿ.'’-]+){0,3}";
  // Source-agnostic: Yahoo writes "by UD", the MVP promoter page writes "via
  // unanimous decision". Both reduce to the same canonical shape.
  const re = new RegExp(
    `(${NAME})\\s+def\\.\\s+(${NAME})\\s+(?:by|via)\\s+([A-Za-z][A-Za-z /]*?)(?:\\s*\\(([^)]*)\\))?(?=[.,;]|\\s+[A-Z][a-z]|$)`,
    'g',
  );
  const out: SherdogFightResult[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const winnerFull = m[1].trim();
    const loserFull = m[2].trim();
    const methodRaw = (m[3] || '').trim();
    const detail = (m[4] || '').trim();
    const method = normalizeMethod(methodRaw);

    // Round for finishes: look for "Round N" / "RN" in the detail or trailing.
    let round: number | null = null;
    const roundMatch = (detail + ' ' + methodRaw).match(/round\s*(\d{1,2})|\bR(\d{1,2})\b/i);
    if (roundMatch && (method === 'TKO' || method === 'KO' || method === 'RTD')) {
      round = parseInt(roundMatch[1] || roundMatch[2], 10);
    }

    out.push({
      winner: splitName(winnerFull).lastName,
      method,
      round,
      time: null, // Yahoo recap doesn't carry M:SS; finishes give round only.
      raw: `${winnerFull} def. ${loserFull} by ${methodRaw}${detail ? ` (${detail})` : ''}`,
    });
    // Stash full names on a side-channel via the raw string; the parser matches
    // by last-name pair, which we reconstruct below in scrape().
    (out[out.length - 1] as any)._winnerFull = winnerFull;
    (out[out.length - 1] as any)._loserFull = loserFull;
  }
  return out;
}

// ============== SCRAPER ==============

export class YahooLiveBlogScraper {
  constructor(private url: string) {}

  async scrape(): Promise<SherdogEventData | null> {
    console.log(`\n[Yahoo] Scraping: ${this.url}`);
    const t0 = Date.now();

    const response = await fetch(this.url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.status === 404 || response.status === 403) {
      console.warn(`[Yahoo] HTTP ${response.status} — treating as no-op cycle`);
      return null;
    }
    if (!response.ok) {
      throw new Error(`Yahoo HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // --- Event name + live-blog updates from JSON-LD ---
    let eventName = $('h1').first().text().replace(/\s+/g, ' ').trim() || 'Yahoo Live Blog';
    let updates: Array<{ datePublished: string; headline: string; body: string }> = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const txt = $(el).contents().text();
      if (!txt || !txt.includes('LiveBlog')) return;
      try {
        const parsed = JSON.parse(txt);
        for (const o of Array.isArray(parsed) ? parsed : [parsed]) {
          if (!String(o['@type'] || '').includes('LiveBlog')) continue;
          if (o.headline) eventName = String(o.headline).replace(/\s+/g, ' ').trim();
          for (const u of o.liveBlogUpdate || []) {
            updates.push({
              datePublished: u.datePublished || '',
              headline: (u.headline || '').replace(/\s+/g, ' ').trim(),
              body: (u.articleBody || '').replace(/\s+/g, ' ').trim(),
            });
          }
        }
      } catch {
        /* ignore malformed block */
      }
    });

    // --- Completed results from the whole-page text (recap list + bodies) ---
    // Strip tags; cheerio's text() collapses the recap "<p>" entries into one
    // run, which is exactly what extractResults() expects.
    const pageText = $('body').text().replace(/\s+/g, ' ');
    const rawResults = extractResults(pageText);

    // De-dupe by unordered last-name pair (recap + any stream restatement).
    const seen = new Set<string>();
    const fights: SherdogFight[] = [];
    let cardOrder = 0;
    for (const r of rawResults) {
      const winnerFull = (r as any)._winnerFull as string;
      const loserFull = (r as any)._loserFull as string;
      const key = pairKey(winnerFull, loserFull);
      if (seen.has(key)) continue;
      seen.add(key);
      cardOrder++;
      const result: SherdogFightResult = {
        winner: r.winner,
        method: r.method,
        round: r.round,
        time: r.time,
        raw: r.raw,
      };
      fights.push({
        cardOrder,
        fighterA: mkFighter(winnerFull),
        fighterB: mkFighter(loserFull),
        isLive: false,
        hasStarted: true,
        isComplete: true,
        result,
      });
    }

    // --- Event-level live / complete signals ---
    const liveblogStatus = ($('.liveblog-status').attr('class') || '').toLowerCase();
    const statusEnded = /ended|final|complete|over/.test(liveblogStatus);
    const hasStarted = updates.length > 0 || fights.length > 0;
    // Conservative: only call the event complete when the status says so. Leave
    // per-fight completions to drive everything else (avoids a premature event
    // COMPLETED while undercard results are still flowing in).
    const isComplete = statusEnded && fights.length > 0;

    const data: SherdogEventData = {
      eventName,
      eventUrl: this.url,
      hasStarted,
      isComplete,
      fights,
      scrapedAt: new Date().toISOString(),
    };

    const latest = updates[0]?.datePublished || '(no updates)';
    console.log(
      `[Yahoo] Parsed ${fights.length} completed result(s) in ${Date.now() - t0}ms — ` +
        `${updates.length} live updates, latest ${latest}, status="${liveblogStatus || 'n/a'}"`,
    );
    fights.forEach((f) =>
      console.log(
        `  ✅ ${f.fighterA.name} def. ${f.fighterB.name} — ${f.result?.method}` +
          `${f.result?.round ? ` R${f.result.round}` : ''}`,
      ),
    );

    return data;
  }
}

export default YahooLiveBlogScraper;

// ============== CLI ==============

if (require.main === module) {
  const url =
    process.argv[2] ||
    'https://sports.yahoo.com/boxing/live/stephanie-han-vs-holly-holm-2-live-results-round-by-round-updates-ring-walks-for-texas-rematch-070000761.html';
  new YahooLiveBlogScraper(url)
    .scrape()
    .then((d) => {
      if (!d) {
        console.error('No data returned.');
        process.exit(1);
      }
      console.log('\n📊 Final:');
      console.log(JSON.stringify(d, null, 2));
    })
    .catch((e) => {
      console.error('Fatal:', e);
      process.exit(1);
    });
}
