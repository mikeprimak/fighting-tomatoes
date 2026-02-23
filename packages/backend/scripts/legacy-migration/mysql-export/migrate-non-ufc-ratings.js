#!/usr/bin/env node
/**
 * ============================================================================
 * MIGRATE NON-UFC LEGACY RATINGS (PFL, ONE, BKFC)
 * ============================================================================
 *
 * Migrates ratings from the legacy FightingTomatoes.com MySQL database to
 * the new PostgreSQL database for non-UFC promotions only.
 *
 * The original migration focused on UFC; ~1,745 non-UFC fights were skipped.
 * This script fills that gap for PFL, ONE, and BKFC events before Feb 6, 2026.
 *
 * Reuses proven patterns from:
 *   - audit-and-fix.js  (fuzzy fight matching, normalizeName, fuzzyMatchFighter)
 *   - sync-all-ratings.js (per-user MySQL table iteration, batch createMany)
 *
 * SAFETY:
 *   - UFC exclusion at every stage
 *   - Date cutoff < 2026-02-06
 *   - Dry-run mode by default (no writes)
 *   - skipDuplicates in createMany
 *   - Only creates FightRating records (no fights/events/fighters)
 *
 * USAGE:
 *   node migrate-non-ufc-ratings.js                    # Dry run (default)
 *   node migrate-non-ufc-ratings.js --execute          # Actually write ratings
 *   node migrate-non-ufc-ratings.js --verbose          # Detailed logging
 *   node migrate-non-ufc-ratings.js --execute --verbose
 *
 * ============================================================================
 */

const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Legacy MySQL connection
const MYSQL_CONFIG = {
  host: '216.69.165.113',
  port: 3306,
  user: 'fotnadmin',
  password: 'HungryMonkey12',
};

// Target promotions (explicitly NOT UFC)
const TARGET_PROMOTIONS = ['PFL', 'ONE', 'BKFC'];
const DATE_CUTOFF = '2026-02-06';

// Parse command line args
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const DRY_RUN = !EXECUTE;
const VERBOSE = args.includes('--verbose');

// ============================================================================
// STRING UTILITIES (from audit-and-fix.js)
// ============================================================================

function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[ßẞ]/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatchFighter(firstName, lastName, fighterNameMap) {
  const fullNorm = normalizeName(firstName) + normalizeName(lastName);
  if (!fullNorm) return null;

  // Tier 1: Exact
  if (fighterNameMap.has(fullNorm)) {
    return { id: fighterNameMap.get(fullNorm), tier: 1 };
  }

  // Tier 2: Prefix
  const candidates = Array.from(fighterNameMap.keys());
  for (const candidate of candidates) {
    if (fullNorm.length >= 5 && candidate.startsWith(fullNorm)) {
      return { id: fighterNameMap.get(candidate), tier: 2 };
    }
    if (candidate.length >= 5 && fullNorm.startsWith(candidate)) {
      return { id: fighterNameMap.get(candidate), tier: 2 };
    }
  }

  // Tier 3: Levenshtein
  let bestMatch = null;
  let bestDist = 3;
  for (const candidate of candidates) {
    if (Math.abs(fullNorm.length - candidate.length) > 2) continue;
    const dist = levenshtein(fullNorm, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = candidate;
    }
  }
  if (bestMatch) {
    return { id: fighterNameMap.get(bestMatch), tier: 3 };
  }

  return null;
}

// ============================================================================
// PHASE 1: Load Legacy Fights from MySQL
// ============================================================================

