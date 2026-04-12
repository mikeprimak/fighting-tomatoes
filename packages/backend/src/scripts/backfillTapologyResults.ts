/**
 * Tapology Results Backfill
 *
 * Scans recently-completed events whose fights are still missing winners and
 * re-runs the Tapology live tracker against each one. Catches results that
 * Tapology posts hours or days after the event — a window the normal live
 * tracker (12hr lookback) misses.
 *
 * Candidates:
 *   - eventStatus = COMPLETED
 *   - completedAt (or date, if no completedAt) within BACKFILL_WINDOW_DAYS
 *   - promotion is in TAPOLOGY_PROMOTION_HUBS (Gold Star, Matchroom, etc.)
 *     OR scraperType = 'tapology'
 *   - has >=1 fight with fightStatus COMPLETED/UPCOMING and winner IS NULL
 *
 * Intended to run daily via .github/workflows/tapology-backfill.yml.
 *
 * Environment:
 *   DATABASE_URL           - Required
 *   BACKFILL_WINDOW_DAYS   - Optional, defaults to 7
 */

import { PrismaClient } from '@prisma/client';
import { TapologyLiveScraper } from '../services/tapologyLiveScraper';
import { parseTapologyData } from '../services/tapologyLiveParser';

const prisma = new PrismaClient();

const DEFAULT_WINDOW_DAYS = 7;
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
  'The Ring': {
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

async function discoverTapologyUrl(event: any, promotion: string): Promise<string | null> {
  const hubConfig = TAPOLOGY_PROMOTION_HUBS[promotion];
  if (!hubConfig) {
    console.error(`  [backfill] No Tapology hub configured for promotion: ${promotion}`);
    return null;
  }

  try {
    const response = await fetch(hubConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      console.error(`  [backfill] Hub fetch failed HTTP ${response.status}`);
      return null;
    }
    const html = await response.text();
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const eventLinks: { name: string; url: string }[] = [];
    const linkSelector = hubConfig.scopeSelector
      ? `${hubConfig.scopeSelector} a[href*="/fightcenter/events/"]`
      : 'a[href*="/fightcenter/events/"]';
    $(linkSelector).each((_, el) => {
      const href = $(el).attr('href');
      const name = $(el).text().trim();
      if (!href || !name || name.length < 3) return;
      if (hubConfig.slugFilter.length > 0) {
        const hrefLower = href.toLowerCase();
        if (!hubConfig.slugFilter.some(slug => hrefLower.includes(slug))) return;
      }
      const fullUrl = href.startsWith('http') ? href : `${TAPOLOGY_BASE_URL}${href}`;
      eventLinks.push({ name, url: fullUrl });
    });

    if (eventLinks.length === 0) return null;

    const eventNameLower = event.name.toLowerCase();
    for (const link of eventLinks) {
      const linkNameLower = link.name.toLowerCase();
      if (eventNameLower.includes(linkNameLower) || linkNameLower.includes(eventNameLower)) {
        await prisma.event.update({ where: { id: event.id }, data: { ufcUrl: link.url } });
        return link.url;
      }
    }

    const eventWords = event.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 2);
    for (const link of eventLinks) {
      const urlLower = link.url.toLowerCase();
      const matchCount = eventWords.filter((w: string) => urlLower.includes(w)).length;
      if (matchCount >= 2) {
        await prisma.event.update({ where: { id: event.id }, data: { ufcUrl: link.url } });
        return link.url;
      }
    }

    return null;
  } catch (error: any) {
    console.error(`  [backfill] Discovery error: ${error.message}`);
    return null;
  }
}

async function getTapologyUrl(event: any): Promise<string | null> {
  if (event.ufcUrl && event.ufcUrl.includes('tapology.com')) {
    return event.ufcUrl;
  }
  return discoverTapologyUrl(event, event.promotion || '');
}

async function findBackfillCandidates(windowDays: number) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const knownPromotions = Object.keys(TAPOLOGY_PROMOTION_HUBS);

  return prisma.event.findMany({
    where: {
      eventStatus: 'COMPLETED',
      date: { gte: windowStart },
      OR: [
        { scraperType: 'tapology' },
        { promotion: { in: knownPromotions } },
      ],
      fights: {
        some: {
          winner: null,
          fightStatus: { in: ['COMPLETED', 'UPCOMING'] },
        },
      },
    },
    orderBy: { date: 'desc' },
  });
}

async function backfillEvent(event: any): Promise<{ matched: number; updated: number }> {
  console.log(`\n[backfill] ${event.name} (${event.id}) — promotion=${event.promotion}`);

  const url = await getTapologyUrl(event);
  if (!url) {
    console.log('  [backfill] No Tapology URL resolved, skipping');
    return { matched: 0, updated: 0 };
  }
  console.log(`  [backfill] Scraping: ${url}`);

  const scraper = new TapologyLiveScraper(url);
  const scraped = await scraper.scrape();
  console.log(`  [backfill] Scraped ${scraped.fights.length} fights, status=${scraped.status}`);

  const result = await parseTapologyData(event.id, scraped);
  console.log(`  [backfill] matched=${result.fightsMatched} updated=${result.fightsUpdated}`);
  return { matched: result.fightsMatched, updated: result.fightsUpdated };
}

async function main() {
  const windowDays = parseInt(process.env.BACKFILL_WINDOW_DAYS || `${DEFAULT_WINDOW_DAYS}`, 10);
  console.log(`\n========================================`);
  console.log(`[backfill] Tapology results backfill`);
  console.log(`[backfill] Window: last ${windowDays} days`);
  console.log(`[backfill] Started: ${new Date().toISOString()}`);
  console.log(`========================================`);

  const candidates = await findBackfillCandidates(windowDays);
  console.log(`\n[backfill] Found ${candidates.length} candidate event(s)`);

  let totalMatched = 0;
  let totalUpdated = 0;
  let failures = 0;

  for (const event of candidates) {
    try {
      const r = await backfillEvent(event);
      totalMatched += r.matched;
      totalUpdated += r.updated;
    } catch (err: any) {
      failures++;
      console.error(`  [backfill] ERROR on ${event.name}: ${err.message}`);
    }
  }

  console.log(`\n[backfill] Done. events=${candidates.length} matched=${totalMatched} updated=${totalUpdated} failures=${failures}\n`);
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error('[backfill] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
