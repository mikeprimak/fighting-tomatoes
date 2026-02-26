/**
 * Hype Seeding System
 *
 * Seeds upcoming fights with realistic hype predictions that ramp up
 * gradually over 14 days. Uses betting odds (UFC) or tier defaults.
 *
 * Usage:
 *   npx tsx src/scripts/seedHype.ts [--dry-run]
 *   npx tsx src/scripts/seedHype.ts --cleanup --all [--delete-users]
 *   npx tsx src/scripts/seedHype.ts --cleanup --fight "LastName vs LastName"
 *
 * Env vars:
 *   DATABASE_URL   - PostgreSQL connection string (required)
 *   ODDS_API_KEY   - The Odds API key (optional, for UFC odds)
 */

import { PrismaClient, PredictionMethod } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ============================================================
// Constants
// ============================================================

const SEED_USER_COUNT = 25;
const SEED_EMAIL_PREFIX = 'seed-user-';
const SEED_EMAIL_DOMAIN = 'goodfights.app';
const SEEDING_WINDOW_DAYS = 14;
const MAX_FIGHT_LOOKAHEAD_DAYS = 21;
const HYPE_STDDEV = 1.2;

const DISPLAY_NAMES = [
  'MMANerd42',       'CageSideView',    'KnockoutKid',
  'OctagonOracle',   'TapSnapNap',      'SubmissionSeeker',
  'RoundByRound',    'FightNightFan',   'ClinchKing',
  'HeavyHands',      'SouthpawSam',     'TheJudge',
  'KOArtist',        'GrappleGhost',    'CageCritic',
  'UppercutUnited',  'TitleChaser',     'FlowState',
  'PressurePlayer',  'PointFighter',    'WarriorWatch',
  'TechKnockout',    'DecisionMaker',   'FinishRate',
  'FightIQ',
];

// ============================================================
// Tier Configuration
// ============================================================

interface TierConfig {
  name: string;
  countRange: [number, number];
  hypeRange: [number, number];
  methodWeights: Record<string, number>;
  skipChance: number;
}

const TIERS: Record<string, TierConfig> = {
  UFC_MAIN_EVENT: {
    name: 'UFC Main Event',
    countRange: [15, 20],
    hypeRange: [8.5, 9.5],
    methodWeights: { KO_TKO: 0.40, DECISION: 0.35, SUBMISSION: 0.25 },
    skipChance: 0,
  },
  UFC_CO_MAIN: {
    name: 'UFC Co-Main',
    countRange: [10, 15],
    hypeRange: [7.0, 8.5],
    methodWeights: { KO_TKO: 0.40, DECISION: 0.35, SUBMISSION: 0.25 },
    skipChance: 0,
  },
  UFC_MAIN_CARD: {
    name: 'UFC Main Card',
    countRange: [6, 10],
    hypeRange: [5.5, 7.0],
    methodWeights: { KO_TKO: 0.30, DECISION: 0.45, SUBMISSION: 0.25 },
    skipChance: 0,
  },
  UFC_PRELIM: {
    name: 'UFC Prelim',
    countRange: [3, 6],
    hypeRange: [3.5, 5.5],
    methodWeights: { KO_TKO: 0.25, DECISION: 0.55, SUBMISSION: 0.20 },
    skipChance: 0,
  },
  ONE_PFL: {
    name: 'ONE FC / PFL',
    countRange: [4, 8],
    hypeRange: [5.0, 7.0],
    methodWeights: { KO_TKO: 0.35, DECISION: 0.35, SUBMISSION: 0.30 },
    skipChance: 0.30,
  },
  BOXING: {
    name: 'Boxing',
    countRange: [2, 5],
    hypeRange: [4.0, 6.5],
    methodWeights: { KO_TKO: 0.45, DECISION: 0.50, SUBMISSION: 0.05 },
    skipChance: 0.30,
  },
  BKFC: {
    name: 'BKFC',
    countRange: [2, 5],
    hypeRange: [4.0, 6.5],
    methodWeights: { KO_TKO: 0.60, DECISION: 0.35, SUBMISSION: 0.05 },
    skipChance: 0.30,
  },
  DEFAULT: {
    name: 'Default',
    countRange: [2, 5],
    hypeRange: [4.0, 6.5],
    methodWeights: { KO_TKO: 0.33, DECISION: 0.34, SUBMISSION: 0.33 },
    skipChance: 0.30,
  },
};