async function loadLegacyFights(connection) {
  console.log('\n--- PHASE 1: Load Legacy Fights from MySQL ---');

  await connection.query('USE fightdb');

  const placeholders = TARGET_PROMOTIONS.map(() => '?').join(',');

  const [legacyFights] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date,
           (COALESCE(ratings_given_1,0) + COALESCE(ratings_given_2,0) + COALESCE(ratings_given_3,0) +
            COALESCE(ratings_given_4,0) + COALESCE(ratings_given_5,0) + COALESCE(ratings_given_6,0) +
            COALESCE(ratings_given_7,0) + COALESCE(ratings_given_8,0) + COALESCE(ratings_given_9,0) +
            COALESCE(ratings_given_10,0)) as ratingCount
    FROM fights
    WHERE deleted = 0
      AND promotion IN (${placeholders})
      AND date < ?
  `, [...TARGET_PROMOTIONS, DATE_CUTOFF]);

  // Also load legacy events for event matching
  const [legacyEvents] = await connection.query(`
    SELECT id, promotion, eventname, date
    FROM fightcards
    WHERE promotion IN (${placeholders})
      AND date < ?
    ORDER BY date DESC
  `, [...TARGET_PROMOTIONS, DATE_CUTOFF]);

  // Build legacy fight ID set for filtering user ratings later
  // Use String keys because userfightratings tables store fightid as strings
  const legacyFightIds = new Set(legacyFights.map(f => String(f.id)));

  // Per-promotion breakdown
  const byPromotion = {};
  for (const f of legacyFights) {
    const p = f.promotion;
    byPromotion[p] = (byPromotion[p] || 0) + 1;
  }

  console.log(`  Legacy fights loaded: ${legacyFights.length}`);
  console.log(`  Legacy events loaded: ${legacyEvents.length}`);
  for (const [p, count] of Object.entries(byPromotion)) {
    console.log(`    ${p}: ${count} fights`);
  }

  // UFC guard: verify none slipped through
  const ufcCount = legacyFights.filter(f => f.promotion === 'UFC').length;
  if (ufcCount > 0) {
    throw new Error(`SAFETY: Found ${ufcCount} UFC fights in legacy query! Aborting.`);
  }

  return { legacyFights, legacyEvents, legacyFightIds };
}

// ============================================================================
// PHASE 2: Load New DB Fights from PostgreSQL
// ============================================================================

async function loadNewDbFights() {
  console.log('\n--- PHASE 2: Load New DB Fights from PostgreSQL ---');

  const appFights = await prisma.fight.findMany({
    where: {
      event: {
        promotion: { in: TARGET_PROMOTIONS },
        date: { lt: new Date(DATE_CUTOFF) },
      },
    },
    select: {
      id: true,
      eventId: true,
      fighter1Id: true,
      fighter2Id: true,
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
      event: { select: { id: true, name: true, promotion: true, date: true } },
      totalRatings: true,
    },
  });

  const appEvents = await prisma.event.findMany({
    where: {
      promotion: { in: TARGET_PROMOTIONS },
      date: { lt: new Date(DATE_CUTOFF) },
    },
    select: { id: true, name: true, promotion: true, date: true },
  });

  const appFighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true },
  });

  // Per-promotion breakdown
  const byPromotion = {};
  for (const f of appFights) {
    const p = f.event.promotion;
    byPromotion[p] = (byPromotion[p] || 0) + 1;
  }

  console.log(`  App fights loaded: ${appFights.length}`);
  console.log(`  App events loaded: ${appEvents.length}`);
  console.log(`  App fighters loaded: ${appFighters.length}`);
  for (const [p, count] of Object.entries(byPromotion)) {
    console.log(`    ${p}: ${count} fights`);
  }

  // UFC guard
  const ufcCount = appFights.filter(f => f.event.promotion === 'UFC').length;
  if (ufcCount > 0) {
    throw new Error(`SAFETY: Found ${ufcCount} UFC fights in PostgreSQL query! Aborting.`);
  }

  return { appFights, appEvents, appFighters };
}

// ============================================================================
// PHASE 3: Build Fight Mapping (legacy ID -> new UUID)
// ============================================================================

function buildFightMapping(legacy, app) {
  console.log('\n--- PHASE 3: Build Fight Mapping ---');

  // --- Event mapping: normalized name|date -> app event ID ---
  const appEventMap = new Map();
  const appEventByPromDate = new Map();
  for (const e of app.appEvents) {
    const dateStr = e.date.toISOString().split('T')[0];
    appEventMap.set(`${normalizeName(e.name)}|${dateStr}`, e.id);
    appEventByPromDate.set(`${e.promotion}|${dateStr}`, e.id);
  }

  // Map legacy events to app events
  const eventMapping = new Map();
  for (const le of legacy.legacyEvents) {
    let eventName = (le.eventname || '').trim();
    const promotion = (le.promotion || '').trim();
    if (/^\d+$/.test(eventName)) {
      eventName = `${promotion} ${eventName}`;
    } else if (!eventName.toLowerCase().includes(promotion.toLowerCase())) {
      if (eventName.includes(':')) {
        eventName = `${promotion}: ${eventName.split(':').slice(1).join(':').trim()}`;
      } else if (/^Fight\s*Night/i.test(eventName)) {
        eventName = `${promotion} ${eventName}`;
      }
    }
    const dateStr = le.date ? new Date(le.date).toISOString().split('T')[0] : '';
    const key1 = `${normalizeName(eventName)}|${dateStr}`;
    const key2 = `${promotion}|${dateStr}`;

    const appEventId = appEventMap.get(key1) || appEventByPromDate.get(key2);
    if (appEventId) {
      eventMapping.set(le.id, appEventId);
    }
  }

  // --- Fighter name map: normalized full name -> app fighter ID ---
  const fighterNameMap = new Map();
  for (const f of app.appFighters) {
    const key = normalizeName(f.firstName) + normalizeName(f.lastName);
    fighterNameMap.set(key, f.id);
  }

  // --- Fight lookup: eventId|sorted fighter IDs -> app fight ---
  const appFightLookup = new Map();
  for (const f of app.appFights) {
    const sorted = [f.fighter1Id, f.fighter2Id].sort();
    const key = `${f.eventId}|${sorted[0]}|${sorted[1]}`;
    appFightLookup.set(key, f);
  }

  // --- Map legacy fights -> app fights ---
  const fightMapping = new Map(); // legacy fight ID -> app fight UUID
  const unmatchedFights = [];
  let fuzzyMatches = 0;

  for (const lf of legacy.legacyFights) {
    // SAFETY: Skip UFC (belt-and-suspenders)
    if ((lf.promotion || '').toUpperCase() === 'UFC') continue;

    // Find event
    let eventName = (lf.eventname || '').trim();
    const promotion = (lf.promotion || '').trim();
    if (/^\d+$/.test(eventName)) eventName = `${promotion} ${eventName}`;
    const dateStr = lf.date ? new Date(lf.date).toISOString().split('T')[0] : '';

    // Try multiple event lookup strategies
    let fightEventId = null;

    // Strategy 1: Find via legacy event mapping
    const legacyEventId = findLegacyEventId(lf, legacy.legacyEvents);
    if (legacyEventId) {
      fightEventId = eventMapping.get(legacyEventId);
    }

    // Strategy 2: Direct name+date lookup
    if (!fightEventId) {
      fightEventId = appEventMap.get(`${normalizeName(eventName)}|${dateStr}`);
    }

    // Strategy 3: Promotion+date lookup
    if (!fightEventId) {
      fightEventId = appEventByPromDate.get(`${promotion}|${dateStr}`);
    }

    if (!fightEventId) {
      unmatchedFights.push({ fight: lf, reason: 'event_not_found' });
      continue;
    }

    // Find fighters
    const f1Match = fuzzyMatchFighter(lf.f1fn, lf.f1ln, fighterNameMap);
    const f2Match = fuzzyMatchFighter(lf.f2fn, lf.f2ln, fighterNameMap);

    if (!f1Match || !f2Match) {
      unmatchedFights.push({ fight: lf, reason: 'fighter_not_found' });
      continue;
    }

    if (f1Match.tier > 1 || f2Match.tier > 1) fuzzyMatches++;

    // Look up the app fight
    const sorted = [f1Match.id, f2Match.id].sort();
    const fightKey = `${fightEventId}|${sorted[0]}|${sorted[1]}`;
    const appFight = appFightLookup.get(fightKey);

    if (appFight) {
      fightMapping.set(String(lf.id), appFight.id);
    } else {
      unmatchedFights.push({
        fight: lf,
        reason: 'fight_not_found_in_event',
        eventId: fightEventId,
      });
    }
  }

  // Per-promotion breakdown of matches
  const matchedByPromotion = {};
  const unmatchedByPromotion = {};
  for (const lf of legacy.legacyFights) {
    const p = lf.promotion;
    if (fightMapping.has(String(lf.id))) {
      matchedByPromotion[p] = (matchedByPromotion[p] || 0) + 1;
    }
  }
  for (const u of unmatchedFights) {
    const p = u.fight.promotion;
    unmatchedByPromotion[p] = (unmatchedByPromotion[p] || 0) + 1;
  }

  console.log(`  Fight mappings built: ${fightMapping.size} matched, ${unmatchedFights.length} unmatched (${fuzzyMatches} fuzzy)`);
  for (const p of TARGET_PROMOTIONS) {
    console.log(`    ${p}: ${matchedByPromotion[p] || 0} matched, ${unmatchedByPromotion[p] || 0} unmatched`);
  }

  // Log unmatched fights
  if (unmatchedFights.length > 0) {
    console.log(`\n  Unmatched fights (for manual review):`);
    const byReason = {};
    for (const u of unmatchedFights) {
      byReason[u.reason] = (byReason[u.reason] || 0) + 1;
    }
    for (const [reason, count] of Object.entries(byReason)) {
      console.log(`    ${reason}: ${count}`);
    }

    if (VERBOSE) {
      // Show fights with ratings that we're missing
      const withRatings = unmatchedFights
        .filter(u => Number(u.fight.ratingCount) > 0)
        .sort((a, b) => Number(b.fight.ratingCount) - Number(a.fight.ratingCount));

      if (withRatings.length > 0) {
        console.log(`\n  Unmatched fights WITH ratings (${withRatings.length}):`);
        for (const u of withRatings.slice(0, 30)) {
          const f = u.fight;
          console.log(`    [${f.promotion}] ${f.f1fn} ${f.f1ln} vs ${f.f2fn} ${f.f2ln} - ${f.eventname} (${new Date(f.date).toISOString().split('T')[0]}) - ${f.ratingCount} ratings - ${u.reason}`);
        }
        if (withRatings.length > 30) {
          console.log(`    ... and ${withRatings.length - 30} more`);
        }
      }
    }
  }

  return { fightMapping, unmatchedFights };
}

function findLegacyEventId(fight, legacyEvents) {
  const fightEventName = (fight.eventname || '').trim();
  const fightDate = fight.date ? new Date(fight.date).toISOString().split('T')[0] : '';
  const fightPromotion = (fight.promotion || '').trim();

  for (const le of legacyEvents) {
    const eventDate = le.date ? new Date(le.date).toISOString().split('T')[0] : '';
    const eventName = (le.eventname || '').trim();

    if (normalizeName(eventName) === normalizeName(fightEventName) && eventDate === fightDate) {
      return le.id;
    }
    if (le.promotion === fightPromotion && eventDate === fightDate) {
      return le.id;
    }
  }
  return null;
}

// ============================================================================
// PHASE 4: Build User Mapping (MD5 email hash -> userId)
// ============================================================================

async function buildUserMapping() {
  console.log('\n--- PHASE 4: Build User Mapping ---');

  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  const hashToUser = new Map(); // MD5(email) -> { id, email }
  for (const u of users) {
    const email = u.email.toLowerCase();
    const hash = crypto.createHash('md5').update(email).digest('hex');
    hashToUser.set(hash, { id: u.id, email });
  }

  console.log(`  Users loaded: ${users.length}`);
  console.log(`  Email hashes computed: ${hashToUser.size}`);

  return { hashToUser, users };
}

// ============================================================================
// PHASE 5: Load Existing Ratings (duplicate prevention)
// ============================================================================

async function loadExistingRatings(fightMapping) {
  console.log('\n--- PHASE 5: Load Existing Ratings ---');

  const newFightIds = Array.from(new Set(fightMapping.values()));

  // Load existing ratings only for our target fights
  const existingRatings = await prisma.fightRating.findMany({
    where: { fightId: { in: newFightIds } },
    select: { fightId: true, userId: true },
  });

  const existingKeys = new Set(existingRatings.map(r => `${r.fightId}:${r.userId}`));

  console.log(`  Target fights: ${newFightIds.length}`);
  console.log(`  Existing ratings on these fights: ${existingKeys.size}`);

  return existingKeys;
}

// ============================================================================
// PHASE 6: Query Legacy Ratings from Per-User MySQL Tables
// ============================================================================

async function queryLegacyRatings(connection, legacyFightIds, fightMapping, hashToUser, existingKeys) {
  console.log('\n--- PHASE 6: Query Legacy Ratings ---');

  const conn = await mysql.createConnection({ ...MYSQL_CONFIG, database: 'userfightratings' });
  const [tables] = await conn.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];

  console.log(`  User rating tables found: ${tables.length}`);

  const ratingsToCreate = [];
  let tablesProcessed = 0;
  let tablesMatched = 0;
  let ratingsSkippedNoMapping = 0;
  let ratingsSkippedExisting = 0;
  let ratingsSkippedInvalid = 0;
  const perUserStats = new Map(); // email -> count of new ratings

  for (const table of tables) {
    const tableName = table[tableKey];
    const userInfo = hashToUser.get(tableName);
    if (!userInfo) continue;

    tablesMatched++;

    try {
      const [ratings] = await conn.query(`SELECT fightid, score, time_of_rating FROM \`${tableName}\``);

      let userNewRatings = 0;
      for (const r of ratings) {
        const legacyFightId = String(r.fightid);

        // Only process fights in our target set (non-UFC, pre-cutoff)
        if (!legacyFightIds.has(legacyFightId)) continue;

        // Check mapping
        const newFightId = fightMapping.get(legacyFightId);
        if (!newFightId) {
          ratingsSkippedNoMapping++;
          continue;
        }

        // Check duplicate
        const key = `${newFightId}:${userInfo.id}`;
        if (existingKeys.has(key)) {
          ratingsSkippedExisting++;
          continue;
        }

        // Validate score
        const score = parseInt(r.score, 10);
        if (score < 1 || score > 10) {
          ratingsSkippedInvalid++;
          continue;
        }

        // Parse timestamp
        let createdAt = new Date();
        if (r.time_of_rating) {
          const parsed = new Date(r.time_of_rating);
          if (!isNaN(parsed.getTime())) createdAt = parsed;
        }

        ratingsToCreate.push({
          fightId: newFightId,
          userId: userInfo.id,
          rating: score,
          createdAt,
        });
        existingKeys.add(key); // Prevent duplicates within this run
        userNewRatings++;
      }

      if (userNewRatings > 0) {
        perUserStats.set(userInfo.email, (perUserStats.get(userInfo.email) || 0) + userNewRatings);
      }
    } catch (e) {
      // Table doesn't exist or query error - skip silently
    }

    tablesProcessed++;
    if (tablesProcessed % 200 === 0) {
      console.log(`  Processed ${tablesProcessed}/${tables.length} tables, found ${ratingsToCreate.length} new ratings so far...`);
    }
  }

  await conn.end();

  // Per-promotion breakdown of ratings to create
  // We need to reverse-map fightId -> promotion
  const fightIdToPromotion = new Map();
  for (const [legacyId, newId] of fightMapping) {
    // We don't have promotion data on the mapping directly, so we'll count from the data
    fightIdToPromotion.set(newId, legacyId);
  }

  console.log(`\n  Tables processed: ${tablesProcessed}`);
  console.log(`  Tables matched to app users: ${tablesMatched}`);
  console.log(`  New ratings to create: ${ratingsToCreate.length}`);
  console.log(`  Skipped (no fight mapping): ${ratingsSkippedNoMapping}`);
  console.log(`  Skipped (already exists): ${ratingsSkippedExisting}`);
  console.log(`  Skipped (invalid score): ${ratingsSkippedInvalid}`);

  // Show per-user breakdown (top users)
  if (perUserStats.size > 0) {
    const sorted = Array.from(perUserStats.entries()).sort((a, b) => b[1] - a[1]);
    console.log(`\n  Per-user breakdown (${perUserStats.size} users with new ratings):`);
    const showCount = VERBOSE ? sorted.length : Math.min(sorted.length, 15);
    for (let i = 0; i < showCount; i++) {
      console.log(`    ${sorted[i][0]}: ${sorted[i][1]} ratings`);
    }
    if (!VERBOSE && sorted.length > 15) {
      console.log(`    ... and ${sorted.length - 15} more users`);
    }
  }

  return { ratingsToCreate, perUserStats };
}

