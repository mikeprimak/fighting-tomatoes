/**
 * Start Time Backfill (Tapology)
 *
 * Finds upcoming events whose mainStartTime / prelimStartTime / earlyPrelimStartTime
 * are all null, looks them up on Tapology (via the event's ufcUrl when it is
 * already a Tapology link, otherwise via the org's promotion hub), pulls the
 * "Date/Time:" sidebar value, and writes mainStartTime onto the event.
 *
 * Used to repair events created before the Tapology scraper started capturing
 * eventStartTime, and to recover events the daily scraper missed (e.g. when
 * the first "li span.font-bold" landed on a fight-row label instead of the
 * sidebar Date/Time row).
 *
 * Tapology only exposes a single Date/Time value per event (no separate
 * prelim/early-prelim breakdown), so this script writes mainStartTime only.
 *
 * Run: pnpm tsx src/scripts/backfillStartTimes.ts
 *      or: node dist/scripts/backfillStartTimes.js
 */

import { PrismaClient } from '@prisma/client';
import puppeteer, { Browser, Page } from 'puppeteer';
import { eventTimeToUTC } from '../utils/timezone';

function timezoneAbbrevToIANA(abbrev: string): string {
  const m: Record<string, string> = {
    ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
    CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
    MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
    PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
    GMT: 'UTC', UTC: 'UTC', BST: 'Europe/London',
    CET: 'Europe/Berlin', JST: 'Asia/Tokyo',
  };
  return m[abbrev.toUpperCase()] || 'America/New_York';
}

const prisma = new PrismaClient();

const TAPOLOGY_BASE_URL = 'https://www.tapology.com';

const TAPOLOGY_PROMOTION_HUBS: Record<string, { url: string; slugFilter: string[]; scopeSelector?: string }> = {
  'Zuffa Boxing': {
    url: 'https://www.tapology.com/fightcenter/promotions/6299-zuffa-boxing-zb',
    slugFilter: ['zuffa'],
  },
  'PFL': {
    url: 'https://www.tapology.com/fightcenter/promotions/1969-professional-fighters-league-pfl',
    slugFilter: ['pfl'],
  },
  'RIZIN': {
    url: 'https://www.tapology.com/fightcenter/promotions/1561-rizin-fighting-federation-rff',
    slugFilter: ['rizin'],
  },
  'Dirty Boxing': {
    url: 'https://www.tapology.com/fightcenter/promotions/5649-dirty-boxing-championship-dbc',
    slugFilter: ['dirty-boxing', 'dbx-', 'dbc-'],
  },
  'Karate Combat': {
    url: 'https://www.tapology.com/fightcenter/promotions/3637-karate-combat-kc',
    slugFilter: ['karate-combat', 'kc-'],
  },
  'TOP_RANK': {
    url: 'https://www.tapology.com/fightcenter/promotions/2487-top-rank-tr',
    slugFilter: [],
    scopeSelector: '#content',
  },
  'Golden Boy': {
    url: 'https://www.tapology.com/fightcenter/promotions/1979-golden-boy-promotions-gbp',
    slugFilter: [],
    scopeSelector: '#content',
  },
  'Gold Star': {
    url: 'https://www.tapology.com/fightcenter/promotions/6908-gold-star-promotions-gsp',
    slugFilter: [],
    scopeSelector: '#content',
  },
  'Matchroom Boxing': {
    url: 'https://www.tapology.com/fightcenter/promotions/2484-matchroom-boxing-mb',
    slugFilter: ['matchroom'],
  },
  'MVP': {
    url: 'https://www.tapology.com/fightcenter/promotions/4040-most-valuable-promotions-mvp',
    slugFilter: ['mvp', 'most-valuable'],
  },
};

interface ExtractedDateTime {
  eventStartTime: string | null;
  eventStartTimezone: string | null;
  dateText: string | null;
}

