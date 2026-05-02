/**
 * VPS Scraper Service
 *
 * Lightweight HTTP server that runs on a Hetzner VPS.
 * Accepts start/stop commands from the Render backend and runs
 * live event scrapers every 30 seconds (instead of every 5 min via GitHub Actions).
 *
 * Architecture:
 *   - Render backend calls POST /track/start { eventId, scraperType, url }
 *   - This service starts a 30-second loop for that event
 *   - Each loop iteration runs the appropriate scraper + parser
 *   - Render backend calls POST /track/stop { eventId } when done
 *   - GET /status returns all active trackers
 *   - POST /track/check auto-discovers active events from DB
 *
 * Deployment:
 *   node dist/scraperService.js
 *
 * Environment:
 *   DATABASE_URL     - Required (Render Postgres external URL)
 *   SCRAPER_API_KEY  - Required (shared secret with Render backend)
 *   PORT             - Optional (default 3009)
 */

import * as http from 'http';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

// Scraper imports
import OneFCLiveScraper from './services/oneFCLiveScraper';
import OktagonLiveScraper from './services/oktagonLiveScraper';
import { TapologyLiveScraper } from './services/tapologyLiveScraper';

// Parser imports
import { parseLiveEventData, getEventStatus, autoCompleteEvent } from './services/ufcLiveParser';
import { parseBKFCLiveData, autoCompleteBKFCEvent } from './services/bkfcLiveParser';
import { parseOneFCLiveData, autoCompleteOneFCEvent } from './services/oneFCLiveParser';
import { parseOktagonLiveData, autoCompleteOktagonEvent } from './services/oktagonLiveParser';
import { parseTapologyData } from './services/tapologyLiveParser';
import type { BKFCEventData } from './services/bkfcLiveScraper';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const PORT = parseInt(process.env.PORT || '3009', 10);
const API_KEY = process.env.SCRAPER_API_KEY || '';
const SCRAPE_INTERVAL_MS = 30 * 1000; // 30 seconds
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// ============== ACTIVE TRACKER MANAGEMENT ==============

interface ActiveTracker {
  eventId: string;
  eventName: string;
  scraperType: string;
  url: string;
  interval: ReturnType<typeof setInterval>;
  isRunning: boolean; // guard against overlapping scrapes
  lastScrapeAt: Date | null;
  lastError: string | null;
  scrapeCount: number;
  consecutiveErrors: number;
  startedAt: Date;
}

const activeTrackers = new Map<string, ActiveTracker>();

// ============== SCRAPE-ONCE FUNCTIONS ==============

/**
 * Convert UFC scraped data format to live update format.
 * (Same logic as runUFCLiveTracker.ts)
 */
function convertScrapedToLiveUpdate(eventData: any): any {
  const isLive = eventData.status === 'Live' || eventData.hasStarted;
  const isComplete = eventData.status === 'Complete' || eventData.isComplete;
  const eventStatus = isComplete ? 'COMPLETED' : (isLive ? 'LIVE' : 'UPCOMING');

  const fights = (eventData.fights || []).map((fight: any) => {
    let fightStatus: 'upcoming' | 'live' | 'complete' = 'upcoming';
    let currentRound: number | null = null;
    let completedRounds: number | null = null;

    if (fight.status === 'complete' || fight.isComplete || fight.winner || fight.result?.winner) {
      fightStatus = 'complete';
      completedRounds = fight.completedRounds || fight.result?.round || fight.round || null;
    } else if (fight.status === 'live' || fight.isLive || fight.hasStarted) {
      fightStatus = 'live';
      currentRound = fight.currentRound || null;
      completedRounds = fight.completedRounds || (currentRound ? currentRound - 1 : null);
    }

    return {
      ufcFightId: fight.fightId || null,
      fighterAName: fight.fighterA?.name || fight.fighter1Name || '',
      fighterBName: fight.fighterB?.name || fight.fighter2Name || '',
      order: fight.order || null,
      cardType: fight.cardType || null,
      weightClass: fight.weightClass || null,
      isTitle: fight.isTitle || false,
      status: fightStatus,
      fightStatus: fightStatus === 'complete' ? 'COMPLETED' : (fightStatus === 'live' ? 'LIVE' : 'UPCOMING'),
      currentRound,
      completedRounds,
      winner: fight.result?.winner || fight.winner || null,
      method: fight.result?.method || fight.method || null,
      winningRound: fight.result?.round || fight.round || null,
      winningTime: fight.result?.time || fight.time || null
    };
  });

  return { eventName: eventData.eventName || eventData.name, eventStatus, fights };
}