const BOXING_PROMOTIONS = [
  'matchroom boxing', 'golden boy', 'top rank', 'top_rank',
  'zuffa boxing', 'dirty boxing',
];

// ============================================================
// Override Types
// ============================================================

interface OverrideMatch {
  fighter1?: string;
  fighter2?: string;
  fightId?: string;
}

interface Override {
  match: OverrideMatch;
  targetCount?: number;
  targetAvgHype?: number;
  forceWinner?: 'fighter1' | 'fighter2';
  methodWeights?: Record<string, number>;
}

interface OverridesFile {
  _comment?: string;
  overrides: Override[];
}

// ============================================================
// Odds API Types
// ============================================================

interface OddsOutcome {
  name: string;
  price: number;
}

interface OddsBookmaker {
  key: string;
  markets: Array<{
    key: string;
    outcomes: OddsOutcome[];
  }>;
}

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

interface FightOdds {
  fighter1Name: string;
  fighter2Name: string;
  fighter1Prob: number;
  fighter2Prob: number;
  hypeBoost: number;
}

// ============================================================
// Seeded PRNG (mulberry32)
// ============================================================

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(fightId: string): () => number {
  return mulberry32(hashString(fightId));
}

// ============================================================
// Gaussian random (Box-Muller)
// ============================================================

function gaussianRandom(rng: () => number, mean: number, stddev: number): number {
  const u1 = rng() || 0.001;
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

// ============================================================
// Odds API
// ============================================================

function moneylineToProb(odds: number): number {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

async function fetchOdds(apiKey: string): Promise<Map<string, FightOdds>> {
  const oddsMap = new Map<string, FightOdds>();

  try {
    const url = `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=h2h`;
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`  Warning: Odds API returned ${response.status}, using tier defaults`);
      return oddsMap;
    }

    const events: OddsEvent[] = await response.json() as OddsEvent[];
    console.log(`  Fetched odds for ${events.length} fights from The Odds API`);

    for (const event of events) {
      let fighter1Total = 0;
      let fighter2Total = 0;
      let count = 0;

      for (const bookmaker of event.bookmakers) {
        const h2h = bookmaker.markets.find(m => m.key === 'h2h');
        if (!h2h || h2h.outcomes.length < 2) continue;

        fighter1Total += moneylineToProb(h2h.outcomes[0].price);
        fighter2Total += moneylineToProb(h2h.outcomes[1].price);
        count++;
      }

      if (count === 0) continue;

      const f1Raw = fighter1Total / count;
      const f2Raw = fighter2Total / count;
      const total = f1Raw + f2Raw;
      const f1Norm = f1Raw / total;
      const f2Norm = f2Raw / total;

      const spread = Math.abs(f1Norm - f2Norm);
      let hypeBoost = 0;
      if (spread < 0.15) hypeBoost = 1.5;
      else if (spread < 0.30) hypeBoost = 0.5;

      // Key by sorted last names for order-independent matching
      const lastName1 = extractLastName(event.home_team);
      const lastName2 = extractLastName(event.away_team);
      const key = [lastName1, lastName2].sort().join('|');

      oddsMap.set(key, {
        fighter1Name: event.home_team,
        fighter2Name: event.away_team,
        fighter1Prob: f1Norm,
        fighter2Prob: f2Norm,
        hypeBoost,
      });
    }

    console.log(`  Parsed odds for ${oddsMap.size} unique matchups`);
  } catch (err) {
    console.log(`  Warning: Odds API error: ${(err as Error).message}, using tier defaults`);
  }

  return oddsMap;
}

function matchOdds(
  oddsMap: Map<string, FightOdds>,
  fighter1LastName: string,
  fighter2LastName: string,
): FightOdds | null {
  const key = [fighter1LastName.toLowerCase(), fighter2LastName.toLowerCase()].sort().join('|');
  return oddsMap.get(key) || null;
}

// ============================================================
// Tier Resolution
// ============================================================

