/**
 * 01-parse-legacy-data.ts
 *
 * Parses SQL dump files from fightingtomatoes.com and extracts data to JSON files.
 * This is the first step in the migration process.
 *
 * Input: SQL dump files in "databases from fightingtomatoes/" folder
 * Output: JSON files in "legacy-data/" folder
 *
 * Usage: npx ts-node scripts/legacy-migration/01-parse-legacy-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { parseSqlDump, getTableNames } from './sql-parser';
import type {
  LegacyUser,
  LegacyFight,
  LegacyRating,
  LegacyReview,
  LegacyTag,
  ParsedLegacyData,
} from './types';

// Paths
const DUMP_DIR = path.join(__dirname, '../../../../databases from fightingtomatoes');
const OUTPUT_DIR = path.join(__dirname, 'legacy-data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function main() {
  console.log('='.repeat(60));
  console.log('LEGACY DATA PARSER');
  console.log('Parsing SQL dumps from fightingtomatoes.com');
  console.log('='.repeat(60));
  console.log('');

  // 1. Parse Users
  console.log('[1/6] Parsing users...');
  const users = parseUsers();
  console.log(`    Found ${users.length} users`);

  // Build email hash map (MD5 hash -> email)
  // Strategy:
  // 1. Use the maptoemail field if it's unique
  // 2. Also compute MD5(email) for each user as a fallback lookup
  const emailHashMap = new Map<string, string>();
  const computedHashMap = new Map<string, string>();

  for (const user of users) {
    if (user.emailaddress) {
      // Compute MD5 hash of the email
      const computedHash = crypto.createHash('md5').update(user.emailaddress.toLowerCase()).digest('hex');
      computedHashMap.set(computedHash, user.emailaddress);

      // Also add the maptoemail if it's unique
      if (user.maptoemail && user.maptoemail.length === 32) {
        emailHashMap.set(user.maptoemail, user.emailaddress);
      }
    }
  }

  // Merge computed hashes into main map (computed takes precedence for conflicts)
  for (const [hash, email] of computedHashMap) {
    emailHashMap.set(hash, email);
  }

  console.log(`    Built email hash map with ${emailHashMap.size} entries (from ${users.length} users)`);

  // 2. Parse Fights
  console.log('[2/6] Parsing fights...');
  const fights = parseFights();
  console.log(`    Found ${fights.length} fights`);

  // 3. Parse Ratings
  console.log('[3/6] Parsing ratings...');
  const ratings = parseRatings(emailHashMap);
  console.log(`    Found ${ratings.length} ratings`);

  // 4. Parse Reviews
  console.log('[4/6] Parsing reviews...');
  const reviews = parseReviews();
  console.log(`    Found ${reviews.length} reviews`);

  // 5. Parse Tags
  console.log('[5/6] Parsing tags...');
  const tags = parseTags(emailHashMap);
  console.log(`    Found ${tags.length} tags`);

  // 6. Write output files
  console.log('[6/6] Writing JSON files...');

  writeJson('users.json', users);
  writeJson('fights.json', fights);
  writeJson('ratings.json', ratings);
  writeJson('reviews.json', reviews);
  writeJson('tags.json', tags);
  writeJson('email-hash-map.json', Object.fromEntries(emailHashMap));

  console.log('');
  console.log('='.repeat(60));
  console.log('PARSING COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Users:   ${users.length}`);
  console.log(`  Fights:  ${fights.length}`);
  console.log(`  Ratings: ${ratings.length}`);
  console.log(`  Reviews: ${reviews.length}`);
  console.log(`  Tags:    ${tags.length}`);
  console.log('');
  console.log(`Output written to: ${OUTPUT_DIR}`);
}

function parseUsers(): LegacyUser[] {
  const filePath = path.join(DUMP_DIR, 'users.sql');
  if (!fs.existsSync(filePath)) {
    console.error(`    ERROR: File not found: ${filePath}`);
    return [];
  }

  const results = parseSqlDump<LegacyUser>(filePath, 'users');
  const usersTable = results.find(r => r.tableName === 'users');

  if (!usersTable) {
    console.error('    ERROR: Could not find users table in dump');
    return [];
  }

  // Filter out deleted users
  const activeUsers = usersTable.rows.filter(u => u.deleted !== 1);
  console.log(`    (Filtered ${usersTable.rows.length - activeUsers.length} deleted users)`);

  return activeUsers;
}

function parseFights(): LegacyFight[] {
  const filePath = path.join(DUMP_DIR, 'fights.sql');
  if (!fs.existsSync(filePath)) {
    console.error(`    ERROR: File not found: ${filePath}`);
    return [];
  }

  const results = parseSqlDump<LegacyFight>(filePath, 'fights');
  const fightsTable = results.find(r => r.tableName === 'fights');

  if (!fightsTable) {
    console.error('    ERROR: Could not find fights table in dump');
    return [];
  }

  // Filter out deleted fights
  const activeFights = fightsTable.rows.filter(f => f.deleted !== 1);
  console.log(`    (Filtered ${fightsTable.rows.length - activeFights.length} deleted fights)`);

  return activeFights;
}

function parseRatings(emailHashMap: Map<string, string>): LegacyRating[] {
  const filePath = path.join(DUMP_DIR, 'userfightratings.sql');
  if (!fs.existsSync(filePath)) {
    console.error(`    ERROR: File not found: ${filePath}`);
    return [];
  }

  const results = parseSqlDump<Omit<LegacyRating, 'userEmailHash' | 'userEmail'>>(filePath);
  const allRatings: LegacyRating[] = [];
  let resolvedCount = 0;

  for (const tableResult of results) {
    // Table name is the MD5 hash of user's email
    const userEmailHash = tableResult.tableName;
    const userEmail = emailHashMap.get(userEmailHash);

    for (const row of tableResult.rows) {
      // Skip rows without score (invalid data)
      if (row.score === null || row.score === undefined) continue;

      allRatings.push({
        ...row,
        userEmailHash,
        userEmail,
      } as LegacyRating);

      if (userEmail) resolvedCount++;
    }
  }

  console.log(`    (Resolved ${resolvedCount}/${allRatings.length} ratings to user emails)`);
  return allRatings;
}

function parseReviews(): LegacyReview[] {
  // Reviews are stored in fightreviewsdb where each table is named by fight ID
  // We only have a single sample table, but the reviews also have fightid column
  // The main review data with user info is in the per-fight tables

  // First, let's check if we have a comprehensive reviews dump
  // Looking at the structure, reviews are in tables named by fightid in fightreviewsdb

  // For now, we'll parse the sample and check for other review sources
  const filePath = path.join(DUMP_DIR, 'single_table_from_fightreviewsdb.sql');
  const allReviews: LegacyReview[] = [];

  if (fs.existsSync(filePath)) {
    const results = parseSqlDump<LegacyReview>(filePath);
    for (const tableResult of results) {
      for (const row of tableResult.rows) {
        // Set fightid from table name if not in row
        if (!row.fightid && /^\d+$/.test(tableResult.tableName)) {
          row.fightid = parseInt(tableResult.tableName, 10);
        }
        allReviews.push(row);
      }
    }
  }

  // Also check the userfightreviews which maps users to their reviews
  // This contains fightid references - we can use this to build a more complete picture
  const userReviewsPath = path.join(DUMP_DIR, 'userfightreviews.sql');
  if (fs.existsSync(userReviewsPath)) {
    console.log('    Note: userfightreviews.sql contains user->fight review mappings');
    console.log('    Full review content may require fightreviewsdb dump');
  }

  if (allReviews.length === 0) {
    console.log('    WARNING: No review content found. Need fightreviewsdb tables for full reviews.');
    console.log('    The userfightreviews.sql only contains fightid references, not review content.');
  }

  return allReviews;
}

function parseTags(emailHashMap: Map<string, string>): LegacyTag[] {
  const filePath = path.join(DUMP_DIR, 'userfighttags.sql');
  if (!fs.existsSync(filePath)) {
    console.error(`    ERROR: File not found: ${filePath}`);
    return [];
  }

  const results = parseSqlDump<Omit<LegacyTag, 'userEmailHash' | 'userEmail'>>(filePath);
  const allTags: LegacyTag[] = [];
  let resolvedCount = 0;

  for (const tableResult of results) {
    // Table name is the MD5 hash of user's email
    const userEmailHash = tableResult.tableName;
    const userEmail = emailHashMap.get(userEmailHash);

    for (const row of tableResult.rows) {
      // Skip rows without fightid or tagid
      if (!row.fightid || !row.tagid) continue;

      allTags.push({
        ...row,
        userEmailHash,
        userEmail,
      } as LegacyTag);

      if (userEmail) resolvedCount++;
    }
  }

  console.log(`    (Resolved ${resolvedCount}/${allTags.length} tags to user emails)`);
  return allTags;
}

function writeJson(filename: string, data: unknown): void {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`    Written: ${filename}`);
}

// Run the script
main().catch(console.error);