/**
 * Run one UFC scrape iteration.
 * Spawns the Puppeteer child process (scrapeLiveEvent.js).
 */
async function scrapeUFCOnce(tracker: ActiveTracker): Promise<void> {
  const scraperPath = path.join(__dirname, 'services/scrapeLiveEvent.js');
  const outputDir = path.join(__dirname, '../live-event-data');
  await fs.mkdir(outputDir, { recursive: true });

  const command = `node "${scraperPath}" "${tracker.url}" "${outputDir}"`;
  const { stdout, stderr } = await execAsync(command, {
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, TZ: 'America/New_York' },
  });

  if (stdout) console.log(`[UFC] ${stdout.substring(0, 500)}`);
  if (stderr) console.warn(`[UFC] stderr: ${stderr.substring(0, 300)}`);

  // Read most recent output file
  const files = await fs.readdir(outputDir);
  const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
  if (jsonFiles.length === 0) throw new Error('No scrape data found');

  const latestFile = path.join(outputDir, jsonFiles[0]);
  const scrapedData = JSON.parse(await fs.readFile(latestFile, 'utf-8'));

  if (scrapedData.events && scrapedData.events.length > 0) {
    const liveUpdate = convertScrapedToLiveUpdate(scrapedData.events[0]);
    console.log(`[UFC] ${liveUpdate.fights.length} fights, status: ${liveUpdate.eventStatus}`);

    await parseLiveEventData(liveUpdate, tracker.eventId);

    const eventStatus = await getEventStatus(tracker.eventId);
    if (eventStatus && eventStatus.eventStatus !== 'COMPLETED') {
      const completed = await autoCompleteEvent(tracker.eventId);
      if (completed) {
        console.log('[UFC] Event auto-completed');
        stopTracker(tracker.eventId);
      }
    } else if (eventStatus?.eventStatus === 'COMPLETED') {
      stopTracker(tracker.eventId);
    }
  }

  // Cleanup old files (keep last 5)
  for (const oldFile of jsonFiles.slice(5)) {
    try { await fs.unlink(path.join(outputDir, oldFile)); } catch {}
  }
}

/**
 * Run one BKFC scrape iteration.
 * Spawns the Puppeteer child process (scrapeBKFCLiveEvent.js).
 */
