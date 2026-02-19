#!/usr/bin/env node
/**
 * fill-missing-ufc-ratings.js
 *
 * Syncs ratings, reviews, and tags for UFC fights that were filled in by
 * fill-missing-ufc.js. Builds the legacy->new fight mapping fresh from
 * both databases, then syncs all associated data.
 *
 * USAGE:
 *   node fill-missing-ufc-ratings.js --dry-run
 *   node fill-missing-ufc-ratings.js
 */

const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');

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

function stripDiacritics(name) {
  if (!name) return '';
  return name
    .replace(/[ł]/g, 'l').replace(/[Ł]/g, 'L')
    .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'D')
    .replace(/[ø]/g, 'o').replace(/[Ø]/g, 'O')
    .replace(/[æ]/g, 'ae').replace(/[Æ]/g, 'Ae')
    .replace(/[ß]/g, 'ss').replace(/[ẞ]/g, 'Ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

async function run() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     SYNC RATINGS/REVIEWS/TAGS FOR UFC FIGHTS                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('  DRY RUN MODE\n');

  // ── Build legacy fight ID -> new fight ID mapping ──────────────
  console.log('Building fight ID mapping from both databases...\n');

  const conn = await mysql.createConnection({ ...MYSQL_CONFIG, database: 'fightdb' });

  const [legacyFights] = await conn.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date
    FROM fights WHERE deleted = 0 AND promotion = 'UFC'
  `);
  console.log(`  Legacy UFC fights: ${legacyFights.length}`);

  // Get new DB data
  const fighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true }
  });
  const fighterMap = new Map();
  for (const f of fighters) {
    fighterMap.set(`${normalizeName(f.firstName)}|${normalizeName(f.lastName)}`, f.id);
  }

  const events = await prisma.event.findMany({
    select: { id: true, name: true, date: true }
  });
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
  console.log(`  New DB: ${fighters.length} fighters, ${events.length} events, ${newFights.length} fights`);

  // Build the mapping
  const legacyToNew = new Map();
  let mapped = 0, unmapped = 0;

  for (const lf of legacyFights) {
    const f1Key = `${normalizeName(lf.f1fn)}|${normalizeName(lf.f1ln)}`;
    const f2Key = `${normalizeName(lf.f2fn)}|${normalizeName(lf.f2ln)}`;
    const fighter1Id = fighterMap.get(f1Key);
    const fighter2Id = fighterMap.get(f2Key);
    if (!fighter1Id || !fighter2Id) { unmapped++; continue; }

    // Build event display name the same way fill-missing-ufc.js does
    const rawEventName = (lf.eventname || '').trim();
    let eventDisplayName = rawEventName;
    if (/^\d+$/.test(rawEventName)) {
      eventDisplayName = `UFC ${rawEventName}`;
    } else if (!rawEventName.toLowerCase().startsWith('ufc')) {
      eventDisplayName = `UFC ${rawEventName}`;
    }

    const parsedDate = lf.date ? new Date(lf.date) : null;
    if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 1990) {
      unmapped++;
      continue;
    }
    const dateStr = parsedDate.toISOString().split('T')[0];

    // Try multiple event name variations
    let eventId = eventMap.get(`${normalizeName(eventDisplayName)}|${dateStr}`)
               || eventMap.get(`${normalizeName(rawEventName)}|${dateStr}`);

    // Try +/- 1 day
    if (!eventId) {
      const dayBefore = new Date(parsedDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(parsedDate);
      dayAfter.setDate(dayAfter.getDate() + 1);
      const db = dayBefore.toISOString().split('T')[0];
      const da = dayAfter.toISOString().split('T')[0];
      eventId = eventMap.get(`${normalizeName(eventDisplayName)}|${db}`)
             || eventMap.get(`${normalizeName(eventDisplayName)}|${da}`)
             || eventMap.get(`${normalizeName(rawEventName)}|${db}`)
             || eventMap.get(`${normalizeName(rawEventName)}|${da}`);
    }

    if (!eventId) { unmapped++; continue; }

    const fk1 = `${fighter1Id}|${fighter2Id}|${eventId}`;
    const fk2 = `${fighter2Id}|${fighter1Id}|${eventId}`;
    const newFightId = fightLookup.get(fk1) || fightLookup.get(fk2);
    if (!newFightId) { unmapped++; continue; }

    // lf.id might be a number or BigInt - ensure consistent key type
    legacyToNew.set(Number(lf.id), newFightId);
    mapped++;
  }

  console.log(`  Mapped: ${mapped}, Unmapped: ${unmapped}\n`);

  // Debug: show a few sample mappings
  let sampleCount = 0;
  for (const [legacyId, newId] of legacyToNew) {
    if (sampleCount++ >= 5) break;
    console.log(`  Sample mapping: legacy ${legacyId} (type: ${typeof legacyId}) -> ${newId}`);
  }

  await conn.end();

  // ═══════════════════════════════════════════════════════════════
  // SYNC RATINGS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── SYNCING RATINGS ──');

  const ratingConn = await mysql.createConnection(MYSQL_CONFIG);

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`  Users: ${users.length}`);

  const existingRatings = await prisma.fightRating.findMany({
    select: { fightId: true, userId: true }
  });
  const existingRatingKeys = new Set(existingRatings.map(r => `${r.fightId}|${r.userId}`));
  console.log(`  Existing ratings: ${existingRatings.length}`);

  const ratingsToCreate = [];
  let ratingsSkipped = 0;
  let usersWithRatings = 0;
  let processed = 0;

  for (const user of users) {
    const emailMd5 = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
    try {
      await ratingConn.query('USE userfightratings');
      const [ratings] = await ratingConn.query(`SELECT * FROM \`${emailMd5}\``);
      if (ratings.length === 0) { processed++; continue; }

      let userHasNew = false;
      for (const rating of ratings) {
        const legacyFightId = parseInt(rating.fightid, 10);
        const newFightId = legacyToNew.get(legacyFightId);
        if (!newFightId) continue;

        const key = `${newFightId}|${user.id}`;
        if (existingRatingKeys.has(key)) {
          ratingsSkipped++;
          continue;
        }

        let createdAt = new Date();
        if (rating.time_of_rating) {
          const parsed = new Date(rating.time_of_rating);
          if (!isNaN(parsed.getTime())) createdAt = parsed;
        }

        ratingsToCreate.push({
          fightId: newFightId,
          userId: user.id,
          rating: rating.score,
          createdAt,
        });
        existingRatingKeys.add(key);
        userHasNew = true;
      }
      if (userHasNew) usersWithRatings++;
    } catch (e) {
      // Table doesn't exist - normal
    }
    processed++;
    if (processed % 300 === 0) {
      console.log(`    Processed ${processed}/${users.length} users (${ratingsToCreate.length} new ratings so far)...`);
    }
  }

  console.log(`  Users with new ratings: ${usersWithRatings}`);
  console.log(`  New ratings to create: ${ratingsToCreate.length} (${ratingsSkipped} already exist)`);

  if (!DRY_RUN && ratingsToCreate.length > 0) {
    let created = 0;
    const chunkSize = 1000;
    for (let i = 0; i < ratingsToCreate.length; i += chunkSize) {
      const chunk = ratingsToCreate.slice(i, i + chunkSize);
      try {
        const result = await prisma.fightRating.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        created += result.count;
      } catch (e) {
        console.log(`    Chunk error: ${e.message.split('\n')[0]}`);
      }
    }
    console.log(`  Ratings created: ${created}`);
  }

  await ratingConn.end();

  // ═══════════════════════════════════════════════════════════════
  // SYNC REVIEWS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── SYNCING REVIEWS ──');

  const reviewConn = await mysql.createConnection(MYSQL_CONFIG);

  const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]));

  const existingReviews = await prisma.fightReview.findMany({
    select: { userId: true, fightId: true, content: true }
  });
  const existingReviewKeys = new Set(
    existingReviews.map(r => `${r.userId}|${r.fightId}|${normalizeName(r.content?.substring(0, 50) || '')}`)
  );
  console.log(`  Existing reviews: ${existingReviews.length}`);

  await reviewConn.query('USE fightreviewsdb');
  const [tables] = await reviewConn.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  console.log(`  Review tables to check: ${tables.length}`);

  let reviewsCreated = 0;
  let reviewsSkipped = 0;
  let tablesProcessed = 0;

  for (const table of tables) {
    const tableName = table[tableKey];
    const legacyFightId = parseInt(tableName, 10);
    if (isNaN(legacyFightId)) continue;

    const newFightId = legacyToNew.get(legacyFightId);
    if (!newFightId) continue;

    try {
      const [columns] = await reviewConn.query(`DESCRIBE \`${tableName}\``);
      if (!columns.some(c => c.Field === 'comment')) continue;

      const [reviews] = await reviewConn.query(`SELECT * FROM \`${tableName}\``);
      for (const review of reviews) {
        const email = (review.commenteremail || '').toLowerCase().trim();
        const userId = userByEmail.get(email);
        if (!userId) continue;

        const reviewKey = `${userId}|${newFightId}|${normalizeName(review.comment?.substring(0, 50) || '')}`;
        if (existingReviewKeys.has(reviewKey)) {
          reviewsSkipped++;
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
                createdAt: review.date ? new Date(review.date * 1000) : new Date(),
              }
            });
            reviewsCreated++;
            existingReviewKeys.add(reviewKey);
          } catch (e) {
            // skip
          }
        } else {
          reviewsCreated++;
        }
      }
    } catch (e) {
      // skip
    }

    tablesProcessed++;
    if (tablesProcessed % 2000 === 0) {
      console.log(`    Processed ${tablesProcessed}/${tables.length} tables...`);
    }
  }

  console.log(`  Reviews created: ${reviewsCreated}, skipped: ${reviewsSkipped}`);

  await reviewConn.end();

  // ═══════════════════════════════════════════════════════════════
  // SYNC TAGS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── SYNCING TAGS ──');

  const LEGACY_TAG_MAPPING_PATH = __dirname + '/../legacy-tag-mapping.json';
  let legacyTagMapping = {};
  try {
    legacyTagMapping = JSON.parse(fs.readFileSync(LEGACY_TAG_MAPPING_PATH, 'utf8'));
  } catch (e) {
    console.log('  No tag mapping found - skipping tags');
  }

  if (Object.keys(legacyTagMapping).length > 0) {
    const tagConn = await mysql.createConnection(MYSQL_CONFIG);

    const existingTags = await prisma.fightTag.findMany({
      select: { userId: true, fightId: true, tagId: true }
    });
    const existingTagKeys = new Set(existingTags.map(t => `${t.userId}|${t.fightId}|${t.tagId}`));
    console.log(`  Existing tags: ${existingTags.length}`);

    const tagsToCreate = [];
    let tagUsersProcessed = 0;

    for (const user of users) {
      const emailMd5 = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
      try {
        await tagConn.query('USE userfighttags');
        const [tags] = await tagConn.query(`SELECT * FROM \`${emailMd5}\``);
        for (const tag of tags) {
          const legacyFightId = parseInt(tag.fightid, 10);
          const newFightId = legacyToNew.get(legacyFightId);
          if (!newFightId) continue;

          const newTagId = legacyTagMapping[tag.tagid];
          if (!newTagId) continue;

          const key = `${user.id}|${newFightId}|${newTagId}`;
          if (existingTagKeys.has(key)) continue;

          tagsToCreate.push({ userId: user.id, fightId: newFightId, tagId: newTagId });
          existingTagKeys.add(key);
        }
      } catch (e) {
        // Table doesn't exist
      }
      tagUsersProcessed++;
      if (tagUsersProcessed % 300 === 0) {
        console.log(`    Processed ${tagUsersProcessed}/${users.length} users (${tagsToCreate.length} new tags)...`);
      }
    }

    console.log(`  New tags to create: ${tagsToCreate.length}`);

    if (!DRY_RUN && tagsToCreate.length > 0) {
      try {
        const created = await prisma.fightTag.createMany({
          data: tagsToCreate,
          skipDuplicates: true,
        });
        console.log(`  Tags created: ${created.count}`);
      } catch (e) {
        console.log(`  Tag error: ${e.message.split('\n')[0]}`);
      }
    }

    await tagConn.end();
  }

  // ═══════════════════════════════════════════════════════════════
  // ALSO: Sync the 1 missing user
  // ═══════════════════════════════════════════════════════════════
  console.log('\n── CHECKING MISSING USERS ──');
  const userConn = await mysql.createConnection({ ...MYSQL_CONFIG, database: 'fightdb' });
  const [legacyUsers] = await userConn.query(`SELECT id, emailaddress, displayname, ismedia, mediaorganization FROM users`);
  const existingEmails = new Set((await prisma.user.findMany({ select: { email: true } })).map(u => u.email.toLowerCase()));

  let usersCreated = 0;
  for (const lu of legacyUsers) {
    const email = (lu.emailaddress || '').toLowerCase().trim();
    if (!email || existingEmails.has(email)) continue;

    if (!DRY_RUN) {
      try {
        await prisma.user.create({
          data: {
            email,
            displayName: lu.displayname || null,
            password: null,
            isMedia: !!lu.ismedia,
            mediaOrganization: lu.mediaorganization || null,
            emailVerified: true,
            isEmailVerified: true,
          }
        });
        usersCreated++;
      } catch (e) {
        // skip
      }
    } else {
      usersCreated++;
    }
  }
  console.log(`  Missing users created: ${usersCreated}`);
  await userConn.end();

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                         COMPLETE                               ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Fight mappings:     ${String(legacyToNew.size).padStart(6)}                                  ║`);
  console.log(`║  Ratings created:    ${String(ratingsToCreate.length).padStart(6)}                                  ║`);
  console.log(`║  Reviews created:    ${String(reviewsCreated).padStart(6)}                                  ║`);
  console.log(`║  Users created:      ${String(usersCreated).padStart(6)}                                  ║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Next: node update-rating-stats.js                             ║');
  console.log('║        node scripts/legacy-migration/update-user-stats.js      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
