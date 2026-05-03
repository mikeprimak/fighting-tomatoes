/**
 * UFC.com Athlete Headshot Scraper
 *
 * Fetches https://www.ufc.com/athlete/<slug> and extracts the athlete's
 * canonical headshot URL from the page's <meta property="og:image"> tag.
 *
 * og:image is the right selector because:
 *   - it's set on every athlete page that exists (current and retired)
 *   - it's a single canonical value (no DOM ambiguity vs sidebar widgets)
 *   - it points at the same headshot the user-facing page header displays
 *
 * Implementation note — why curl instead of axios/fetch:
 *   ufc.com sits behind anti-bot protection that TLS-fingerprints (JA3) the
 *   client. Node.js's OpenSSL stack produces a fingerprint that returns 403,
 *   regardless of headers. Real browsers and curl pass. Shelling out to curl
 *   is the most reliable path; cross-platform; already required for other
 *   dev tooling so no new dep.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';

const execFileAsync = promisify(execFile);

const REQUEST_TIMEOUT_MS = 20_000;

const BROWSER_HEADERS = [
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language: en-US,en;q=0.9',
];

export interface UFCHeadshotResult {
  status: 'ok' | 'no-page' | 'no-image' | 'error';
  imageUrl?: string;
  finalUrl?: string;
  errorMessage?: string;
}

export async function fetchUFCAthleteHeadshot(slug: string): Promise<UFCHeadshotResult> {
  const url = `https://www.ufc.com/athlete/${encodeURIComponent(slug)}`;

  // -s: silent, -L: follow redirects, -o -: stdout, -w: write status code last
  // We append a delimited HTTP code suffix so we can split it off cleanly.
  const args = [
    '-sSL',
    '--max-time', String(REQUEST_TIMEOUT_MS / 1000),
    '-w', '\n__HTTP_STATUS__:%{http_code}',
  ];
  for (const h of BROWSER_HEADERS) {
    args.push('-H', h);
  }
  args.push(url);

  let stdout: string;
  try {
    const result = await execFileAsync('curl', args, {
      timeout: REQUEST_TIMEOUT_MS + 2000,
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (err: any) {
    return { status: 'error', errorMessage: err.message, finalUrl: url };
  }

  // Split off the trailing status marker
  const marker = '\n__HTTP_STATUS__:';
  const idx = stdout.lastIndexOf(marker);
  if (idx < 0) {
    return { status: 'error', errorMessage: 'curl output missing status marker', finalUrl: url };
  }
  const body = stdout.slice(0, idx);
  const statusCode = parseInt(stdout.slice(idx + marker.length).trim(), 10);

  if (statusCode === 404 || statusCode === 410) {
    return { status: 'no-page', finalUrl: url };
  }
  if (statusCode >= 400 || !Number.isFinite(statusCode)) {
    return { status: 'error', errorMessage: `HTTP ${statusCode}`, finalUrl: url };
  }

  const $ = cheerio.load(body);
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim();
  if (!ogImage) {
    return { status: 'no-image', finalUrl: url };
  }

  return { status: 'ok', imageUrl: ogImage, finalUrl: url };
}

/**
 * Derive a likely ufc.com athlete slug from a fighter's display name.
 *   "Conor McGregor"           → "conor-mcgregor"
 *   "Israel Adesanya"          → "israel-adesanya"
 *   "Jose Aldo Jr."            → "jose-aldo-jr"
 *
 * The actual canonical slugs may differ (UFC.com uses curated slugs with
 * occasional disambiguation suffixes). Callers should treat this as a
 * best-guess; verify by fetching the page and checking the result.
 */
export function deriveUFCAthleteSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/['’‘`.]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
