/**
 * UFCStats.com Historic Scraper
 *
 * Reads ufcstats.com (the official UFC stats site) which has every UFC event
 * since 1993 with full winner/method/round/time data on a single page per event.
 *
 * Used by `scripts/backfillUFCHistoric.ts` to fill in the ~6,500 UFC fights
 * in our DB that have null winners — most of our existing UFC events were
 * imported from UFC.com which does not publish historic results past a short
 * recency window.
 *
 * Layout:
 *   /statistics/events/completed?page=all   — single-page list of all 770+ events
 *   /event-details/<hash>                   — per-event page with all fights inline
 *
 * The event-details page contains everything we need (winner indicator,
 * method, method-detail, round, time, fighter names + per-fighter URLs) in
 * the fight-list table. No need to fetch per-fight detail pages.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'http://ufcstats.com';
const EVENTS_LIST_URL = `${BASE_URL}/statistics/events/completed?page=all`;

const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GoodFightsBackfill/1.0)';

const http = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
  // ufcstats.com only serves http; do not auto-upgrade
  maxRedirects: 5,
});

export interface UFCStatsEventRef {
  name: string;
  date: Date;
  location: string;
  ufcStatsUrl: string;
}

export interface UFCStatsFight {
  /** Top fighter in the row (the row's "fighter1") */
  f1Name: string;
  f1StatsUrl: string | null;
  /** Bottom fighter in the row */
  f2Name: string;
  f2StatsUrl: string | null;
  /** 'f1' / 'f2' / 'draw' / 'nc' / null (no decision recorded) */
  winner: 'f1' | 'f2' | 'draw' | 'nc' | null;
  /** "KO/TKO" | "SUB" | "U-DEC" | "S-DEC" | "M-DEC" | "DQ" | etc. */
  method: string | null;
  /** Submethod / detail (e.g. "Elbows", "Rear Naked Choke", "Punches") */
  methodDetail: string | null;
  round: number | null;
  /** "M:SS" string as ufcstats publishes it */
  time: string | null;
  weightClass: string | null;
}

export interface UFCStatsEvent extends UFCStatsEventRef {
  fights: UFCStatsFight[];
}

/**
 * Fetch the full list of UFC events ever held.
 * Filters out the leading "next upcoming" row (dated in the future).
 */
export async function fetchUFCStatsEventList(): Promise<UFCStatsEventRef[]> {
  const res = await http.get(EVENTS_LIST_URL);
  const $ = cheerio.load(res.data);

  const events: UFCStatsEventRef[] = [];
  const now = Date.now();

  $('tr.b-statistics__table-row').each((_, tr) => {
    const $tr = $(tr);
    const $link = $tr.find('a.b-link').first();
    if (!$link.length) return;

    const url = $link.attr('href')?.trim();
    const name = $link.text().trim();
    if (!url || !name) return;

    const dateStr = $tr.find('span.b-statistics__date').text().trim();
    const date = parseUFCStatsDate(dateStr);
    if (!date) return;

    // Skip future events (the page leads with the next-upcoming card)
    if (date.getTime() > now) return;

    const location = $tr.find('td').last().text().trim().replace(/\s+/g, ' ');

    events.push({ name, date, location, ufcStatsUrl: url });
  });

  return events;
}

/**
 * Fetch a single event's detail page and extract every fight.
 */