function resolveTier(promotion: string, cardType: string | null, orderOnCard: number): TierConfig {
  const promo = promotion.toLowerCase();

  if (promo === 'ufc') {
    if (orderOnCard === 1) return TIERS.UFC_MAIN_EVENT;
    if (orderOnCard === 2) return TIERS.UFC_CO_MAIN;
    if (cardType && cardType.toLowerCase().includes('main')) return TIERS.UFC_MAIN_CARD;
    return TIERS.UFC_PRELIM;
  }

  if (promo === 'one' || promo === 'pfl') return TIERS.ONE_PFL;
  if (promo === 'bkfc') return TIERS.BKFC;
  if (BOXING_PROMOTIONS.includes(promo)) return TIERS.BOXING;

  return TIERS.DEFAULT;
}

// ============================================================
// Override Matching
// ============================================================

function loadOverrides(): Override[] {
  // Try multiple paths (works from both src/ and dist/)
  const candidates = [
    path.resolve(__dirname, '../../scripts/hype-overrides.json'),
    path.resolve(__dirname, '../../../scripts/hype-overrides.json'),
    path.resolve(process.cwd(), 'scripts/hype-overrides.json'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const data: OverridesFile = JSON.parse(raw);
        return data.overrides || [];
      } catch (err) {
        console.log(`  Warning: Failed to parse overrides at ${p}: ${(err as Error).message}`);
        return [];
      }
    }
  }

  console.log('  No hype-overrides.json found, proceeding without overrides');
  return [];
}

function findOverride(
  overrides: Override[],
  fightId: string,
  fighter1LastName: string,
  fighter2LastName: string,
): Override | null {
  for (const ov of overrides) {
    // Match by fight UUID
    if (ov.match.fightId && ov.match.fightId === fightId) return ov;

    // Match by fighter last names (order-independent, case-insensitive)
    if (ov.match.fighter1 && ov.match.fighter2) {
      const m1 = ov.match.fighter1.toLowerCase();
      const m2 = ov.match.fighter2.toLowerCase();
      const f1 = fighter1LastName.toLowerCase();
      const f2 = fighter2LastName.toLowerCase();

      if ((f1 === m1 && f2 === m2) || (f1 === m2 && f2 === m1)) {
        return ov;
      }
    }
  }
  return null;
}

// ============================================================
// Prediction Generation
// ============================================================

function pickMethod(
  rng: () => number,
  weights: Record<string, number>,
): PredictionMethod {
  const r = rng();
  const ko = weights.KO_TKO ?? 0.33;
  const dec = weights.DECISION ?? 0.34;

  if (r < ko) return PredictionMethod.KO_TKO;
  if (r < ko + dec) return PredictionMethod.DECISION;
  return PredictionMethod.SUBMISSION;
}

function pickWinner(
  rng: () => number,
  fighter1Id: string,
  fighter2Id: string,
  fighter1Prob: number,
): string {
  return rng() < fighter1Prob ? fighter1Id : fighter2Id;
}

// ============================================================
// Gradual Ramp
// ============================================================

function calculateTargetToday(targetCount: number, daysUntilFight: number): number {
  if (daysUntilFight > SEEDING_WINDOW_DAYS) return 0;
  if (daysUntilFight <= 0) return targetCount;

  const dayIndex = SEEDING_WINDOW_DAYS - daysUntilFight;
  const fraction = Math.pow(dayIndex / (SEEDING_WINDOW_DAYS - 1), 1.5);
  return Math.round(targetCount * fraction);
}

// ============================================================
// Seed User Management
// ============================================================

interface SeedUser {
  id: string;
  email: string;
}

async function ensureSeedUsers(isDryRun: boolean): Promise<SeedUser[]> {
  const users: SeedUser[] = [];

  for (let i = 1; i <= SEED_USER_COUNT; i++) {
    const num = String(i).padStart(2, '0');
    const email = `${SEED_EMAIL_PREFIX}${num}@${SEED_EMAIL_DOMAIN}`;
    const displayName = DISPLAY_NAMES[i - 1] || `FightFan${i}`;

    if (isDryRun) {
      // Check if user already exists
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });
      if (existing) {
        users.push(existing);
      } else {
        users.push({ id: `dry-run-${num}`, email });
      }
      continue;
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName,
        isEmailVerified: true,
        isActive: true,
        wantsEmails: false,
        notificationsEnabled: false,
      },
      select: { id: true, email: true },
    });
    users.push(user);
  }

  return users;
}

// ============================================================
// Cleanup
// ============================================================

