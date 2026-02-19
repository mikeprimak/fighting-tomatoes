#!/usr/bin/env node
/**
 * sync-all-reviews-fixed.js
 *
 * Re-syncs ALL reviews for mapped fights with correct date handling.
 * The legacy review `date` field can be either:
 *   - A Unix timestamp in seconds (e.g., 1480820195 = Dec 3 2016)
 *   - A year integer (e.g., 2019)
 *
 * This script handles both formats correctly.
 *
 * USAGE:
 *   node sync-all-reviews-fixed.js --dry-run
 *   node sync-all-reviews-fixed.js
 */

const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const MYSQL_CONFIG = {
  host: '216.69.165.113',
  port: 3306,
  user: 'fotnadmin',
  password: 'HungryMonkey12',
  connectTimeout: 30000,
};

const DRY_RUN = process.argv.includes('--dry-run');

function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd').replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae').replace(/[ßẞ]/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function parseReviewDate(dateVal) {
  if (!dateVal) return new Date();
  const num = parseInt(dateVal, 10);
  if (isNaN(num)) return new Date();
  // If it looks like a year (2000-2030), treat as Jan 1 of that year
  if (num >= 2000 && num <= 2030) return new Date(num, 0, 1);
  // Otherwise it's a Unix timestamp in seconds
  if (num > 1000000000) return new Date(num * 1000);
  return new Date();
}

async function run() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     SYNC ALL REVIEWS (FIXED DATE HANDLING)                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('  DRY RUN MODE\n');

  // ── Build fight mapping ────────────────────────────────────────
  console.log('Building fight ID mapping...');
  const conn = await mysql.createConnection({ ...MYSQL_CONFIG, database: 'fightdb' });

  const [legacyFights] = await conn.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date
    FROM fights WHERE deleted = 0
  `);

  const fighters = await prisma.fighter.findMany({ select: { id: true, firstName: true, lastName: true } });
  const fighterMap = new Map();
  for (const f of fighters) {
    fighterMap.set(`${normalizeName(f.firstName)}|${normalizeName(f.lastName)}`, f.id);
  }

  const events = await prisma.event.findMany({ select: { id: true, name: true, date: true } });
  const eventMap = new Map();
  for (const e of events) {
    const dateStr = e.date.toISOString().split('T')[0];
    eventMap.set(`${normalizeName(e.name)}|${dateStr}`, e.id);
  }

  const newFights = await prisma.fight.findMany({
    select: { id: true, fighter1Id: true, fighter2Id: true, eventId: true }
  });
  const fightLookup = new Map();
  for (const f of newFights) {
    fightLookup.set(`${f.fighter1Id}|${f.fighter2Id}|${f.eventId}`, f.id);
    fightLookup.set(`${f.fighter2Id}|${f.fighter1Id}|${f.eventId}`, f.id);
  }

  const legacyToNew = new Map();
  for (const lf of legacyFights) {
    const f1Key = `${normalizeName(lf.f1fn)}|${normalizeName(lf.f1ln)}`;
    const f2Key = `${normalizeName(lf.f2fn)}|${normalizeName(lf.f2ln)}`;
    const fighter1Id = fighterMap.get(f1Key);
    const fighter2Id = fighterMap.get(f2Key);
    if (!fighter1Id || !fighter2Id) continue;

    const rawEventName = (lf.eventname || '').trim();
    const promotion = (lf.promotion || '').trim();
    let eventDisplayName = rawEventName;
    if (/^\d+$/.test(rawEventName)) {
      eventDisplayName = `${promotion} ${rawEventName}`;
    } else if (promotion && !rawEventName.toLowerCase().startsWith(promotion.toLowerCase())) {
      eventDisplayName = `${promotion} ${rawEventName}`;
    }

    const parsedDate = lf.date ? new Date(lf.date) : null;
    if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 1990) continue;
    const dateStr = parsedDate.toISOString().split('T')[0];

    let eventId = eventMap.get(`${normalizeName(eventDisplayName)}|${dateStr}`)
               || eventMap.get(`${normalizeName(rawEventName)}|${dateStr}`);

    if (!eventId) {
      const dayBefore = new Date(parsedDate); dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(parsedDate); dayAfter.setDate(dayAfter.getDate() + 1);
      const db = dayBefore.toISOString().split('T')[0];
      const da = dayAfter.toISOString().split('T')[0];
      eventId = eventMap.get(`${normalizeName(eventDisplayName)}|${db}`)
             || eventMap.get(`${normalizeName(eventDisplayName)}|${da}`)
             || eventMap.get(`${normalizeName(rawEventName)}|${db}`)
             || eventMap.get(`${normalizeName(rawEventName)}|${da}`);
    }
    if (!eventId) continue;

    const fk1 = `${fighter1Id}|${fighter2Id}|${eventId}`;
    const fk2 = `${fighter2Id}|${fighter1Id}|${eventId}`;
    const newFightId = fightLookup.get(fk1) || fightLookup.get(fk2);
    if (newFightId) legacyToNew.set(Number(lf.id), newFightId);
  }

  console.log(`  Mapped ${legacyToNew.size} legacy fights to new DB\n`);
  await conn.end();

  // ── Sync reviews ───────────────────────────────────────────────
  console.log('── SYNCING REVIEWS ──');

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]));

  const existingReviews = await prisma.fightReview.findMany({
    select: { userId: true, fightId: true, content: true }
  });
  const existingKeys = new Set(
    existingReviews.map(r => `${r.userId}|${r.fightId}|${normalizeName(r.content?.substring(0, 50) || '')}`)
  );
  console.log(`  Existing reviews: ${existingReviews.length}`);

  const reviewConn = await mysql.createConnection(MYSQL_CONFIG);
  await reviewConn.query('USE fightreviewsdb');
  const [tables] = await reviewConn.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  console.log(`  Review tables to check: ${tables.length}`);

  let created = 0, skipped = 0, noUser = 0, noFight = 0, errors = 0;
  let processed = 0;

  for (const table of tables) {
    const tableName = table[tableKey];
    const legacyFightId = parseInt(tableName, 10);
    if (isNaN(legacyFightId)) continue;

    const newFightId = legacyToNew.get(legacyFightId);
    if (!newFightId) { noFight++; continue; }

    try {
      const [columns] = await reviewConn.query(`DESCRIBE \`${tableName}\``);
      if (!columns.some(c => c.Field === 'comment')) continue;

      const [reviews] = await reviewConn.query(`SELECT * FROM \`${tableName}\``);
      for (const review of reviews) {
        const email = (review.commenteremail || '').toLowerCase().trim();
        const userId = userByEmail.get(email);
        if (!userId) { noUser++; continue; }

        const reviewKey = `${userId}|${newFightId}|${normalizeName(review.comment?.substring(0, 50) || '')}`;
        if (existingKeys.has(reviewKey)) {
          skipped++;
          continue;
        }

        if (!DRY_RUN) {
          try {
            await prisma.fightReview.create({
              data: {
                fightId: newFightId,
                userId,
                content: review.comment || '',
                upvotes: review.helpful || 0,
                createdAt: parseReviewDate(review.date),
              }
            });
            created++;
            existingKeys.add(reviewKey);
          } catch (e) {
            errors++;
            if (errors <= 5) {
              console.log(`    Error: ${e.message.split('\n')[0]}`);
            }
          }
        } else {
          created++;
        }
      }
    } catch (e) {
      // skip problematic tables
    }

    processed++;
    if (processed % 2000 === 0) {
      console.log(`    Processed ${processed}/${tables.length} tables (${created} created so far)...`);
    }
  }

  await reviewConn.end();

  console.log(`\n  Results:`);
  console.log(`    Created:    ${created}`);
  console.log(`    Skipped:    ${skipped} (already exist)`);
  console.log(`    No user:    ${noUser} (reviewer email not in DB)`);
  console.log(`    No fight:   ${noFight} (fight not mapped)`);
  console.log(`    Errors:     ${errors}`);

  await prisma.$disconnect();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