async function extractDateTimeFromTapologyPage(page: Page): Promise<ExtractedDateTime> {
  return page.evaluate(() => {
    const out: ExtractedDateTime = { eventStartTime: null, eventStartTimezone: null, dateText: null };

    const pageText = document.body.innerText || '';

    // Iterate every li > span.font-bold and pick the one labeled Date/Time.
    // Array.from for NodeList iteration so this compiles without dom.iterable lib.
    const labels = Array.from(document.querySelectorAll('li span.font-bold'));
    for (const lbl of labels) {
      if (!/date\s*\/?\s*time/i.test(lbl.textContent || '')) continue;
      const li = (lbl as HTMLElement).parentElement;
      if (!li) continue;
      const valueSpan = li.querySelector('span.text-neutral-700, span:not(.font-bold)');
      const dtText = (valueSpan?.textContent || li.textContent || '').replace(/Date\s*\/?\s*Time:/i, '').trim();
      const m = dtText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))(?:\s*(ET|EST|EDT|PT|PST|PDT|CT|CST|CDT|GMT|UTC|JST|CET|BST))?/i);
      if (m) {
        out.eventStartTime = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
        if (m[2]) out.eventStartTimezone = m[2].toUpperCase();
      }
      const numDate = dtText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (numDate) {
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        out.dateText = `${months[parseInt(numDate[1], 10) - 1]} ${parseInt(numDate[2], 10)}, ${numDate[3]}`;
      }
      break;
    }

    if (!out.eventStartTime) {
      // Last-ditch fallback: scan visible page text for time + timezone pattern.
      const m = pageText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(ET|EST|EDT|PT|PST|PDT|CT|CST|CDT)/i);
      if (m) {
        out.eventStartTime = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
        out.eventStartTimezone = m[2].toUpperCase();
      }
    }

    return out;
  });
}

