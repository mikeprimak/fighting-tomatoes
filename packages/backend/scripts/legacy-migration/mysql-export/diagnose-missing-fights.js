#!/usr/bin/env node
/**
 * diagnose-missing-fights.js
 *
 * Connects to legacy MySQL and new PostgreSQL to identify:
 * 1. WHY specific fights (like Maynard vs Hall) failed to migrate
 * 2. Categories of all failures (fighter mismatch, event mismatch, etc.)
 * 3. Total missing ratings/reviews/users tied to missing fights
 * 4. Actionable fix strategies
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
};

function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd').replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae').replace(/[ßẞ]/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

async function run() {
  console.log('Connecting to legacy MySQL...');
  const connection = await mysql.createConnection(MYSQL_CONFIG);
  console.log('Connected.\n');

  // ═══════════════════════════════════════════════════════════════
  // PART 1: Check the specific Maynard vs Hall fight
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PART 1: MAYNARD vs HALL CASE STUDY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await connection.query('USE fightdb');

  const [maynardFights] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date,
           percentscore, numvotes, winner, method, round, time, deleted
    FROM fights
    WHERE (f1ln LIKE '%Maynard%' AND f2ln LIKE '%Hall%')
       OR (f1ln LIKE '%Hall%' AND f2ln LIKE '%Maynard%')
  `);

  console.log(`Found ${maynardFights.length} Maynard/Hall fights in legacy:`);
  for (const f of maynardFights) {
    console.log(`  ID: ${f.id}`);
    console.log(`    ${f.f1fn} ${f.f1ln} vs ${f.f2fn} ${f.f2ln}`);
    console.log(`    Event: "${f.eventname}" (${f.promotion})`);
    console.log(`    Date: ${f.date}`);
    console.log(`    Ratings: ${f.numvotes}, Avg: ${f.percentscore ? (f.percentscore / 10).toFixed(1) : 'N/A'}`);
    console.log(`    Winner: ${f.winner}, Method: ${f.method}`);
    console.log(`    Deleted: ${f.deleted}`);
    console.log('');

    // Check why matching would fail
    const f1Key = `${normalizeName(f.f1fn)}|${normalizeName(f.f1ln)}`;
    const f2Key = `${normalizeName(f.f2fn)}|${normalizeName(f.f2ln)}`;
    console.log(`    Normalized fighter1: "${f1Key}"`);
    console.log(`    Normalized fighter2: "${f2Key}"`);

    // Check if fighters exist in new DB
    const fighter1 = await prisma.fighter.findMany({
      where: { lastName: { contains: f.f1ln ? f.f1ln.trim() : '', mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true }
    });
    const fighter2 = await prisma.fighter.findMany({
      where: { lastName: { contains: f.f2ln ? f.f2ln.trim() : '', mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true }
    });

    console.log(`    Fighter1 matches in new DB (by last name "${f.f1ln}"):`);
    for (const m of fighter1) {
      const nk = `${normalizeName(m.firstName)}|${normalizeName(m.lastName)}`;
      const match = nk === f1Key ? '✅ EXACT' : '❌ NO MATCH';
      console.log(`      ${match}: "${m.firstName} ${m.lastName}" (normalized: "${nk}")`);
    }

    console.log(`    Fighter2 matches in new DB (by last name "${f.f2ln}"):`);
    for (const m of fighter2) {
      const nk = `${normalizeName(m.firstName)}|${normalizeName(m.lastName)}`;
      const match = nk === f2Key ? '✅ EXACT' : '❌ NO MATCH';
      console.log(`      ${match}: "${m.firstName} ${m.lastName}" (normalized: "${nk}")`);
    }

    // Check if event exists
    let eventName = (f.eventname || '').trim();
    const promotion = (f.promotion || '').trim();
    if (/^\d+$/.test(eventName)) {
      eventName = `${promotion} ${eventName}`;
    } else if (!eventName.toLowerCase().includes(promotion.toLowerCase())) {
      if (eventName.includes(':')) {
        eventName = `${promotion}: ${eventName.split(':').slice(1).join(':').trim()}`;
      } else if (/^Fight\s*Night/i.test(eventName)) {
        eventName = `${promotion} ${eventName}`;
      }
    }
    const eventDate = f.date ? new Date(f.date).toISOString().split('T')[0] : '';
    console.log(`\n    Event lookup: normalized="${normalizeName(eventName)}" date="${eventDate}"`);
    console.log(`    Transformed event name: "${eventName}"`);

    const matchingEvents = await prisma.event.findMany({
      where: {
        OR: [
          { name: { contains: 'TUF', mode: 'insensitive' } },
          { name: { contains: f.eventname || '', mode: 'insensitive' } },
          { date: f.date ? new Date(f.date) : undefined }
        ]
      },
      select: { id: true, name: true, date: true, promotion: true },
      take: 10
    });

    console.log(`    Potential event matches in new DB:`);
    for (const e of matchingEvents) {
      const eDateStr = e.date.toISOString().split('T')[0];
      console.log(`      "${e.name}" (${e.promotion}) - ${eDateStr}`);
      console.log(`        normalized: "${normalizeName(e.name)}|${eDateStr}"`);
    }
  }

  // Check reviews for Maynard vs Hall fight
  if (maynardFights.length > 0) {
    const fightId = maynardFights[0].id;
    console.log(`\n  Checking reviews for legacy fight ID ${fightId}...`);
    try {
      await connection.query('USE fightreviewsdb');
      const [reviews] = await connection.query(`SELECT * FROM \`${fightId}\``);
      console.log(`  Found ${reviews.length} reviews:`);
      for (const r of reviews) {
        console.log(`    - "${(r.comment || '').substring(0, 80)}..." by ${r.commenteremail} (helpful: ${r.helpful})`);
      }
    } catch (e) {
      console.log(`  No review table for fight ${fightId}`);
    }
  }

  // Check for user "theconstantines"
  await connection.query('USE fightdb');
  const [constUser] = await connection.query(`
    SELECT id, emailaddress, displayname FROM users WHERE displayname LIKE '%theconstantine%'
  `);
  console.log(`\n  User "theconstantines" in legacy:`);
  for (const u of constUser) {
    console.log(`    ID: ${u.id}, Email: ${u.emailaddress}, Display: ${u.displayname}`);

    // Check if this user exists in new DB
    const newUser = await prisma.user.findFirst({
      where: { email: { equals: u.emailaddress, mode: 'insensitive' } }
    });
    console.log(`    In new DB: ${newUser ? `Yes (ID: ${newUser.id})` : 'NO - NOT MIGRATED'}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PART 2: Comprehensive failure analysis for ALL fights
  // ═══════════════════════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PART 2: COMPREHENSIVE FAILURE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await connection.query('USE fightdb');
  const [allLegacyFights] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date,
           percentscore, numvotes, deleted
    FROM fights
  `);

  const [allLegacyFightsActive] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date,
           percentscore, numvotes
    FROM fights WHERE deleted = 0
  `);

  console.log(`Total fights in legacy: ${allLegacyFights.length}`);
  console.log(`Active (deleted=0) fights: ${allLegacyFightsActive.length}`);
  console.log(`Deleted fights: ${allLegacyFights.length - allLegacyFightsActive.length}\n`);

  // Get all new DB data
  const fighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true }
  });
  const fighterMap = new Map();
  for (const f of fighters) {
    fighterMap.set(`${normalizeName(f.firstName)}|${normalizeName(f.lastName)}`, f.id);
  }

  const events = await prisma.event.findMany({
    select: { id: true, name: true, date: true, promotion: true }
  });
  const eventMap = new Map();
  for (const e of events) {
    const dateStr = e.date.toISOString().split('T')[0];
    eventMap.set(`${normalizeName(e.name)}|${dateStr}`, e.id);
    eventMap.set(`${normalizeName(e.name)}|${e.promotion}`, e.id);
  }

  const existingFights = await prisma.fight.findMany({
    select: { id: true, fighter1Id: true, fighter2Id: true, eventId: true }
  });
  const existingSet = new Set();
  for (const f of existingFights) {
    existingSet.add(`${f.fighter1Id}|${f.fighter2Id}|${f.eventId}`);
    existingSet.add(`${f.fighter2Id}|${f.fighter1Id}|${f.eventId}`);
  }

  // Categorize failures
  let alreadyMigrated = 0;
  let fighter1Missing = 0;
  let fighter2Missing = 0;
  let bothFightersMissing = 0;
  let eventMissing = 0;
  let fighterAndEventMissing = 0;
  let wouldCreate = 0;

  const missingFighterNames = new Map();
  const missingEventNames = new Map();
  const failedFightsByPromotion = new Map();
  const failedFightsWithRatings = [];

  // Also check: are the fighters in the legacy fighters table?
  const [legacyFightersTable] = await connection.query(`
    SELECT id, fname, lname FROM fighters
  `);
  const legacyFighterSet = new Set(
    legacyFightersTable.map(f => `${normalizeName(f.fname)}|${normalizeName(f.lname)}`)
  );

  for (const lf of allLegacyFightsActive) {
    const f1Key = `${normalizeName(lf.f1fn)}|${normalizeName(lf.f1ln)}`;
    const f2Key = `${normalizeName(lf.f2fn)}|${normalizeName(lf.f2ln)}`;
    const fighter1Id = fighterMap.get(f1Key);
    const fighter2Id = fighterMap.get(f2Key);

    // Apply same event name normalization as sync script
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
    const eventDate = lf.date ? new Date(lf.date).toISOString().split('T')[0] : '';
    const eventKey1 = `${normalizeName(eventName)}|${eventDate}`;
    const eventKey2 = `${normalizeName(eventName)}|${promotion}`;
    const eventId = eventMap.get(eventKey1) || eventMap.get(eventKey2);

    const hasF1 = !!fighter1Id;
    const hasF2 = !!fighter2Id;
    const hasEvent = !!eventId;

    if (hasF1 && hasF2 && hasEvent) {
      const fk = `${fighter1Id}|${fighter2Id}|${eventId}`;
      const fkR = `${fighter2Id}|${fighter1Id}|${eventId}`;
      if (existingSet.has(fk) || existingSet.has(fkR)) {
        alreadyMigrated++;
      } else {
        wouldCreate++;
      }
      continue;
    }

    // Track failure reason
    const promo = promotion || 'UNKNOWN';
    failedFightsByPromotion.set(promo, (failedFightsByPromotion.get(promo) || 0) + 1);

    if (!hasF1 && !hasF2 && !hasEvent) {
      fighterAndEventMissing++;
    } else if (!hasEvent && (hasF1 && hasF2)) {
      eventMissing++;
      missingEventNames.set(`${eventName} (${eventDate})`, (missingEventNames.get(`${eventName} (${eventDate})`) || 0) + 1);
    } else if (!hasF1 && !hasF2) {
      bothFightersMissing++;
      // Check if they're in legacy fighters table but not in new DB
      const f1InLegacy = legacyFighterSet.has(f1Key);
      const f2InLegacy = legacyFighterSet.has(f2Key);
      if (!f1InLegacy) missingFighterNames.set(`${lf.f1fn} ${lf.f1ln}`.trim(),
        { count: (missingFighterNames.get(`${lf.f1fn} ${lf.f1ln}`.trim())?.count || 0) + 1, inLegacyFightersTable: false });
      if (!f2InLegacy) missingFighterNames.set(`${lf.f2fn} ${lf.f2ln}`.trim(),
        { count: (missingFighterNames.get(`${lf.f2fn} ${lf.f2ln}`.trim())?.count || 0) + 1, inLegacyFightersTable: false });
    } else if (!hasF1) {
      fighter1Missing++;
      const f1InLegacy = legacyFighterSet.has(f1Key);
      const name = `${lf.f1fn} ${lf.f1ln}`.trim();
      if (!missingFighterNames.has(name)) {
        missingFighterNames.set(name, { count: 0, inLegacyFightersTable: f1InLegacy });
      }
      const entry = missingFighterNames.get(name);
      entry.count++;
    } else if (!hasF2) {
      fighter2Missing++;
      const f2InLegacy = legacyFighterSet.has(f2Key);
      const name = `${lf.f2fn} ${lf.f2ln}`.trim();
      if (!missingFighterNames.has(name)) {
        missingFighterNames.set(name, { count: 0, inLegacyFightersTable: f2InLegacy });
      }
      const entry = missingFighterNames.get(name);
      entry.count++;
    }

    // Track fights with ratings that were missed
    if (lf.numvotes > 0) {
      failedFightsWithRatings.push({
        id: lf.id,
        name: `${lf.f1fn} ${lf.f1ln} vs ${lf.f2fn} ${lf.f2ln}`,
        event: lf.eventname,
        date: eventDate,
        ratings: lf.numvotes,
        avgScore: lf.percentscore ? (lf.percentscore / 10).toFixed(1) : 'N/A',
        reason: !hasF1 && !hasF2 ? 'both-fighters-missing' :
                !hasF1 ? 'fighter1-missing' :
                !hasF2 ? 'fighter2-missing' :
                !hasEvent ? 'event-missing' : 'unknown',
        missingFighter: !hasF1 ? `${lf.f1fn} ${lf.f1ln}` : (!hasF2 ? `${lf.f2fn} ${lf.f2ln}` : null),
      });
    }
  }

  const totalFailed = fighter1Missing + fighter2Missing + bothFightersMissing + eventMissing + fighterAndEventMissing;

  console.log('FAILURE BREAKDOWN:');
  console.log(`  Already migrated:        ${alreadyMigrated}`);
  console.log(`  Would create (matches):  ${wouldCreate}`);
  console.log(`  --- FAILURES ---`);
  console.log(`  Fighter1 only missing:   ${fighter1Missing}`);
  console.log(`  Fighter2 only missing:   ${fighter2Missing}`);
  console.log(`  Both fighters missing:   ${bothFightersMissing}`);
  console.log(`  Event missing only:      ${eventMissing}`);
  console.log(`  Fighter+Event missing:   ${fighterAndEventMissing}`);
  console.log(`  TOTAL FAILED:            ${totalFailed}`);

  console.log('\nFAILURES BY PROMOTION:');
  const sortedPromos = [...failedFightsByPromotion.entries()].sort((a, b) => b[1] - a[1]);
  for (const [promo, count] of sortedPromos) {
    console.log(`  ${promo}: ${count} fights`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PART 3: Root cause - fighters in fights table but NOT in fighters table
  // ═══════════════════════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PART 3: ROOT CAUSE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check how many fighter names in fights table don't have entries in fighters table
  let fightsWithNoFighterRecord = 0;
  let fightsWhereF1NotInFightersTable = 0;
  let fightsWhereF2NotInFightersTable = 0;

  for (const lf of allLegacyFightsActive) {
    const f1Key = `${normalizeName(lf.f1fn)}|${normalizeName(lf.f1ln)}`;
    const f2Key = `${normalizeName(lf.f2fn)}|${normalizeName(lf.f2ln)}`;
    const f1InTable = legacyFighterSet.has(f1Key);
    const f2InTable = legacyFighterSet.has(f2Key);

    if (!f1InTable) fightsWhereF1NotInFightersTable++;
    if (!f2InTable) fightsWhereF2NotInFightersTable++;
    if (!f1InTable || !f2InTable) fightsWithNoFighterRecord++;
  }

  console.log('Fighter names in fights.f1fn/f2fn vs fighters table:');
  console.log(`  Fights where fighter1 NOT in fighters table: ${fightsWhereF1NotInFightersTable}`);
  console.log(`  Fights where fighter2 NOT in fighters table: ${fightsWhereF2NotInFightersTable}`);
  console.log(`  Fights where at least 1 fighter NOT in fighters table: ${fightsWithNoFighterRecord}`);
  console.log(`  (This is the ROOT CAUSE - fights reference names that don't exist in fighters table)`);

  console.log('\nTOP 30 MISSING FIGHTER NAMES (sorted by # affected fights):');
  const sortedMissing = [...missingFighterNames.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30);
  for (const [name, info] of sortedMissing) {
    const inLegacy = info.inLegacyFightersTable ? 'IN legacy fighters table' : 'NOT in legacy fighters table';
    console.log(`  "${name}" - ${info.count} fights (${inLegacy})`);
  }

  console.log('\nTOP 20 MISSING EVENT NAMES:');
  const sortedEvents = [...missingEventNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [name, count] of sortedEvents) {
    console.log(`  "${name}" - ${count} fights`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PART 4: Impact - missed ratings and reviews
  // ═══════════════════════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PART 4: IMPACT - LOST RATINGS & REVIEWS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  failedFightsWithRatings.sort((a, b) => b.ratings - a.ratings);
  const totalLostRatings = failedFightsWithRatings.reduce((sum, f) => sum + f.ratings, 0);

  console.log(`Missed fights that HAD ratings: ${failedFightsWithRatings.length}`);
  console.log(`Total lost ratings: ${totalLostRatings}`);

  console.log('\nTOP 30 MISSED FIGHTS BY RATING COUNT:');
  for (const f of failedFightsWithRatings.slice(0, 30)) {
    console.log(`  ${f.name} @ ${f.event} (${f.date})`);
    console.log(`    ${f.ratings} ratings, avg ${f.avgScore} - Reason: ${f.reason} (${f.missingFighter || ''})`);
  }

  // Count missed reviews
  console.log('\nChecking review tables for missed fights...');
  await connection.query('USE fightreviewsdb');
  let missedReviews = 0;
  const missedFightIds = new Set(failedFightsWithRatings.map(f => f.id));

  // Also get ALL fight IDs that failed (including those without ratings)
  const allFailedIds = new Set();
  for (const lf of allLegacyFightsActive) {
    const f1Key = `${normalizeName(lf.f1fn)}|${normalizeName(lf.f1ln)}`;
    const f2Key = `${normalizeName(lf.f2fn)}|${normalizeName(lf.f2ln)}`;
    if (!fighterMap.get(f1Key) || !fighterMap.get(f2Key)) {
      allFailedIds.add(lf.id);
    }
  }

  const [reviewTables] = await connection.query('SHOW TABLES');
  const tableKey = Object.keys(reviewTables[0])[0];
  let reviewTablesChecked = 0;

  for (const table of reviewTables) {
    const tableName = table[tableKey];
    const fightId = parseInt(tableName, 10);
    if (isNaN(fightId)) continue;
    if (!allFailedIds.has(fightId)) continue;

    try {
      const [reviews] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      missedReviews += reviews[0].cnt;
    } catch (e) {
      // skip
    }

    reviewTablesChecked++;
    if (reviewTablesChecked % 500 === 0) {
      console.log(`  Checked ${reviewTablesChecked} review tables...`);
    }
  }

  console.log(`\nTotal missed reviews (in review tables for failed fights): ${missedReviews}`);

  // ═══════════════════════════════════════════════════════════════
  // PART 5: Users check
  // ═══════════════════════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PART 5: USER MIGRATION CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await connection.query('USE fightdb');
  const [legacyUsers] = await connection.query(`SELECT id, emailaddress, displayname FROM users`);
  const newUsers = await prisma.user.findMany({ select: { id: true, email: true, displayName: true } });
  const newUserEmails = new Set(newUsers.map(u => u.email.toLowerCase()));

  const missingUsers = legacyUsers.filter(u => u.emailaddress && !newUserEmails.has(u.emailaddress.toLowerCase()));

  console.log(`Legacy users: ${legacyUsers.length}`);
  console.log(`New DB users: ${newUsers.length}`);
  console.log(`Missing users: ${missingUsers.length}`);

  if (missingUsers.length > 0) {
    console.log('\nMissing users:');
    for (const u of missingUsers.slice(0, 20)) {
      console.log(`  ${u.displayname || 'no-display-name'} (${u.emailaddress})`);
    }
    if (missingUsers.length > 20) {
      console.log(`  ... and ${missingUsers.length - 20} more`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PART 6: SUMMARY & RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('PART 6: SUMMARY & RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`CURRENT STATE:`);
  console.log(`  Legacy active fights:  ${allLegacyFightsActive.length}`);
  console.log(`  Already migrated:      ${alreadyMigrated}`);
  console.log(`  Failed to migrate:     ${totalFailed}`);
  console.log(`  Migration success:     ${((alreadyMigrated / allLegacyFightsActive.length) * 100).toFixed(1)}%`);
  console.log(`  Lost ratings:          ~${totalLostRatings}`);
  console.log(`  Lost reviews:          ~${missedReviews}`);
  console.log(`  Missing users:         ${missingUsers.length}`);

  console.log(`\nROOT CAUSE:`);
  console.log(`  The legacy fights table stores fighter names (f1fn/f1ln/f2fn/f2ln)`);
  console.log(`  that don't match the fighters table. The sync script can only`);
  console.log(`  create fights if BOTH fighters exist in the new DB, which requires`);
  console.log(`  them to exist in the legacy fighters table first.`);
  console.log(`  `);
  console.log(`  FIX: Instead of requiring fighters to pre-exist, CREATE fighters`);
  console.log(`  on-the-fly from the fight record names when they don't match.`);

  console.log(`\nRECOMMENDED APPROACH:`);
  console.log(`  1. Write a "fill-missing" script that:`);
  console.log(`     a) For each failed fight, creates missing fighters from f1fn/f1ln/f2fn/f2ln`);
  console.log(`     b) Creates missing events from eventname/date`);
  console.log(`     c) Creates the fight record`);
  console.log(`     d) Syncs ratings, reviews, and tags for the newly created fights`);
  console.log(`  2. This is ADDITIVE - no need to wipe existing data`);
  console.log(`  3. Run update-rating-stats.js after to recalculate averages`);

  await connection.end();
  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