async function scrapeBKFCOnce(tracker: ActiveTracker): Promise<void> {
  const scraperPath = path.join(__dirname, 'services/scrapeBKFCLiveEvent.js');
  const outputDir = path.join(__dirname, '../live-event-data/bkfc');
  await fs.mkdir(outputDir, { recursive: true });

  const command = `node "${scraperPath}" "${tracker.url}" "${outputDir}"`;
  const { stdout, stderr } = await execAsync(command, {
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stdout) console.log(`[BKFC] ${stdout.substring(0, 500)}`);
  if (stderr) console.warn(`[BKFC] stderr: ${stderr.substring(0, 300)}`);

  const files = await fs.readdir(outputDir);
  const jsonFiles = files.filter(f => f.startsWith('bkfc-live-') && f.endsWith('.json')).sort().reverse();
  if (jsonFiles.length === 0) throw new Error('No scrape data found');

  const latestFile = path.join(outputDir, jsonFiles[0]);
  const scrapedJson = JSON.parse(await fs.readFile(latestFile, 'utf-8'));
  const scrapedData: BKFCEventData = scrapedJson.events?.[0];
  if (!scrapedData) throw new Error('No event data in scraped JSON');

  console.log(`[BKFC] ${scrapedData.fights.length} fights, status: ${scrapedData.status}`);

  const result = await parseBKFCLiveData(scrapedData, tracker.eventId);
  console.log(`[BKFC] Updated: ${result.fightsUpdated}, cancelled: ${result.cancelledCount}`);

  const completed = await autoCompleteBKFCEvent(tracker.eventId);
  if (completed) {
    console.log('[BKFC] Event auto-completed');
    stopTracker(tracker.eventId);
  }

  // Cleanup
  for (const oldFile of jsonFiles.slice(5)) {
    try { await fs.unlink(path.join(outputDir, oldFile)); } catch {}
  }
}

/**
 * Run one ONE FC scrape iteration.
 * Uses OneFCLiveScraper directly (Puppeteer in-process).
 */
async function scrapeOneFCOnce(tracker: ActiveTracker): Promise<void> {
  const scraper = new OneFCLiveScraper(tracker.url);
  try {
    const scrapedData = await scraper.scrape();
    console.log(`[ONE FC] ${scrapedData.fights.length} fights, status: ${scrapedData.status}`);

    const result = await parseOneFCLiveData(scrapedData, tracker.eventId);
    console.log(`[ONE FC] Updated: ${result.fightsUpdated}, cancelled: ${result.cancelledCount}`);

    const completed = await autoCompleteOneFCEvent(tracker.eventId);
    if (completed) {
      console.log('[ONE FC] Event auto-completed');
      stopTracker(tracker.eventId);
    }
  } finally {
    await scraper.stop();
  }
}

/**
 * Run one Oktagon scrape iteration.
 * Uses OktagonLiveScraper (REST API, no browser).
 */
async function scrapeOktagonOnce(tracker: ActiveTracker): Promise<void> {
  // Extract slug from URL: https://oktagonmma.com/en/events/oktagon-85-hamburg/ → oktagon-85-hamburg
  const slugMatch = tracker.url.match(/events\/([^/?]+)/);
  const slug = slugMatch ? slugMatch[1] : tracker.url;

  const scraper = new OktagonLiveScraper(slug);
  const scrapedData = await scraper.scrape();
  console.log(`[OKTAGON] ${scrapedData.fights.length} fights, status: ${scrapedData.status}`);

  const result = await parseOktagonLiveData(scrapedData, tracker.eventId);
  console.log(`[OKTAGON] Updated: ${result.fightsUpdated}, cancelled: ${result.cancelledCount}`);

  const completed = await autoCompleteOktagonEvent(tracker.eventId);
  if (completed) {
    console.log('[OKTAGON] Event auto-completed');
    stopTracker(tracker.eventId);
  }
}

/**
 * Run one Tapology scrape iteration.
 * Uses TapologyLiveScraper (cheerio/HTTP, no browser).
 */
async function scrapeTapologyOnce(tracker: ActiveTracker): Promise<void> {
  const scraper = new TapologyLiveScraper(tracker.url);
  const scrapedData = await scraper.scrape();
  console.log(`[TAPOLOGY] ${scrapedData.fights.length} fights, status: ${scrapedData.status}`);

  const result = await parseTapologyData(tracker.eventId, scrapedData);
  console.log(`[TAPOLOGY] Matched: ${result.fightsMatched}, updated: ${result.fightsUpdated}`);

  // Auto-complete check
  const fights = await prisma.fight.findMany({
    where: { eventId: tracker.eventId },
    select: { fightStatus: true, trackerFightStatus: true },
  });

  if (fights.length > 0) {
    const allComplete = fights.every(
      f => f.fightStatus === 'COMPLETED' || f.fightStatus === 'CANCELLED' ||
           f.trackerFightStatus === 'COMPLETED' || f.trackerFightStatus === 'CANCELLED'
    );
    if (allComplete) {
      await prisma.event.update({
        where: { id: tracker.eventId },
        data: { eventStatus: 'COMPLETED', completionMethod: 'tapology-tracker-auto' },
      });
      console.log('[TAPOLOGY] Event auto-completed');
      stopTracker(tracker.eventId);
    }
  }
}

/**
 * Run one scrape iteration for any tracker type.
 * Skips if previous scrape is still running (overlap guard).
 */
async function scrapeOnce(tracker: ActiveTracker): Promise<void> {
  if (tracker.isRunning) {
    console.log(`[${tracker.scraperType.toUpperCase()}] Skipping — previous scrape still running`);
    return;
  }

  tracker.isRunning = true;
  const start = Date.now();

  try {
    switch (tracker.scraperType) {
      case 'ufc': await scrapeUFCOnce(tracker); break;
      case 'bkfc': await scrapeBKFCOnce(tracker); break;
      case 'onefc': await scrapeOneFCOnce(tracker); break;
      case 'oktagon': await scrapeOktagonOnce(tracker); break;
      case 'tapology': await scrapeTapologyOnce(tracker); break;
      default:
        console.warn(`[SCRAPER] Unknown scraper type: ${tracker.scraperType}`);
        return;
    }

    tracker.lastScrapeAt = new Date();
    tracker.scrapeCount++;
    tracker.consecutiveErrors = 0;
    tracker.lastError = null;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${tracker.scraperType.toUpperCase()}] Scrape #${tracker.scrapeCount} done in ${elapsed}s`);

  } catch (err: any) {
    tracker.consecutiveErrors++;
    tracker.lastError = err.message;
    console.error(`[${tracker.scraperType.toUpperCase()}] Scrape error (${tracker.consecutiveErrors} consecutive):`, err.message);

    // Stop tracker after 10 consecutive errors
    if (tracker.consecutiveErrors >= 10) {
      console.error(`[${tracker.scraperType.toUpperCase()}] Too many errors, stopping tracker for ${tracker.eventName}`);
      stopTracker(tracker.eventId);
    }
  } finally {
    tracker.isRunning = false;
  }
}