async function searchTapologyForEvent(page: Page, eventName: string): Promise<string | null> {
  const term = encodeURIComponent(eventName.replace(/[^\w\s.&-]/g, '').trim());
  const searchUrl = `https://www.tapology.com/search?term=${term}&mainSearchFilter=events`;
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    try { await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 10000 }); } catch (_) {}
    const candidates = await page.evaluate(() => {
      const results: { name: string; url: string }[] = [];
      document.querySelectorAll('a[href*="/fightcenter/events/"]').forEach((a) => {
        const href = (a as HTMLAnchorElement).href.replace(/[#?].*$/, '');
        const text = (a.textContent || '').trim();
        if (!/\/events\/\d+-/.test(href)) return;
        if (text.length < 3) return;
        results.push({ name: text, url: href });
      });
      return results;
    });
    if (candidates.length === 0) return null;

    const eventNameLower = eventName.toLowerCase();
    for (const c of candidates) {
      const cLower = c.name.toLowerCase();
      if (eventNameLower.includes(cLower) || cLower.includes(eventNameLower)) return c.url;
    }
    // Word-overlap fallback
    const words = eventName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2);
    for (const c of candidates) {
      const haystack = (c.url + ' ' + c.name).toLowerCase();
      if (words.filter((w) => haystack.includes(w)).length >= 2) return c.url;
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function findTapologyUrl(page: Page, eventName: string, promotion: string, ufcUrl: string | null): Promise<string | null> {
  if (ufcUrl && ufcUrl.includes('tapology.com/fightcenter/events/')) return ufcUrl;

  // Try Tapology search first — works for any org without needing a per-org
  // hub config and works for orgs whose hub URL has a misleading slugFilter.
  const fromSearch = await searchTapologyForEvent(page, eventName);
  if (fromSearch) return fromSearch;

  const hub = TAPOLOGY_PROMOTION_HUBS[promotion];
  if (!hub) {
    console.log(`  [skip] No Tapology hub configured for promotion: ${promotion}`);
    return null;
  }

  await page.goto(hub.url, { waitUntil: 'networkidle2', timeout: 60000 });
  try { await page.waitForSelector('a[href*="/fightcenter/events/"]', { timeout: 15000 }); } catch (_) {}

  const links = await page.evaluate((hubScope: string | undefined, slugFilter: string[]) => {
    const sel = hubScope ? `${hubScope} a[href*="/fightcenter/events/"]` : 'a[href*="/fightcenter/events/"]';
    const results: { name: string; url: string }[] = [];
    document.querySelectorAll(sel).forEach((a) => {
      const href = (a as HTMLAnchorElement).href.replace(/[#?].*$/, '');
      const text = (a.textContent || '').trim();
      if (!/\/events\/\d+-/.test(href)) return;
      if (slugFilter.length > 0) {
        const hrefLower = href.toLowerCase();
        if (!slugFilter.some((s) => hrefLower.includes(s))) return;
      }
      results.push({ name: text, url: href });
    });
    return results;
  }, hub.scopeSelector, hub.slugFilter);

  const eventNameLower = eventName.toLowerCase();
  for (const link of links) {
    const linkLower = link.name.toLowerCase();
    if (linkLower.length >= 3 && (eventNameLower.includes(linkLower) || linkLower.includes(eventNameLower))) {
      return link.url;
    }
  }

  // Word-overlap fallback (>=2 distinctive words match).
  const eventWords = eventName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2);
  for (const link of links) {
    const haystack = (link.url + ' ' + link.name).toLowerCase();
    const matches = eventWords.filter((w) => haystack.includes(w)).length;
    if (matches >= 2) return link.url;
  }

  return null;
}

async function backfillOne(browser: Browser, event: any): Promise<{ ok: boolean; reason?: string; mainStartTime?: Date }> {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    const tapologyUrl = await findTapologyUrl(page, event.name, event.promotion, event.ufcUrl);
    if (!tapologyUrl) return { ok: false, reason: 'no Tapology URL resolved' };

    console.log(`  → ${tapologyUrl}`);

    await page.goto(tapologyUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    try { await page.waitForSelector('a[href*="/fightcenter/fighters/"]', { timeout: 15000 }); } catch (_) {}
    try {
      const consentBtn = await page.$('button[aria-label="Consent"], .fc-cta-consent, button.accept-cookies');
      if (consentBtn) { await consentBtn.click(); await new Promise((r) => setTimeout(r, 600)); }
    } catch (_) {}

    const extracted = await extractDateTimeFromTapologyPage(page);
    if (!extracted.eventStartTime) return { ok: false, reason: 'time not present on Tapology page' };

    const tz = extracted.eventStartTimezone ? timezoneAbbrevToIANA(extracted.eventStartTimezone) : 'America/New_York';
    const mainStartTime = eventTimeToUTC(event.date, extracted.eventStartTime, tz);
    if (!mainStartTime) return { ok: false, reason: `eventTimeToUTC failed (raw=${extracted.eventStartTime})` };

    await prisma.event.update({
      where: { id: event.id },
      data: {
        mainStartTime,
        ...(tapologyUrl !== event.ufcUrl && !event.ufcUrl?.includes('tapology.com') ? {} : {}),
      },
    });

    return { ok: true, mainStartTime };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`\n=== Tapology start-time backfill — ${new Date().toISOString()} ===\n`);

  const events = await prisma.event.findMany({
    where: {
      eventStatus: 'UPCOMING',
      mainStartTime: null,
      prelimStartTime: null,
      earlyPrelimStartTime: null,
    },
    select: { id: true, name: true, promotion: true, date: true, ufcUrl: true, scraperType: true },
    orderBy: { date: 'asc' },
  });

  console.log(`Found ${events.length} upcoming events with no start time.\n`);
  if (events.length === 0) { await prisma.$disconnect(); return; }

  const browser = await puppeteer.launch({ headless: true });

  let fixed = 0;
  let skipped = 0;
  for (const ev of events) {
    console.log(`\n[${ev.promotion}] ${ev.name} (${ev.date.toISOString().slice(0, 10)})`);
    try {
      const r = await backfillOne(browser, ev);
      if (r.ok && r.mainStartTime) {
        console.log(`  ✓ wrote mainStartTime = ${r.mainStartTime.toISOString()}`);
        fixed++;
      } else {
        console.log(`  ⚠ skipped: ${r.reason}`);
        skipped++;
      }
    } catch (err: any) {
      console.error(`  ✗ error: ${err.message}`);
      skipped++;
    }
  }

  await browser.close();
  await prisma.$disconnect();

  console.log(`\n=== Done. fixed=${fixed} skipped=${skipped} total=${events.length} ===\n`);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
