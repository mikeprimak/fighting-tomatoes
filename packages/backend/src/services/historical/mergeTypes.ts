/**
 * Type definitions for historical fight data merge
 */

// Scraped data types (from Wikipedia JSON files)
export interface ScrapedFight {
  cardType: string | null;
  weightClass: string | null;
  winner: string;
  loser: string;
  method: string;
  round: number | null;
  time: string | null;
  notes: string | null;
}

export interface ScrapedEvent {
  eventName: string;
  eventDate: string;
  venue: string | null;
  location: string | null;
  fights: ScrapedFight[];
}

export interface ScrapedData {
  scrapeDate: string;
  promotion: string;
  totalEvents: number;
  totalFights: number;
  events: ScrapedEvent[];
}

// Match result types
export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface FightMatchResult {
  scrapedFight: ScrapedFight;
  dbFightId: string | null;
  dbFighter1Name: string;
  dbFighter2Name: string;
  winnerId: string | null;  // fighter1Id, fighter2Id, "draw", or "nc"
  confidence: MatchConfidence;
  reason: string;
}

export interface EventMatchResult {
  scrapedEvent: ScrapedEvent;
  dbEventId: string | null;
  dbEventName: string | null;
  confidence: MatchConfidence;
  reason: string;
  fightMatches: FightMatchResult[];
}

// Merge statistics
export interface MergeStats {
  eventsProcessed: number;
  eventsMatched: number;
  eventsUnmatched: number;
  fightsProcessed: number;
  fightsUpdated: number;
  fightsSkippedAlreadyHasOutcome: number;
  fightsSkippedLowConfidence: number;
  fightsSkippedNoMatch: number;
  fightsSkippedError: number;
}

// Merge report output
export interface MergeReport {
  timestamp: string;
  promotion: string;
  dryRun: boolean;
  stats: MergeStats;
  unmatchedEvents: Array<{
    eventName: string;
    eventDate: string;
    reason: string;
  }>;
  unmatchedFights: Array<{
    eventName: string;
    winner: string;
    loser: string;
    reason: string;
  }>;
  lowConfidenceFights: Array<{
    eventName: string;
    scrapedWinner: string;
    scrapedLoser: string;
    dbFighter1: string;
    dbFighter2: string;
    confidence: MatchConfidence;
    reason: string;
  }>;
  errors: Array<{
    context: string;
    error: string;
  }>;
}

// CLI options
export interface MergeOptions {
  dryRun: boolean;
  promotion?: string;
  verbose: boolean;
  minConfidence: MatchConfidence;
}