// ============== TRACKER LIFECYCLE ==============

function startTracker(eventId: string, eventName: string, scraperType: string, url: string): boolean {
  if (activeTrackers.has(eventId)) {
    console.log(`[SCRAPER] Tracker already active for ${eventName}`);
    return false;
  }

  console.log(`[SCRAPER] Starting ${scraperType} tracker for ${eventName} (every ${SCRAPE_INTERVAL_MS / 1000}s)`);

  const tracker: ActiveTracker = {
    eventId,
    eventName,
    scraperType,
    url,
    interval: null as any, // set below
    isRunning: false,
    lastScrapeAt: null,
    lastError: null,
    scrapeCount: 0,
    consecutiveErrors: 0,
    startedAt: new Date(),
  };

  // Run first scrape immediately, then every 30 seconds
  scrapeOnce(tracker);
  tracker.interval = setInterval(() => scrapeOnce(tracker), SCRAPE_INTERVAL_MS);

  activeTrackers.set(eventId, tracker);
  return true;
}

function stopTracker(eventId: string): boolean {
  const tracker = activeTrackers.get(eventId);
  if (!tracker) return false;

  clearInterval(tracker.interval);
  activeTrackers.delete(eventId);
  console.log(`[SCRAPER] Stopped ${tracker.scraperType} tracker for ${tracker.eventName} (${tracker.scrapeCount} scrapes)`);
  return true;
}

// ============== AUTO-DISCOVERY ==============

/**
 * Tapology URL discovery — same logic as runTapologyLiveTracker.ts
 */
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
    slugFilter: ['top-rank'],
  },
  'Golden Boy': {
    url: 'https://www.tapology.com/fightcenter/promotions/1979-golden-boy-promotions-gbp',
    slugFilter: ['golden-boy'],
  },
  'Gold Star': {
    url: 'https://www.tapology.com/fightcenter/promotions/6908-gold-star-promotions-gsp',
    // Gold Star events use fighter-vs-fighter slugs with no org marker.
    // Scope to #content to exclude sidebar events from other promotions.
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
  'Gamebred': {
    url: 'https://www.tapology.com/fightcenter/promotions/3931-gamebred-fighting-championship-gbfc',
    slugFilter: ['gamebred', 'gbfc'],
  },
};

