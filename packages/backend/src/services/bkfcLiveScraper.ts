/**
 * BKFC Live Event Scraper - Type definitions and re-export
 *
 * The actual scraping is done by scrapeBKFCLiveEvent.js (Puppeteer-based).
 * This file provides TypeScript types used by the parser and runner.
 */

// ============== TYPE DEFINITIONS ==============

export interface BKFCFightResult {
  winner?: string | null;   // Winner's last name
  method?: string | null;   // "KO", "TKO", "UD", etc.
  round?: number | null;
  time?: string | null;     // "1:34" format
}

export interface BKFCFightData {
  fightId: string;
  order: number;
  cardType: string;       // "Main Card" or "Prelims"
  weightClass: string;
  isTitle: boolean;
  fighter1Name: string;   // Full name "Mick Terrill"
  fighter2Name: string;
  fighter1Slug: string;
  fighter2Slug: string;
  fighter1UUID: string;
  fighter2UUID: string;
  status: 'upcoming' | 'live' | 'complete';
  hasStarted: boolean;
  isComplete: boolean;
  result?: BKFCFightResult | null;
}

export interface BKFCEventData {
  eventName: string;
  isLiveEvent: boolean;
  hasStarted: boolean;
  isComplete: boolean;
  status: 'upcoming' | 'live' | 'complete';
  fights: BKFCFightData[];
  scrapedAt: string;
}
