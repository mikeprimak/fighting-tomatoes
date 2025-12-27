/**
 * 03-migrate-users.ts
 *
 * Migrates users from legacy fightingtomatoes.com to new database.
 *
 * IMPORTANT: Users are imported with password = null so they must go through
 * the account claim flow (email verification + password reset) to activate.
 *
 * Prerequisites: Run 01-parse-legacy-data.ts first
 *
 * What this script does:
 * 1. Loads legacy users from JSON
 * 2. For each user, checks if email already exists in new DB
 * 3. Creates new user record with:
 *    - password: null (triggers claim flow)
 *    - authProvider: EMAIL
 *    - isEmailVerified: false
 *    - Preserved: displayName, isMedia, mediaOrganization, points, totalReviews
 *
 * Usage: npx ts-node scripts/legacy-migration/03-migrate-users.ts
 *
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --limit N: Only process first N users (for testing)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import type { LegacyUser, UserMapping } from './types';

const prisma = new PrismaClient();

// Paths
const DATA_DIR = path.join(__dirname, 'legacy-data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MAPPING_FILE = path.join(DATA_DIR, 'user-mapping.json');

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined;

async function main() {
  console.log('='.repeat(60));
  console.log('USER MIGRATION');
  console.log(isDryRun ? '*** DRY RUN MODE - No changes will be made ***' : '');
  console.log('='.repeat(60));
  console.log('');

  // Load legacy users
  console.log('[1/3] Loading legacy users...');
  if (!fs.existsSync(USERS_FILE)) {
    console.error('ERROR: users.json not found. Run 01-parse-legacy-data.ts first.');
    process.exit(1);
  }

  let legacyUsers: LegacyUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  console.log(`    Loaded ${legacyUsers.length} legacy users`);

  if (limit) {
    legacyUsers = legacyUsers.slice(0, limit);
    console.log(`    Limited to first ${limit} users`);
  }

  // Get existing users in new DB
  console.log('[2/3] Checking for existing users in new database...');
  const existingEmails = new Set<string>();
  const existingUsers = await prisma.user.findMany({
    select: { email: true },
  });
  for (const user of existingUsers) {
    existingEmails.add(user.email.toLowerCase());
  }
  console.log(`    Found ${existingEmails.size} existing users in new database`);

  // Migrate users
  console.log('[3/3] Migrating users...');
  const userMappings: UserMapping[] = [];
  let created = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  let errors = 0;

  for (let i = 0; i < legacyUsers.length; i++) {
    const legacy = legacyUsers[i];
    const email = legacy.emailaddress?.toLowerCase().trim();

    // Validate email
    if (!email || !isValidEmail(email)) {
      skippedInvalid++;
      continue;
    }

    // Skip if already exists
    if (existingEmails.has(email)) {
      skippedExisting++;
      continue;
    }

    // Prepare user data
    const userData = {
      email,
      password: null, // CRITICAL: null password triggers account claim flow
      authProvider: 'EMAIL' as const,
      emailVerified: false,
      isEmailVerified: false,
      displayName: legacy.displayname || null,
      isMedia: legacy.ismedia === 1,
      mediaOrganization: legacy.mediaorganization || null,
      mediaWebsite: legacy.mediaorganizationwebsite || null,
      wantsEmails: legacy.wantsemail === 1,
      points: legacy.reviewerscore || 0,
      totalReviews: legacy.numreviews || 0,
      // Note: Not importing avatar - users can upload new ones
    };

    if (isDryRun) {
      // Dry run - just record what would happen
      userMappings.push({
        legacyId: legacy.id,
        legacyEmail: email,
        legacyEmailHash: legacy.maptoemail,
        newId: 'dry-run-uuid',
      });
      created++;
    } else {
      // Actually create the user
      try {
        const newUser = await prisma.user.create({
          data: userData,
        });

        userMappings.push({
          legacyId: legacy.id,
          legacyEmail: email,
          legacyEmailHash: legacy.maptoemail,
          newId: newUser.id,
        });
        created++;
        existingEmails.add(email); // Prevent duplicates in this batch
      } catch (error: unknown) {
        errors++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`    ERROR creating user ${email}: ${errorMessage}`);
      }
    }

    // Progress indicator
    if ((i + 1) % 100 === 0) {
      console.log(`    Processed ${i + 1}/${legacyUsers.length} users...`);
    }
  }

  // Write user mapping file
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(userMappings, null, 2));

  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  Total legacy users:     ${legacyUsers.length}`);
  console.log(`  Created:                ${created}`);
  console.log(`  Skipped (existing):     ${skippedExisting}`);
  console.log(`  Skipped (invalid):      ${skippedInvalid}`);
  console.log(`  Errors:                 ${errors}`);
  console.log('');
  console.log(`User mapping written to: ${MAPPING_FILE}`);

  if (isDryRun) {
    console.log('');
    console.log('*** This was a DRY RUN - no changes were made ***');
    console.log('Run without --dry-run to perform the actual migration.');
  }

  await prisma.$disconnect();
}

function isValidEmail(email: string): boolean {
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Run the script
main().catch(console.error);