// ============================================================================
// PHASE 7: Insert Ratings (batch)
// ============================================================================

async function insertRatings(ratingsToCreate) {
  console.log('\n--- PHASE 7: Insert Ratings ---');

  if (DRY_RUN) {
    console.log(`  DRY RUN: Would insert ${ratingsToCreate.length} ratings`);
    console.log(`  Run with --execute to actually write to database`);
    return 0;
  }

  if (ratingsToCreate.length === 0) {
    console.log(`  No ratings to insert`);
    return 0;
  }

  console.log(`  Inserting ${ratingsToCreate.length} ratings in batches of 1000...`);

  let totalInserted = 0;
  const batchSize = 1000;

  for (let i = 0; i < ratingsToCreate.length; i += batchSize) {
    const batch = ratingsToCreate.slice(i, i + batchSize);
    const result = await prisma.fightRating.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalInserted += result.count;
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ratingsToCreate.length / batchSize)}: inserted ${result.count}/${batch.length}`);
  }

  console.log(`  Total ratings inserted: ${totalInserted}`);
  return totalInserted;
}

// ============================================================================
// PHASE 8: Update Stats
// ============================================================================

async function updateStats(fightMapping) {
  console.log('\n--- PHASE 8: Update Stats ---');

  if (DRY_RUN) {
    console.log(`  DRY RUN: Would update stats for ${fightMapping.size} fights and affected users`);
    return;
  }

  const affectedFightIds = Array.from(new Set(fightMapping.values()));

  // Update fight stats
  console.log(`  Updating stats for ${affectedFightIds.length} fights...`);
  let fightsUpdated = 0;

  for (let i = 0; i < affectedFightIds.length; i++) {
    const fightId = affectedFightIds[i];
    const ratings = await prisma.fightRating.findMany({
      where: { fightId },
      select: { rating: true },
    });

    const count = ratings.length;
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

    await prisma.fight.update({
      where: { id: fightId },
      data: { totalRatings: count, averageRating: avg },
    });
    fightsUpdated++;

    if ((i + 1) % 100 === 0) {
      console.log(`    Updated ${i + 1}/${affectedFightIds.length} fights...`);
    }
  }

  console.log(`  Fight stats updated: ${fightsUpdated}`);

  // Update user stats - find all users who have ratings on affected fights
  const affectedUserIds = await prisma.fightRating.findMany({
    where: { fightId: { in: affectedFightIds } },
    select: { userId: true },
    distinct: ['userId'],
  });

  const uniqueUserIds = affectedUserIds.map(r => r.userId);
  console.log(`  Updating stats for ${uniqueUserIds.length} affected users...`);
  let usersUpdated = 0;

  for (const userId of uniqueUserIds) {
    const ratingCount = await prisma.fightRating.count({ where: { userId } });
    const reviewCount = await prisma.fightReview.count({ where: { userId } });

    await prisma.user.update({
      where: { id: userId },
      data: { totalRatings: ratingCount, totalReviews: reviewCount },
    });
    usersUpdated++;
  }

  console.log(`  User stats updated: ${usersUpdated}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('================================================================');
  console.log('     MIGRATE NON-UFC LEGACY RATINGS (PFL, ONE, BKFC)');
  console.log('================================================================');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE (will write to DB!)'}`);
  console.log(`  Promotions: ${TARGET_PROMOTIONS.join(', ')}`);
  console.log(`  Date cutoff: < ${DATE_CUTOFF}`);
  console.log(`  Verbose: ${VERBOSE}`);
  console.log('');

  if (!DRY_RUN) {
    console.log('  *** EXECUTE MODE: Will write ratings to the database ***');
    console.log('  Starting in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  const connection = await mysql.createConnection(MYSQL_CONFIG);
  console.log('  Connected to legacy MySQL database');

  try {
    // Phase 1: Load legacy fights
    const { legacyFights, legacyEvents, legacyFightIds } = await loadLegacyFights(connection);

    // Phase 2: Load new DB fights
    const { appFights, appEvents, appFighters } = await loadNewDbFights();

    // Phase 3: Build fight mapping
    const { fightMapping, unmatchedFights } = buildFightMapping(
      { legacyFights, legacyEvents },
      { appFights, appEvents, appFighters }
    );

    if (fightMapping.size === 0) {
      console.log('\n  No fight mappings found. Nothing to migrate.');
      return;
    }

    // Phase 4: Build user mapping
    const { hashToUser } = await buildUserMapping();

    // Phase 5: Load existing ratings
    const existingKeys = await loadExistingRatings(fightMapping);

    // Phase 6: Query legacy ratings
    const { ratingsToCreate, perUserStats } = await queryLegacyRatings(
      connection, legacyFightIds, fightMapping, hashToUser, existingKeys
    );

    // Phase 7: Insert ratings
    const totalInserted = await insertRatings(ratingsToCreate);

    // Phase 8: Update stats
    if (totalInserted > 0) {
      await updateStats(fightMapping);
    } else if (!DRY_RUN) {
      console.log('\n--- PHASE 8: Update Stats ---');
      console.log('  No ratings inserted, skipping stats update');
    }

    // Final summary
    console.log('\n================================================================');
    console.log('                      SUMMARY');
    console.log('================================================================');
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
    console.log(`  Legacy fights loaded: ${legacyFights.length}`);
    console.log(`  Fight mappings: ${fightMapping.size} matched, ${unmatchedFights.length} unmatched`);
    console.log(`  Users with ratings: ${perUserStats.size}`);
    console.log(`  Ratings to migrate: ${ratingsToCreate.length}`);
    if (!DRY_RUN) {
      console.log(`  Ratings inserted: ${totalInserted}`);
    }
    console.log('================================================================');

  } finally {
    await connection.end();
    await prisma.$disconnect();
    console.log('\n  Done.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
