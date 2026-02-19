#!/usr/bin/env node
/**
 * ============================================================================
 * MIGRATE LEGACY REVIEWS + UPVOTES TO NEW DATABASE (STANDALONE)
 * ============================================================================
 *
 * Migrates reviews from the legacy fightreviewsdb MySQL database and their
 * associated upvotes to the new PostgreSQL database.
 *
 * Optimizations over the sync-all-from-live.js review sync:
 *   1. Filters tables first: only queries tables whose name matches a mapped
 *      legacy fight ID (reduces from ~14,241 to ~8,000-10,000 queries)
 *   2. Skips DESCRIBE: tries SELECT with specific columns, catches errors
 *   3. Batch creates: uses createMany() in chunks of 500
 *   4. Migrates ALL fields: score, link, linktitle (missing from old sync)
 *
 * USAGE:
 *   node migrate-reviews-standalone.js --dry-run    # Preview without changes
 *   node migrate-reviews-standalone.js              # Run migration
 *
 * ============================================================================
 */

const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Legacy MySQL connection (fightingtomatoes.com)
const MYSQL_CONFIG = {
  host: '216.69.165.113',
  port: 3306,
  user: 'fotnadmin',
  password: 'HungryMonkey12',
};

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// In-memory mappings
let legacyFightIdToNewId = new Map();
let legacyUserIdToNewId = new Map();

// ============================================================================
// HELPER FUNCTIONS
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

// ============================================================================
// PHASE 1: BUILD MAPPINGS
// ============================================================================

