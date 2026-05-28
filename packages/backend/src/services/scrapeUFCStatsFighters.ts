/**
 * UFCStats.com Fighter Directory Scraper
 *
 * ufcstats.com publishes an alphabetical directory of every fighter who has
 * competed in a Zuffa-tracked promotion, one page per first-letter:
 *
 *   /statistics/fighters?char=a&page=all
 *
 * Each row carries First, Last, Nickname, Ht., Wt., Reach, Stance and the
 * fighter's career W / L / D directly in the table — no per-fighter page
 * fetch needed. We use this to backfill `wins/losses/draws` on Fighter rows
 * that are still sitting at the 0-0-0 default (see scripts/backfillFighterRecords.ts).
 *
 * As of 2026-05 ufcstats.com gates every response behind a lightweight
 * Hashcash-style JS proof-of-work ("Checking your browser…"): the page embeds
 * a `nonce` and a difficulty (N leading hex zeros), the client finds an `n`
 * such that sha256(`${nonce}:${n}`) starts with N zeros, POSTs it to /__c, and
 * receives a clearance cookie. We replicate that in Node with the built-in
 * crypto module — no headless browser required. The difficulty is tiny
 * (2 hex zeros ≈ 256 hashes), so solving is instant. We solve once and reuse
 * the cookie across all 26 letter pages.
 */

import axios from 'axios';
import * as crypto from 'crypto';
import * as cheerio from 'cheerio';

const BASE_URL = 'http://ufcstats.com';
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GoodFightsBackfill/1.0)';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export interface UFCStatsFighterRow {
  firstName: string;
  lastName: string;
  nickname: string | null;
  wins: number;
  losses: number;
  draws: number;
}

function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Parse the embedded JS proof-of-work and solve it. Returns null if not a challenge page. */
function solveChallenge(html: string): { nonce: string; n: number } | null {
  const nonceMatch = html.match(/nonce\s*=\s*"([0-9a-fA-F]+)"/);
  // difficulty: target = new Array(N+1).join('0')  → N leading hex zeros
  const targetMatch = html.match(/new Array\((\d+)\+1\)\.join\('0'\)/);
  if (!nonceMatch || !targetMatch) return null;
  const nonce = nonceMatch[1];
  const zeros = parseInt(targetMatch[1], 10);
  const target = '0'.repeat(zeros);
  let n = 0;
  while (sha256hex(`${nonce}:${n}`).slice(0, zeros) !== target) n++;
  return { nonce, n };
}

function mergeSetCookie(existing: string, headers: any): string {
  const sc = headers['set-cookie'] as string[] | undefined;
  if (!sc || sc.length === 0) return existing;
  const fresh = sc.map(c => c.split(';')[0]).join('; ');
  return existing ? `${existing}; ${fresh}` : fresh;
}

/**
 * A PoW-aware GET. Carries a cookie jar across calls; if a response is the
 * "Checking your browser" challenge it solves it, posts the answer, and retries.
 */
class UFCStatsClient {
  private cookie = '';

  async get(url: string): Promise<string> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT, ...(this.cookie ? { Cookie: this.cookie } : {}) },
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      this.cookie = mergeSetCookie(this.cookie, res.headers);

      const html = res.data;
      if (typeof html === 'string' && html.includes('Checking your browser')) {
        const sol = solveChallenge(html);
        if (!sol) throw new Error(`unrecognized challenge page for ${url}`);
        const body = `nonce=${encodeURIComponent(sol.nonce)}&n=${sol.n}`;
        const post = await axios.post(`${BASE_URL}/__c`, body, {
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(this.cookie ? { Cookie: this.cookie } : {}),
          },
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true,
        });
        this.cookie = mergeSetCookie(this.cookie, post.headers);
        continue; // retry the GET now that we hold a clearance cookie
      }
      return html as string;
    }
    throw new Error(`exceeded proof-of-work attempts for ${url}`);
  }
}

function parseRecordCell(cell: string): number {
  const n = parseInt(cell.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseDirectoryPage(html: string): UFCStatsFighterRow[] {
  const $ = cheerio.load(html);
  const out: UFCStatsFighterRow[] = [];

  $('tr.b-statistics__table-row').each((_, tr) => {
    const cols = $(tr).find('td.b-statistics__table-col').toArray()
      .map(td => $(td).text().replace(/\s+/g, ' ').trim());
    // Columns: [First, Last, Nickname, Ht., Wt., Reach, Stance, W, L, D, Belt]
    if (cols.length < 10) return; // header / spacer rows
    const firstName = cols[0];
    const lastName = cols[1];
    if (!firstName && !lastName) return;
    out.push({
      firstName,
      lastName,
      nickname: cols[2] || null,
      wins: parseRecordCell(cols[7]),
      losses: parseRecordCell(cols[8]),
      draws: parseRecordCell(cols[9]),
    });
  });

  return out;
}

/**
 * Fetch every fighter in the ufcstats directory (all 26 letter pages).
 * `onProgress` is called after each page with the letter and running total.
 */
export async function fetchAllUFCStatsFighters(
  onProgress?: (letter: string, pageCount: number, total: number) => void,
): Promise<UFCStatsFighterRow[]> {
  const client = new UFCStatsClient();
  const all: UFCStatsFighterRow[] = [];

  for (const letter of LETTERS) {
    const url = `${BASE_URL}/statistics/fighters?char=${letter}&page=all`;
    const html = await client.get(url);
    const rows = parseDirectoryPage(html);
    all.push(...rows);
    onProgress?.(letter, rows.length, all.length);
  }

  return all;
}