async function runCleanup(
  isDryRun: boolean,
  cleanAll: boolean,
  deleteUsers: boolean,
  fightArg: string | null,
): Promise<void> {
  // Get all seed user IDs
  const seedUsers = await prisma.user.findMany({
    where: { email: { startsWith: SEED_EMAIL_PREFIX, endsWith: `@${SEED_EMAIL_DOMAIN}` } },
    select: { id: true, email: true },
  });

  if (seedUsers.length === 0) {
    console.log('No seed users found. Nothing to clean up.');
    return;
  }

  const seedUserIds = seedUsers.map(u => u.id);
  console.log(`Found ${seedUsers.length} seed user accounts`);

  if (cleanAll) {
    // Delete all seed predictions
    if (isDryRun) {
      const count = await prisma.fightPrediction.count({
        where: { userId: { in: seedUserIds } },
      });
      console.log(`[DRY RUN] Would delete ${count} seed predictions from all fights`);
    } else {
      const result = await prisma.fightPrediction.deleteMany({
        where: { userId: { in: seedUserIds } },
      });
      console.log(`Deleted ${result.count} seed predictions from all fights`);
    }

    if (deleteUsers) {
      if (isDryRun) {
        console.log(`[DRY RUN] Would delete ${seedUsers.length} seed user accounts`);
      } else {
        const result = await prisma.user.deleteMany({
          where: { id: { in: seedUserIds } },
        });
        console.log(`Deleted ${result.count} seed user accounts`);
      }
    }
  } else if (fightArg) {
    // Parse "LastName vs LastName" format
    const parts = fightArg.split(/\s+vs\.?\s+/i);
    if (parts.length !== 2) {
      console.error('Invalid --fight format. Use: "LastName vs LastName"');
      process.exit(1);
    }

    const name1 = parts[0].trim().toLowerCase();
    const name2 = parts[1].trim().toLowerCase();

    // Find fights matching these fighter last names
    const fights = await prisma.fight.findMany({
      where: {
        OR: [
          {
            fighter1: { lastName: { equals: name1, mode: 'insensitive' } },
            fighter2: { lastName: { equals: name2, mode: 'insensitive' } },
          },
          {
            fighter1: { lastName: { equals: name2, mode: 'insensitive' } },
            fighter2: { lastName: { equals: name1, mode: 'insensitive' } },
          },
        ],
      },
      include: {
        fighter1: { select: { lastName: true } },
        fighter2: { select: { lastName: true } },
      },
    });

    if (fights.length === 0) {
      console.log(`No fights found matching "${fightArg}"`);
      return;
    }

    const fightIds = fights.map(f => f.id);
    console.log(`Found ${fights.length} fight(s) matching "${fightArg}"`);

    if (isDryRun) {
      const count = await prisma.fightPrediction.count({
        where: { userId: { in: seedUserIds }, fightId: { in: fightIds } },
      });
      console.log(`[DRY RUN] Would delete ${count} seed predictions`);
    } else {
      const result = await prisma.fightPrediction.deleteMany({
        where: { userId: { in: seedUserIds }, fightId: { in: fightIds } },
      });
      console.log(`Deleted ${result.count} seed predictions`);
    }
  } else {
    console.error('Cleanup mode requires --all or --fight "LastName vs LastName"');
    process.exit(1);
  }
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isCleanup = args.includes('--cleanup');
  const isCleanupAll = args.includes('--all');
  const isDeleteUsers = args.includes('--delete-users');
  const fightArgIdx = args.indexOf('--fight');
  const fightArg = fightArgIdx >= 0 ? args[fightArgIdx + 1] : null;

  console.log('=== Hype Seeding System ===');
  if (isDryRun) console.log('  Mode: DRY RUN (no DB writes)');
  if (isCleanup) console.log('  Mode: CLEANUP');

  try {
    // ---- Cleanup mode ----
    if (isCleanup) {
      await runCleanup(isDryRun, isCleanupAll, isDeleteUsers, fightArg);
      return;
    }

    // ---- Normal seeding mode ----

    // Step 1: Ensure seed users exist
    const seedUsers = await ensureSeedUsers(isDryRun);
    console.log(`\nSeed users: ${seedUsers.length} ready`);

    // Step 2: Load overrides
    const overrides = loadOverrides();
    console.log(`Overrides: ${overrides.length} loaded`);

    // Step 3: Fetch odds (optional)
    const oddsApiKey = process.env.ODDS_API_KEY;
    let oddsMap = new Map<string, FightOdds>();
    if (oddsApiKey) {
      console.log('\nFetching UFC odds from The Odds API...');
      oddsMap = await fetchOdds(oddsApiKey);
    } else {
      console.log('\nNo ODDS_API_KEY set, using tier defaults for all fights');
    }

    // Step 4: Query upcoming fights within 21 days
    const now = new Date();
    const cutoff = new Date(now.getTime() + MAX_FIGHT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const fights = await prisma.fight.findMany({
      where: {
        fightStatus: 'UPCOMING',
        event: {
          isVisible: true,
          eventStatus: 'UPCOMING',
          date: { gte: now, lte: cutoff },
        },
      },
      include: {
        event: { select: { id: true, name: true, promotion: true, date: true } },
        fighter1: { select: { id: true, firstName: true, lastName: true } },
        fighter2: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [
        { event: { date: 'asc' } },
        { orderOnCard: 'asc' },
      ],
    });

    console.log(`\nFound ${fights.length} upcoming fights within ${MAX_FIGHT_LOOKAHEAD_DAYS} days\n`);

    if (fights.length === 0) {
      console.log('Nothing to seed. Exiting.');
      return;
    }

    // Step 5: Batch-query existing seed predictions
    const seedUserIds = seedUsers.map(u => u.id);
    const fightIds = fights.map(f => f.id);

    const existingPredictions = await prisma.fightPrediction.findMany({
      where: {
        userId: { in: seedUserIds },
        fightId: { in: fightIds },
      },
      select: { fightId: true, userId: true },
    });

    // Count existing predictions per fight
    const existingByFight = new Map<string, Set<string>>();
    for (const pred of existingPredictions) {
      if (!existingByFight.has(pred.fightId)) {
        existingByFight.set(pred.fightId, new Set());
      }
      existingByFight.get(pred.fightId)!.add(pred.userId);
    }

    // Step 6-13: Process each fight
    let totalCreated = 0;
    let totalSkipped = 0;
    let currentEventName = '';

    const allPredictions: Array<{
      id: string;
      userId: string;
      fightId: string;
      predictedRating: number;
      predictedWinner: string;
      predictedMethod: PredictionMethod;
      confidence: number;
      hasRevealedHype: boolean;
      hasRevealedWinner: boolean;
      hasRevealedMethod: boolean;
      isLocked: boolean;
    }> = [];

    for (const fight of fights) {
      // Print event header
      if (fight.event.name !== currentEventName) {
        currentEventName = fight.event.name;
        const eventDate = fight.event.date.toISOString().split('T')[0];
        console.log(`\n--- ${fight.event.name} (${eventDate}) ---`);
      }

      const fightLabel = `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}`;

      // Resolve tier
      const tier = resolveTier(fight.event.promotion, fight.cardType, fight.orderOnCard);

      // Check override
      const override = findOverride(overrides, fight.id, fight.fighter1.lastName, fight.fighter2.lastName);

      // Check odds
      const odds = matchOdds(oddsMap, fight.fighter1.lastName, fight.fighter2.lastName);

      // Build deterministic RNG from fight UUID
      const rng = createRng(fight.id);

      // Deterministic skip chance (non-UFC promotions, never skip main/co-main)
      if (tier.skipChance > 0 && !override && fight.orderOnCard > 2) {
        if (rng() < tier.skipChance) {
          console.log(`  SKIP  ${fightLabel.padEnd(35)} (${tier.name}, ${Math.round(tier.skipChance * 100)}% skip)`);
          totalSkipped++;
          continue;
        }
      }

      // Determine targetCount (deterministic from fight UUID)
      let targetCount: number;
      if (override?.targetCount !== undefined) {
        targetCount = override.targetCount;
      } else {
        const [minCount, maxCount] = tier.countRange;
        targetCount = Math.round(minCount + rng() * (maxCount - minCount));
      }

      if (targetCount === 0) {
        console.log(`  SKIP  ${fightLabel.padEnd(35)} (override: targetCount=0)`);
        totalSkipped++;
        continue;
      }

      // Determine targetAvgHype (deterministic)
      let targetAvgHype: number;
      if (override?.targetAvgHype !== undefined) {
        targetAvgHype = override.targetAvgHype;
      } else {
        const [minHype, maxHype] = tier.hypeRange;
        targetAvgHype = minHype + rng() * (maxHype - minHype);
        // Apply odds hype boost
        if (odds) {
          targetAvgHype = Math.min(10, targetAvgHype + odds.hypeBoost);
        }
      }

      // Winner probability
      let fighter1WinProb = 0.5;
      if (override?.forceWinner === 'fighter1') {
        fighter1WinProb = 0.65;
      } else if (override?.forceWinner === 'fighter2') {
        fighter1WinProb = 0.35;
      } else if (odds) {
        // Map odds fighter names to DB fighter IDs
        const oddsF1Last = extractLastName(odds.fighter1Name);
        const dbF1Last = fight.fighter1.lastName.toLowerCase();
        if (oddsF1Last === dbF1Last) {
          fighter1WinProb = odds.fighter1Prob;
        } else {
          fighter1WinProb = odds.fighter2Prob;
        }
      }

      // Method weights
      const methodWeights = override?.methodWeights || tier.methodWeights;

      // Gradual ramp
      const daysUntil = Math.ceil(
        (fight.event.date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      const targetToday = calculateTargetToday(targetCount, daysUntil);

      // Existing count for this fight
      const existingUserIds = existingByFight.get(fight.id) || new Set<string>();
      const existingCount = existingUserIds.size;
      const newToCreate = Math.max(0, targetToday - existingCount);

      // Data source label
      const source = override ? 'override' : odds ? 'odds' : 'tier';

      console.log(
        `  ${fightLabel.padEnd(35)} ` +
        `tier=${tier.name.padEnd(16)} ` +
        `target=${String(targetCount).padStart(2)} ` +
        `today=${String(targetToday).padStart(2)} ` +
        `existing=${String(existingCount).padStart(2)} ` +
        `creating=${String(newToCreate).padStart(2)} ` +
        `[${source}]`,
      );

      if (newToCreate === 0) continue;

      // Pick seed users who haven't predicted this fight yet
      const availableUsers = seedUsers.filter(u => !existingUserIds.has(u.id));
      const usersToUse = availableUsers.slice(0, newToCreate);

      if (usersToUse.length === 0) continue;

      // Generate hype scores centered on targetAvgHype
      const hypeScores: number[] = [];
      for (let i = 0; i < usersToUse.length; i++) {
        let score = gaussianRandom(rng, targetAvgHype, HYPE_STDDEV);
        score = Math.round(Math.min(10, Math.max(1, score)));
        hypeScores.push(score);
      }

      // Adjust toward target average
      if (hypeScores.length > 1) {
        const currentAvg = hypeScores.reduce((a, b) => a + b, 0) / hypeScores.length;
        const diff = targetAvgHype - currentAvg;
        if (Math.abs(diff) > 0.3) {
          const adjust = Math.round(diff);
          for (let i = 0; i < hypeScores.length; i++) {
            hypeScores[i] = Math.min(10, Math.max(1, hypeScores[i] + adjust));
          }
        }
      }

      // Generate prediction records
      for (let i = 0; i < usersToUse.length; i++) {
        allPredictions.push({
          id: crypto.randomUUID(),
          userId: usersToUse[i].id,
          fightId: fight.id,
          predictedRating: hypeScores[i],
          predictedWinner: pickWinner(rng, fight.fighter1.id, fight.fighter2.id, fighter1WinProb),
          predictedMethod: pickMethod(rng, methodWeights),
          confidence: Math.round(Math.min(10, Math.max(1, gaussianRandom(rng, 6, 2)))),
          hasRevealedHype: true,
          hasRevealedWinner: true,
          hasRevealedMethod: true,
          isLocked: false,
        });
      }

      totalCreated += usersToUse.length;
    }

    // Batch insert
    if (!isDryRun && allPredictions.length > 0) {
      const result = await prisma.fightPrediction.createMany({
        data: allPredictions,
        skipDuplicates: true,
      });
      console.log(`\nInserted ${result.count} predictions`);
    } else if (isDryRun) {
      console.log(`\n[DRY RUN] Would insert ${allPredictions.length} predictions`);
    }

    console.log('\n=== Summary ===');
    console.log(`  Fights processed: ${fights.length}`);
    console.log(`  Fights skipped:   ${totalSkipped}`);
    console.log(`  Predictions:      ${isDryRun ? `${allPredictions.length} (dry run)` : totalCreated}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