async function buildFightMappings(connection) {
  console.log('  Loading legacy fights from MySQL...');
  await connection.query('USE fightdb');
  const [legacyFights] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date
    FROM fights WHERE deleted = 0
  `);
  console.log(`  Found ${legacyFights.length} legacy fights`);

  console.log('  Loading fighters from new DB...');
  const fighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true }
  });
  const fighterMap = new Map();
  for (const f of fighters) {
    fighterMap.set(`${normalizeName(f.firstName)}|${normalizeName(f.lastName)}`, f.id);
  }

  console.log('  Loading fights from new DB...');
  const newFights = await prisma.fight.findMany({
    select: { id: true, fighter1Id: true, fighter2Id: true, eventId: true }
  });
  const fightLookup = new Map();
  for (const f of newFights) {
    fightLookup.set(`${f.fighter1Id}|${f.fighter2Id}|${f.eventId}`, f.id);
    fightLookup.set(`${f.fighter2Id}|${f.fighter1Id}|${f.eventId}`, f.id);
  }

  console.log('  Loading events from new DB...');
  const events = await prisma.event.findMany({
    select: { id: true, name: true, date: true }
  });
  const eventMap = new Map();
  for (const e of events) {
    const dateStr = e.date.toISOString().split('T')[0];
    eventMap.set(`${normalizeName(e.name)}|${dateStr}`, e.id);
  }

  for (const lf of legacyFights) {
    const f1Key = `${normalizeName(lf.f1fn)}|${normalizeName(lf.f1ln)}`;
    const f2Key = `${normalizeName(lf.f2fn)}|${normalizeName(lf.f2ln)}`;
    const fighter1Id = fighterMap.get(f1Key);
    const fighter2Id = fighterMap.get(f2Key);
    if (!fighter1Id || !fighter2Id) continue;

    const eventDate = lf.date ? new Date(lf.date).toISOString().split('T')[0] : '';
    let eventName = (lf.eventname || '').trim();
    const promotion = (lf.promotion || '').trim();
    if (/^\d+$/.test(eventName)) {
      eventName = `${promotion} ${eventName}`;
    } else if (!eventName.toLowerCase().includes(promotion.toLowerCase())) {
      if (eventName.includes(':')) {
        eventName = `${promotion}: ${eventName.split(':').slice(1).join(':').trim()}`;
      } else if (/^Fight\s*Night/i.test(eventName)) {
        eventName = `${promotion} ${eventName}`;
      }
    }
    const eventId = eventMap.get(`${normalizeName(eventName)}|${eventDate}`);
    if (!eventId) continue;

    const fightKey1 = `${fighter1Id}|${fighter2Id}|${eventId}`;
    const fightKey2 = `${fighter2Id}|${fighter1Id}|${eventId}`;
    const newFightId = fightLookup.get(fightKey1) || fightLookup.get(fightKey2);
    if (newFightId) {
      legacyFightIdToNewId.set(lf.id, newFightId);
    }
  }

  console.log(`  Built ${legacyFightIdToNewId.size} fight mappings`);
}

async function buildUserMappings(connection) {
  console.log('  Loading legacy users from MySQL...');
  await connection.query('USE fightdb');
  const [legacyUsers] = await connection.query(`
    SELECT id, emailaddress FROM users
  `);
  console.log(`  Found ${legacyUsers.length} legacy users`);

  console.log('  Loading users from new DB...');
  const newUsers = await prisma.user.findMany({
    select: { id: true, email: true }
  });

  // Build email -> new user ID mapping
  const emailToNewId = new Map();
  for (const u of newUsers) {
    emailToNewId.set(u.email.toLowerCase(), u.id);
  }

  // Build legacy user ID -> new user ID mapping
  for (const lu of legacyUsers) {
    const email = (lu.emailaddress || '').toLowerCase().trim();
    if (!email) continue;
    const newId = emailToNewId.get(email);
    if (newId) {
      legacyUserIdToNewId.set(lu.id, newId);
    }
  }

  console.log(`  Built ${legacyUserIdToNewId.size} user ID mappings`);
  return emailToNewId;
}

// ============================================================================
// PHASE 2: MIGRATE REVIEWS
// ============================================================================

async function migrateReviews(connection, emailToNewId) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 2: MIGRATING REVIEWS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const result = { synced: 0, skipped: 0, errors: 0, noUser: 0, emptyContent: 0, tablesQueried: 0 };

  // Get existing reviews for deduplication
  const existingReviews = await prisma.fightReview.findMany({
    select: { userId: true, fightId: true, content: true }
  });
  const existingKeys = new Set(
    existingReviews.map(r => `${r.userId}|${r.fightId}|${normalizeName(r.content?.substring(0, 50) || '')}`)
  );
  console.log(`  Found ${existingReviews.length} existing reviews in new DB`);

  // Get all review tables from fightreviewsdb
  await connection.query('USE fightreviewsdb');
  const [tables] = await connection.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  console.log(`  Found ${tables.length} total review tables in legacy DB`);

  // Build set of mapped legacy fight IDs for fast lookup
  const mappedLegacyFightIds = new Set();
  for (const [legacyId] of legacyFightIdToNewId) {
    mappedLegacyFightIds.add(String(legacyId));
  }

  // Filter tables to only those matching mapped fight IDs
  const matchingTables = [];
  for (const table of tables) {
    const tableName = table[tableKey];
    if (mappedLegacyFightIds.has(tableName)) {
      matchingTables.push(tableName);
    }
  }
  console.log(`  Filtered to ${matchingTables.length} tables with mapped fight IDs (skipping ${tables.length - matchingTables.length})`);

  const reviewsToCreate = [];

  for (let i = 0; i < matchingTables.length; i++) {
    const tableName = matchingTables[i];
    const legacyFightId = parseInt(tableName, 10);
    const newFightId = legacyFightIdToNewId.get(legacyFightId);

    try {
      // Skip DESCRIBE - just try SELECT with specific columns
      const [reviews] = await connection.query(
        `SELECT comment, commenteremail, score, helpful, link, linktitle, date, upvoters FROM \`${tableName}\``
      );
      result.tablesQueried++;

      for (const review of reviews) {
        const content = (review.comment || '').trim();
        if (!content || content.length < 3) {
          result.emptyContent++;
          continue;
        }

        const email = (review.commenteremail || '').toLowerCase().trim();
        if (!email) {
          result.noUser++;
          continue;
        }

        const userId = emailToNewId.get(email);
        if (!userId) {
          result.noUser++;
          continue;
        }

        // Deduplication check
        const reviewKey = `${userId}|${newFightId}|${normalizeName(content.substring(0, 50))}`;
        if (existingKeys.has(reviewKey)) {
          result.skipped++;
          continue;
        }
        existingKeys.add(reviewKey);

        // Parse date: legacy stores year as integer (e.g., 2019)
        let createdAt = new Date();
        if (review.date) {
          const yearInt = parseInt(review.date, 10);
          if (!isNaN(yearInt) && yearInt >= 2000 && yearInt <= 2030) {
            createdAt = new Date(yearInt, 0, 1); // Jan 1 of that year
          }
        }

        // Parse rating
        let rating = null;
        if (review.score !== null && review.score !== undefined) {
          const scoreInt = parseInt(review.score, 10);
          if (scoreInt >= 1 && scoreInt <= 10) {
            rating = scoreInt;
          }
        }

        // Parse article link
        const articleUrl = (review.link || '').trim() || null;
        const articleTitle = (review.linktitle || '').trim() || null;

        reviewsToCreate.push({
          fightId: newFightId,
          userId,
          content,
          rating,
          articleUrl,
          articleTitle,
          upvotes: review.helpful || 0,
          createdAt,
        });
      }
    } catch (e) {
      // Table might have different column structure - skip it
      result.errors++;
    }

    // Progress
    if ((i + 1) % 1000 === 0 || i === matchingTables.length - 1) {
      console.log(`    Queried ${i + 1}/${matchingTables.length} tables, found ${reviewsToCreate.length} reviews so far...`);
    }
  }

  console.log(`\n  Summary of review collection:`);
  console.log(`    Reviews to create: ${reviewsToCreate.length}`);
  console.log(`    Skipped (duplicates): ${result.skipped}`);
  console.log(`    Skipped (no user match): ${result.noUser}`);
  console.log(`    Skipped (empty content): ${result.emptyContent}`);
  console.log(`    Table errors: ${result.errors}`);
  console.log(`    Tables queried: ${result.tablesQueried}`);

  // Batch insert reviews
  if (!DRY_RUN && reviewsToCreate.length > 0) {
    console.log(`\n  Inserting ${reviewsToCreate.length} reviews in batches of 500...`);
    const chunkSize = 500;
    for (let i = 0; i < reviewsToCreate.length; i += chunkSize) {
      const chunk = reviewsToCreate.slice(i, i + chunkSize);
      try {
        const created = await prisma.fightReview.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        result.synced += created.count;
      } catch (e) {
        // Fall back to individual creates for this chunk
        console.log(`    Batch ${Math.floor(i / chunkSize) + 1} failed, falling back to individual creates...`);
        for (const review of chunk) {
          try {
            await prisma.fightReview.create({ data: review });
            result.synced++;
          } catch (e2) {
            result.errors++;
          }
        }
      }

      if ((i + chunkSize) % 2000 === 0 || i + chunkSize >= reviewsToCreate.length) {
        console.log(`    Inserted ${Math.min(i + chunkSize, reviewsToCreate.length)}/${reviewsToCreate.length}...`);
      }
    }
  } else if (DRY_RUN) {
    result.synced = reviewsToCreate.length;
  }

  console.log(`\n  Reviews sync complete: ${result.synced} synced, ${result.skipped} duplicates, ${result.errors} errors`);
  return { result, reviewsToCreate };
}