async function discoverTapologyUrl(event: any): Promise<string | null> {
  // 1. Already a Tapology URL
  if (event.ufcUrl && event.ufcUrl.includes('tapology.com')) {
    return event.ufcUrl;
  }

  // 2. Auto-discover from promotion hub
  const promotion = event.promotion || 'Zuffa Boxing';
  const hubConfig = TAPOLOGY_PROMOTION_HUBS[promotion];
  if (!hubConfig) {
    console.log(`[DISCOVERY] No Tapology hub for promotion: ${promotion}`);
    return null;
  }

  try {
    const response = await fetch(hubConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) return null;

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

      const fullUrl = href.startsWith('http') ? href : `https://www.tapology.com${href}`;
      eventLinks.push({ name, url: fullUrl });
    });

    if (eventLinks.length === 0) return null;

    // Match by name
    const eventNameLower = event.name.toLowerCase();
    for (const link of eventLinks) {
      const linkNameLower = link.name.toLowerCase();
      if (eventNameLower.includes(linkNameLower) || linkNameLower.includes(eventNameLower)) {
        await prisma.event.update({ where: { id: event.id }, data: { ufcUrl: link.url } });
        return link.url;
      }
    }

    // Match by URL keywords
    const eventWords = event.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2);
    for (const link of eventLinks) {
      const urlLower = link.url.toLowerCase();
      const matchCount = eventWords.filter((w: string) => urlLower.includes(w)).length;
      if (matchCount >= 2) {
        await prisma.event.update({ where: { id: event.id }, data: { ufcUrl: link.url } });
        return link.url;
      }
    }

    // Single result fallback
    if (eventLinks.length === 1) {
      await prisma.event.update({ where: { id: event.id }, data: { ufcUrl: eventLinks[0].url } });
      return eventLinks[0].url;
    }

    return null;
  } catch (err: any) {
    console.error(`[DISCOVERY] Error: ${err.message}`);
    return null;
  }
}

/**
 * Auto-discover active events from the database and start/stop trackers.
 * Called via POST /track/check or on startup.
 */
async function autoDiscoverEvents(): Promise<{ started: string[]; stopped: string[] }> {
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - TWELVE_HOURS_MS);
  const sixHoursFromNow = new Date(now.getTime() + SIX_HOURS_MS);

  const liveEvents = await prisma.event.findMany({
    where: {
      eventStatus: 'LIVE',
      scraperType: { in: ['ufc', 'oktagon', 'tapology', 'bkfc', 'onefc'] },
    },
    select: {
      id: true,
      name: true,
      scraperType: true,
      ufcUrl: true,
      promotion: true,
    },
  });

  const started: string[] = [];
  const stopped: string[] = [];

  // Start trackers for LIVE events that aren't being tracked yet
  for (const event of liveEvents) {
    if (activeTrackers.has(event.id)) continue;

    let url = event.ufcUrl;

    // For Tapology events, may need to discover URL
    if (event.scraperType === 'tapology' && (!url || !url.includes('tapology.com'))) {
      url = await discoverTapologyUrl(event);
    }

    if (!url) {
      console.log(`[DISCOVERY] No URL for ${event.name}, skipping`);
      continue;
    }

    startTracker(event.id, event.name, event.scraperType!, url);
    started.push(event.name);
  }

  // Stop trackers for events that are no longer LIVE
  const liveEventIds = new Set(liveEvents.map(e => e.id));
  for (const [eventId, tracker] of activeTrackers) {
    if (!liveEventIds.has(eventId)) {
      stopTracker(eventId);
      stopped.push(tracker.eventName);
    }
  }

  return { started, stopped };
}

// ============== HTTP SERVER ==============