export async function fetchUFCStatsEvent(eventUrl: string): Promise<UFCStatsEvent> {
  const res = await http.get(eventUrl);
  const $ = cheerio.load(res.data);

  // Event title + date + location are on the page header
  const name = $('span.b-content__title-highlight, h2.b-content__title').first().text().trim();
  const headerLis = $('li.b-list__box-list-item').toArray().map(li => $(li).text().replace(/\s+/g, ' ').trim());
  let date: Date | null = null;
  let location = '';
  for (const li of headerLis) {
    if (/^Date:/i.test(li)) date = parseUFCStatsDate(li.replace(/^Date:\s*/i, ''));
    else if (/^Location:/i.test(li)) location = li.replace(/^Location:\s*/i, '').trim();
  }

  const fights: UFCStatsFight[] = [];

  $('tr.js-fight-details-click').each((_, tr) => {
    const $tr = $(tr);
    const cols = $tr.find('td.b-fight-details__table-col');
    if (cols.length < 10) return; // unexpected row

    // Column 0: per-fighter result flag ("win" / "draw" / "nc"). Two paragraphs,
    //   one per fighter row. The flag's class encodes the result.
    const flagClasses = cols.eq(0).find('a.b-flag').toArray().map(a => $(a).attr('class') || '');
    const flagTexts = cols.eq(0).find('a.b-flag i.b-flag__text').toArray().map(i => $(i).text().trim().toLowerCase());

    // Column 1: fighter names + URLs. Two <a> elements (one per fighter).
    const fighterAnchors = cols.eq(1).find('a.b-link').toArray();
    if (fighterAnchors.length < 2) return;
    const f1Name = $(fighterAnchors[0]).text().trim();
    const f1StatsUrl = $(fighterAnchors[0]).attr('href')?.trim() || null;
    const f2Name = $(fighterAnchors[1]).text().trim();
    const f2StatsUrl = $(fighterAnchors[1]).attr('href')?.trim() || null;

    const winner = decodeWinner(flagTexts, flagClasses);

    // Column 6: weight class (text)
    const weightClass = cols.eq(6).find('p.b-fight-details__table-text').first().text().trim() || null;

    // Column 7: method + method detail (two <p>)
    const methodPs = cols.eq(7).find('p.b-fight-details__table-text').toArray();
    const method = methodPs[0] ? $(methodPs[0]).text().trim() || null : null;
    const methodDetail = methodPs[1] ? $(methodPs[1]).text().trim() || null : null;

    // Column 8: round
    const roundStr = cols.eq(8).find('p.b-fight-details__table-text').first().text().trim();
    const round = /^\d+$/.test(roundStr) ? parseInt(roundStr, 10) : null;

    // Column 9: time
    const time = cols.eq(9).find('p.b-fight-details__table-text').first().text().trim() || null;

    fights.push({
      f1Name,
      f1StatsUrl,
      f2Name,
      f2StatsUrl,
      winner,
      method,
      methodDetail,
      round,
      time,
      weightClass,
    });
  });

  return {
    name,
    date: date ?? new Date(0),
    location,
    ufcStatsUrl: eventUrl,
    fights,
  };
}

/**
 * Decide the winner from the two per-fighter flags.
 * ufcstats encodes:
 *   - winner row gets <a class="b-flag b-flag_style_green"> with text "win"
 *   - loser row gets no flag (or sometimes just an empty placeholder)
 *   - draws: both rows get "draw" flags (class b-flag_style_gray or similar)
 *   - NC: "nc"
 */
function decodeWinner(
  flagTexts: string[],
  _flagClasses: string[],
): 'f1' | 'f2' | 'draw' | 'nc' | null {
  const f1 = flagTexts[0] || '';
  const f2 = flagTexts[1] || '';
  if (f1 === 'win' && f2 !== 'win') return 'f1';
  if (f2 === 'win' && f1 !== 'win') return 'f2';
  if (f1 === 'draw' || f2 === 'draw') return 'draw';
  if (f1 === 'nc' || f2 === 'nc') return 'nc';
  return null;
}

/**
 * Parse "May 09, 2026" → Date (UTC midnight).
 * UFCStats publishes dates as plain US format with no time component.
 */
export function parseUFCStatsDate(s: string): Date | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // "May 09, 2026" format
  const m = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) {
    // Fallback to Date.parse
    const t = Date.parse(trimmed);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  const [, monStr, dayStr, yrStr] = m;
  const months: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const mo = months[monStr];
  if (mo === undefined) return null;
  return new Date(Date.UTC(parseInt(yrStr, 10), mo, parseInt(dayStr, 10)));
}