// ============================================================================
// PHASE 3: MIGRATE UPVOTES
// ============================================================================

async function migrateUpvotes(connection) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PHASE 3: MIGRATING UPVOTES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const result = { synced: 0, skipped: 0, errors: 0, noUser: 0, noReview: 0 };

  // Load all reviews from new DB (freshly inserted)
  const reviews = await prisma.fightReview.findMany({
    select: { id: true, userId: true, fightId: true, content: true }
  });
  console.log(`  Found ${reviews.length} reviews in new DB`);

  // Index reviews by fightId for fast lookup
  const reviewsByFight = new Map();
  for (const r of reviews) {
    if (!reviewsByFight.has(r.fightId)) {
      reviewsByFight.set(r.fightId, []);
    }
    reviewsByFight.get(r.fightId).push(r);
  }

  // Get existing votes for deduplication
  const existingVotes = await prisma.reviewVote.findMany({
    select: { userId: true, reviewId: true }
  });
  const existingVoteKeys = new Set(existingVotes.map(v => `${v.userId}|${v.reviewId}`));
  console.log(`  Found ${existingVotes.length} existing votes`);

  // Build set of mapped legacy fight IDs
  const mappedLegacyFightIds = new Set();
  for (const [legacyId] of legacyFightIdToNewId) {
    mappedLegacyFightIds.add(String(legacyId));
  }

  // Get all review tables
  await connection.query('USE fightreviewsdb');
  const [tables] = await connection.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];

  // Filter to mapped tables
  const matchingTables = [];
  for (const table of tables) {
    const tableName = table[tableKey];
    if (mappedLegacyFightIds.has(tableName)) {
      matchingTables.push(tableName);
    }
  }
  console.log(`  Checking ${matchingTables.length} tables for upvoter data...`);

  const votesToCreate = [];

  for (let i = 0; i < matchingTables.length; i++) {
    const tableName = matchingTables[i];
    const legacyFightId = parseInt(tableName, 10);
    const newFightId = legacyFightIdToNewId.get(legacyFightId);

    const fightReviews = reviewsByFight.get(newFightId);
    if (!fightReviews || fightReviews.length === 0) continue;

    try {
      const [legacyReviews] = await connection.query(
        `SELECT comment, upvoters FROM \`${tableName}\``
      );

      for (const legacyReview of legacyReviews) {
        if (!legacyReview.upvoters) continue;

        // Decode upvoters buffer
        let decoded = '';
        if (Buffer.isBuffer(legacyReview.upvoters)) {
          decoded = legacyReview.upvoters.toString('utf8');
        } else if (typeof legacyReview.upvoters === 'string') {
          decoded = legacyReview.upvoters;
        } else if (legacyReview.upvoters && legacyReview.upvoters.data) {
          decoded = Buffer.from(legacyReview.upvoters.data).toString('utf8');
        }

        const upvoterIds = decoded.match(/\d+/g) || [];
        if (upvoterIds.length === 0) continue;

        // Find matching review by content prefix
        const legacyContentKey = normalizeName((legacyReview.comment || '').substring(0, 50));
        const matchingReview = fightReviews.find(
          r => normalizeName((r.content || '').substring(0, 50)) === legacyContentKey
        );
        if (!matchingReview) {
          result.noReview++;
          continue;
        }

        for (const legacyUserId of upvoterIds) {
          const newUserId = legacyUserIdToNewId.get(parseInt(legacyUserId));
          if (!newUserId) {
            result.noUser++;
            continue;
          }

          // Skip if user is voting on their own review
          if (newUserId === matchingReview.userId) {
            result.skipped++;
            continue;
          }

          const voteKey = `${newUserId}|${matchingReview.id}`;
          if (existingVoteKeys.has(voteKey)) {
            result.skipped++;
            continue;
          }
          existingVoteKeys.add(voteKey);

          votesToCreate.push({
            userId: newUserId,
            reviewId: matchingReview.id,
            isUpvote: true,
          });
        }
      }
    } catch (e) {
      // Skip problematic tables
      result.errors++;
    }

    if ((i + 1) % 1000 === 0 || i === matchingTables.length - 1) {
      console.log(`    Checked ${i + 1}/${matchingTables.length} tables, found ${votesToCreate.length} votes so far...`);
    }
  }

  console.log(`\n  Summary of upvote collection:`);
  console.log(`    Votes to create: ${votesToCreate.length}`);
  console.log(`    Skipped (duplicates/self-vote): ${result.skipped}`);
  console.log(`    Skipped (no user mapping): ${result.noUser}`);
  console.log(`    Skipped (no matching review): ${result.noReview}`);
  console.log(`    Table errors: ${result.errors}`);

  // Batch insert votes
  if (!DRY_RUN && votesToCreate.length > 0) {
    console.log(`\n  Inserting ${votesToCreate.length} votes in batches of 500...`);
    const chunkSize = 500;
    for (let i = 0; i < votesToCreate.length; i += chunkSize) {
      const chunk = votesToCreate.slice(i, i + chunkSize);
      try {
        const created = await prisma.reviewVote.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        result.synced += created.count;
      } catch (e) {
        // Fall back to individual creates
        for (const vote of chunk) {
          try {
            await prisma.reviewVote.create({ data: vote });
            result.synced++;
          } catch (e2) {
            result.errors++;
          }
        }
      }
    }
  } else if (DRY_RUN) {
    result.synced = votesToCreate.length;
  }

  console.log(`\n  Upvotes sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     MIGRATE LEGACY REVIEWS + UPVOTES (STANDALONE)             ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Source: fightingtomatoes.com (MySQL fightreviewsdb)           ║');
  console.log('║  Target: PostgreSQL (fight_reviews, review_votes)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }

  const startTime = Date.now();

  const connection = await mysql.createConnection(MYSQL_CONFIG);
  console.log('Connected to legacy MySQL database\n');

  try {
    // Phase 1: Build mappings
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 1: BUILDING MAPPINGS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await buildFightMappings(connection);
    const emailToNewId = await buildUserMappings(connection);

    // Phase 2: Migrate reviews
    const { result: reviewResult } = await migrateReviews(connection, emailToNewId);

    // Phase 3: Migrate upvotes
    const upvoteResult = await migrateUpvotes(connection);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    MIGRATION COMPLETE                          ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Reviews synced:    ${String(reviewResult.synced).padStart(6)}                                   ║`);
    console.log(`║  Reviews skipped:   ${String(reviewResult.skipped).padStart(6)} (duplicates)                     ║`);
    console.log(`║  Reviews errors:    ${String(reviewResult.errors).padStart(6)}                                   ║`);
    console.log(`║  Upvotes synced:    ${String(upvoteResult.synced).padStart(6)}                                   ║`);
    console.log(`║  Upvotes skipped:   ${String(upvoteResult.skipped).padStart(6)}                                  ║`);
    console.log(`║  Duration:          ${String(duration + 's').padStart(6)}                                   ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  Next steps:                                                   ║');
    console.log('║    cd ../.. && node ../update-user-stats.js                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    if (DRY_RUN) {
      console.log('\n*** DRY RUN - No changes were made ***');
    }
  } finally {
    await connection.end();
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