function authenticate(req: http.IncomingMessage): boolean {
  if (!API_KEY) {
    console.warn('[AUTH] No SCRAPER_API_KEY set — accepting all requests (dev mode)');
    return true;
  }

  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${API_KEY}`) return true;

  // Also check query param for simple curl testing
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.searchParams.get('key') === API_KEY) return true;

  return false;
}

function sendJSON(res: http.ServerResponse, status: number, data: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';

  // Health check (no auth)
  if (url.pathname === '/health') {
    return sendJSON(res, 200, { ok: true, trackers: activeTrackers.size, uptime: process.uptime() });
  }

  // Auth check for all other endpoints
  if (!authenticate(req)) {
    return sendJSON(res, 401, { error: 'Unauthorized' });
  }

  try {
    // GET /status — list all active trackers
    if (method === 'GET' && url.pathname === '/status') {
      const trackers = Array.from(activeTrackers.values()).map(t => ({
        eventId: t.eventId,
        eventName: t.eventName,
        scraperType: t.scraperType,
        url: t.url,
        scrapeCount: t.scrapeCount,
        lastScrapeAt: t.lastScrapeAt?.toISOString() || null,
        lastError: t.lastError,
        consecutiveErrors: t.consecutiveErrors,
        isRunning: t.isRunning,
        startedAt: t.startedAt.toISOString(),
      }));

      return sendJSON(res, 200, { activeTrackers: trackers });
    }

    // POST /track/start — start tracking an event
    if (method === 'POST' && url.pathname === '/track/start') {
      const body = await readBody(req);
      const { eventId, scraperType, url: eventUrl, eventName } = body;

      if (!eventId || !scraperType) {
        return sendJSON(res, 400, { error: 'Missing eventId or scraperType' });
      }

      // If no URL provided, look it up from DB
      let resolvedUrl = eventUrl;
      if (!resolvedUrl) {
        const event = await prisma.event.findUnique({
          where: { id: eventId },
          select: { ufcUrl: true, name: true, promotion: true },
        });
        if (!event) return sendJSON(res, 404, { error: 'Event not found' });

        resolvedUrl = event.ufcUrl;

        // Tapology URL discovery
        if (scraperType === 'tapology' && (!resolvedUrl || !resolvedUrl.includes('tapology.com'))) {
          resolvedUrl = await discoverTapologyUrl({ ...event, id: eventId });
        }
      }

      if (!resolvedUrl) {
        return sendJSON(res, 400, { error: 'No URL available for event' });
      }

      const name = eventName || `Event ${eventId.substring(0, 8)}`;
      const didStart = startTracker(eventId, name, scraperType, resolvedUrl);

      return sendJSON(res, 200, { started: didStart, eventId, scraperType });
    }

    // POST /track/stop — stop tracking an event
    if (method === 'POST' && url.pathname === '/track/stop') {
      const body = await readBody(req);
      const { eventId } = body;

      if (!eventId) return sendJSON(res, 400, { error: 'Missing eventId' });

      const didStop = stopTracker(eventId);
      return sendJSON(res, 200, { stopped: didStop, eventId });
    }

    // POST /track/check — auto-discover and sync active events from DB
    if (method === 'POST' && url.pathname === '/track/check') {
      const result = await autoDiscoverEvents();
      return sendJSON(res, 200, result);
    }

    // POST /track/stop-all — stop all active trackers
    if (method === 'POST' && url.pathname === '/track/stop-all') {
      const stopped: string[] = [];
      for (const [eventId, tracker] of activeTrackers) {
        stopTracker(eventId);
        stopped.push(tracker.eventName);
      }
      return sendJSON(res, 200, { stopped });
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err: any) {
    console.error('[HTTP] Error:', err.message);
    sendJSON(res, 500, { error: err.message });
  }
});

// ============== STARTUP ==============

// Auto-check for active events every 5 minutes (in case Render didn't notify us)
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000;

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  VPS Scraper Service`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Scrape interval: ${SCRAPE_INTERVAL_MS / 1000}s`);
  console.log(`  Auth: ${API_KEY ? 'enabled' : 'DISABLED (dev mode)'}`);
  console.log(`========================================\n`);

  // Auto-discover on startup
  setTimeout(async () => {
    console.log('[STARTUP] Checking for active events...');
    try {
      const result = await autoDiscoverEvents();
      if (result.started.length > 0) {
        console.log(`[STARTUP] Auto-started trackers for: ${result.started.join(', ')}`);
      } else {
        console.log('[STARTUP] No active events found');
      }
    } catch (err: any) {
      console.error('[STARTUP] Auto-discovery failed:', err.message);
    }
  }, 2000);

  // Periodic auto-check
  setInterval(async () => {
    try {
      await autoDiscoverEvents();
    } catch (err: any) {
      console.error('[AUTO-CHECK] Error:', err.message);
    }
  }, AUTO_CHECK_INTERVAL_MS);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Stopping all trackers...');
  for (const [eventId] of activeTrackers) {
    stopTracker(eventId);
  }
  prisma.$disconnect();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Stopping all trackers...');
  for (const [eventId] of activeTrackers) {
    stopTracker(eventId);
  }
  prisma.$disconnect();
  server.close();
  process.exit(0);
});
