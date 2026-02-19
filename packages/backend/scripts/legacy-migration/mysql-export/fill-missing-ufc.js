#!/usr/bin/env node
/**
 * fill-missing-ufc.js
 *
 * ADDITIVE script - fills in UFC fights that were missed by the original migration.
 * Does NOT wipe anything. Creates missing fighters, events, and fights on the fly.
 * Then syncs ratings, reviews, and tags for the newly created fights.
 *
 * USAGE:
 *   node fill-missing-ufc.js --dry-run    # Preview without changes
 *   node fill-missing-ufc.js              # Execute
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
};

const BASE_IMAGE_URL = 'https://fightingtomatoes.com/';
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

const WEIGHT_CLASS_MAP = {
  'strawweight': 'STRAWWEIGHT',
  'flyweight': 'FLYWEIGHT',
  'bantamweight': 'BANTAMWEIGHT',
  'featherweight': 'FEATHERWEIGHT',
  'lightweight': 'LIGHTWEIGHT',
  'welterweight': 'WELTERWEIGHT',
  'middleweight': 'MIDDLEWEIGHT',
  'light heavyweight': 'LIGHT_HEAVYWEIGHT',
  'heavyweight': 'HEAVYWEIGHT',
  'super heavyweight': 'SUPER_HEAVYWEIGHT',
  "women's strawweight": 'WOMENS_STRAWWEIGHT',
  "women's flyweight": 'WOMENS_FLYWEIGHT',
  "women's bantamweight": 'WOMENS_BANTAMWEIGHT',
  "women's featherweight": 'WOMENS_FEATHERWEIGHT',
};

function mapWeightClass(legacy) {
  if (!legacy) return null;
  return WEIGHT_CLASS_MAP[legacy.toLowerCase().trim()] || null;
}

// ============================================================================
// MAIN
// ============================================================================

async function fillMissingUFC() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       FILL MISSING UFC FIGHTS (ADDITIVE)                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('  🔍 DRY RUN MODE\n');

  const connection = await mysql.createConnection(MYSQL_CONFIG);
  console.log('Connected to legacy MySQL.\n');

  // ── Step 1: Load all legacy UFC fights ──────────────────────────
  await connection.query('USE fightdb');
  const [legacyFights] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion, date,
           winner, method, round, time, weightclass, istitle,
           orderoncard, prelimcode, hasstarted, percentscore, numvotes
    FROM fights WHERE deleted = 0 AND promotion = 'UFC'
    ORDER BY date ASC
  `);
  console.log(`Legacy UFC fights: ${legacyFights.length}`);

  // ── Step 2: Load new DB state ──────────────────────────────────
  const allFighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true }
  });
  // Normalized key -> fighter id (keep first match)
  const fighterMap = new Map();
  for (const f of allFighters) {
    const key = `${normalizeName(f.firstName)}|${normalizeName(f.lastName)}`;
    if (!fighterMap.has(key)) fighterMap.set(key, f.id);
  }
  console.log(`New DB fighters: ${allFighters.length}`);

  const allEvents = await prisma.event.findMany({
    select: { id: true, name: true, date: true, promotion: true }
  });
  // Build multiple lookup keys for events
  const eventMap = new Map(); // normalized_name|date -> id
  for (const e of allEvents) {
    const dateStr = e.date.toISOString().split('T')[0];
    eventMap.set(`${normalizeName(e.name)}|${dateStr}`, e.id);
  }
  console.log(`New DB events: ${allEvents.length}`);

  const existingFights = await prisma.fight.findMany({
    select: { id: true, fighter1Id: true, fighter2Id: true, eventId: true }
  });
  const existingFightSet = new Set();
  for (const f of existingFights) {
    existingFightSet.add(`${f.fighter1Id}|${f.fighter2Id}|${f.eventId}`);
    existingFightSet.add(`${f.fighter2Id}|${f.fighter1Id}|${f.eventId}`);
  }
  console.log(`New DB fights: ${existingFights.length}`);

  // ── Step 3: Process each legacy UFC fight ──────────────────────
  const stats = {
    alreadyExists: 0,
    created: 0,
    fighterCreated: 0,
    eventCreated: 0,
    skippedNoDate: 0,
    skippedNoName: 0,
    errors: 0,
  };

  const newFightMappings = new Map(); // legacyId -> newFightId
  const eventsCreatedThisRun = new Map(); // normalized_name|date -> id

  for (let i = 0; i < legacyFights.length; i++) {
    const lf = legacyFights[i];
    const f1fn = (lf.f1fn || '').trim();
    const f1ln = (lf.f1ln || '').trim();
    const f2fn = (lf.f2fn || '').trim();
    const f2ln = (lf.f2ln || '').trim();
    const rawEventName = (lf.eventname || '').trim();

    // Skip fights with no date or invalid date
    const parsedDate = lf.date ? new Date(lf.date) : null;
    if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 1990) {
      stats.skippedNoDate++;
      continue;
    }

    // Skip fights with no fighter names
    if ((!f1fn && !f1ln) || (!f2fn && !f2ln)) {
      stats.skippedNoName++;
      continue;
    }

    const dateStr = parsedDate.toISOString().split('T')[0];

    // ── Find or create Fighter 1 ──
    const f1Key = `${normalizeName(f1fn)}|${normalizeName(f1ln)}`;
    let fighter1Id = fighterMap.get(f1Key);
    if (!fighter1Id) {
      if (!DRY_RUN) {
        try {
          const newFighter = await prisma.fighter.create({
            data: {
              firstName: stripDiacritics(f1fn),
              lastName: stripDiacritics(f1ln),
              gender: lf.weightclass?.toLowerCase().includes("women") ? 'FEMALE' : 'MALE',
            }
          });
          fighter1Id = newFighter.id;
          fighterMap.set(f1Key, fighter1Id);
          stats.fighterCreated++;
        } catch (e) {
          // Might hit unique constraint - try to find it
          const existing = await prisma.fighter.findFirst({
            where: {
              firstName: { equals: stripDiacritics(f1fn), mode: 'insensitive' },
              lastName: { equals: stripDiacritics(f1ln), mode: 'insensitive' },
            }
          });
          if (existing) {
            fighter1Id = existing.id;
            fighterMap.set(f1Key, fighter1Id);
          } else {
            stats.errors++;
            continue;
          }
        }
      } else {
        fighter1Id = `dry-run-${f1Key}`;
        fighterMap.set(f1Key, fighter1Id);
        stats.fighterCreated++;
      }
    }

    // ── Find or create Fighter 2 ──
    const f2Key = `${normalizeName(f2fn)}|${normalizeName(f2ln)}`;
    let fighter2Id = fighterMap.get(f2Key);
    if (!fighter2Id) {
      if (!DRY_RUN) {
        try {
          const newFighter = await prisma.fighter.create({
            data: {
              firstName: stripDiacritics(f2fn),
              lastName: stripDiacritics(f2ln),
              gender: lf.weightclass?.toLowerCase().includes("women") ? 'FEMALE' : 'MALE',
            }
          });
          fighter2Id = newFighter.id;
          fighterMap.set(f2Key, fighter2Id);
          stats.fighterCreated++;
        } catch (e) {
          const existing = await prisma.fighter.findFirst({
            where: {
              firstName: { equals: stripDiacritics(f2fn), mode: 'insensitive' },
              lastName: { equals: stripDiacritics(f2ln), mode: 'insensitive' },
            }
          });
          if (existing) {
            fighter2Id = existing.id;
            fighterMap.set(f2Key, fighter2Id);
          } else {
            stats.errors++;
            continue;
          }
        }
      } else {
        fighter2Id = `dry-run-${f2Key}`;
        fighterMap.set(f2Key, fighter2Id);
        stats.fighterCreated++;
      }
    }

    // ── Find or create Event ──
    // Build the DISPLAY name for the event from the raw legacy data
    let eventDisplayName = rawEventName;
    if (/^\d+$/.test(rawEventName)) {
      eventDisplayName = `UFC ${rawEventName}`;
    } else if (!rawEventName.toLowerCase().startsWith('ufc')) {
      // Prefix UFC if not already there
      eventDisplayName = `UFC ${rawEventName}`;
    }

    const eventNormKey = `${normalizeName(eventDisplayName)}|${dateStr}`;
    let eventId = eventMap.get(eventNormKey) || eventsCreatedThisRun.get(eventNormKey);

    // Also try matching by raw event name (without our prefix)
    if (!eventId) {
      const altKey = `${normalizeName(rawEventName)}|${dateStr}`;
      eventId = eventMap.get(altKey);
    }

    // Try fuzzy date match (+/- 1 day) for events that might have timezone offset
    if (!eventId) {
      const dayBefore = new Date(parsedDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(parsedDate);
      dayAfter.setDate(dayAfter.getDate() + 1);
      const dateBefore = dayBefore.toISOString().split('T')[0];
      const dateAfter = dayAfter.toISOString().split('T')[0];

      eventId = eventMap.get(`${normalizeName(eventDisplayName)}|${dateBefore}`)
             || eventMap.get(`${normalizeName(eventDisplayName)}|${dateAfter}`)
             || eventMap.get(`${normalizeName(rawEventName)}|${dateBefore}`)
             || eventMap.get(`${normalizeName(rawEventName)}|${dateAfter}`);
    }

    if (!eventId) {
      if (!DRY_RUN) {
        try {
          const newEvent = await prisma.event.create({
            data: {
              name: stripDiacritics(eventDisplayName),
              promotion: 'UFC',
              date: parsedDate,
              isComplete: true,
            }
          });
          eventId = newEvent.id;
          eventMap.set(eventNormKey, eventId);
          eventsCreatedThisRun.set(eventNormKey, eventId);
          stats.eventCreated++;
        } catch (e) {
          // Might hit unique constraint
          const existing = await prisma.event.findFirst({
            where: {
              name: { equals: stripDiacritics(eventDisplayName), mode: 'insensitive' },
              date: parsedDate,
            }
          });
          if (existing) {
            eventId = existing.id;
            eventMap.set(eventNormKey, eventId);
          } else {
            stats.errors++;
            continue;
          }
        }
      } else {
        eventId = `dry-run-event-${eventNormKey}`;
        eventMap.set(eventNormKey, eventId);
        eventsCreatedThisRun.set(eventNormKey, eventId);
        stats.eventCreated++;
      }
    }

    // ── Check if fight already exists ──
    const fightKey = `${fighter1Id}|${fighter2Id}|${eventId}`;
    const fightKeyR = `${fighter2Id}|${fighter1Id}|${eventId}`;
    if (existingFightSet.has(fightKey) || existingFightSet.has(fightKeyR)) {
      stats.alreadyExists++;
      // Still build the mapping for ratings sync
      const existing = existingFights.find(f =>
        (f.fighter1Id === fighter1Id && f.fighter2Id === fighter2Id && f.eventId === eventId) ||
        (f.fighter1Id === fighter2Id && f.fighter2Id === fighter1Id && f.eventId === eventId)
      );
      if (existing) newFightMappings.set(lf.id, existing.id);
      continue;
    }

    // ── Determine winner ──
    let winnerId = null;
    if (lf.winner === 'fighter1') winnerId = fighter1Id;
    else if (lf.winner === 'fighter2') winnerId = fighter2Id;
    else if (lf.winner === 'draw') winnerId = 'draw';
    else if (lf.winner === 'nc') winnerId = 'nc';

    // ── Create fight ──
    if (!DRY_RUN) {
      try {
        const newFight = await prisma.fight.create({
          data: {
            eventId,
            fighter1Id,
            fighter2Id,
            weightClass: mapWeightClass(lf.weightclass),
            isTitle: !!lf.istitle,
            orderOnCard: lf.orderoncard || 99,
            winner: winnerId,
            method: lf.method || null,
            round: lf.round ? parseInt(lf.round) : null,
            time: lf.time || null,
            hasStarted: !!lf.hasstarted || parsedDate < new Date(),
            isComplete: !!lf.winner || parsedDate < new Date(),
            averageRating: lf.percentscore ? parseFloat(lf.percentscore) / 10 : 0,
            totalRatings: lf.numvotes || 0,
          }
        });
        newFightMappings.set(lf.id, newFight.id);
        existingFightSet.add(fightKey);
        stats.created++;
      } catch (e) {
        stats.errors++;
        if (stats.errors <= 10) {
          console.log(`  Error creating fight: ${f1fn} ${f1ln} vs ${f2fn} ${f2ln} @ ${eventDisplayName}: ${e.message.split('\n')[0]}`);
        }
      }
    } else {
      newFightMappings.set(lf.id, `dry-run-fight-${lf.id}`);
      stats.created++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${legacyFights.length} fights...`);
    }
  }

  console.log('\n── FIGHT CREATION RESULTS ──');
  console.log(`  Already existed:     ${stats.alreadyExists}`);
  console.log(`  Fights created:      ${stats.created}`);
  console.log(`  Fighters created:    ${stats.fighterCreated}`);
  console.log(`  Events created:      ${stats.eventCreated}`);
  console.log(`  Skipped (no date):   ${stats.skippedNoDate}`);
  console.log(`  Skipped (no name):   ${stats.skippedNoName}`);
  console.log(`  Errors:              ${stats.errors}`);
  console.log(`  New fight mappings:  ${newFightMappings.size}`);

  // ── Step 4: Reverse fight order for newly created events ──
  if (!DRY_RUN && stats.created > 0) {
    console.log('\n  Reversing fight order for new events...');
    const createdEventIds = [...new Set([...eventsCreatedThisRun.values()])];
    for (const eid of createdEventIds) {
      try {
        await prisma.$executeRaw`
          UPDATE fights f
          SET "orderOnCard" = sub.max_order - f."orderOnCard" + 1
          FROM (
            SELECT "eventId", MAX("orderOnCard") as max_order
            FROM fights
            WHERE "eventId" = ${eid}
            GROUP BY "eventId"
            HAVING COUNT(*) > 1
          ) sub
          WHERE f."eventId" = sub."eventId"
          AND f."eventId" = ${eid}
        `;
      } catch (e) {
        // ignore
      }
    }
    console.log(`  Done for ${createdEventIds.length} events.`);
  }

  // ── Step 5: Sync ratings for new fights ────────────────────────
  if (!DRY_RUN && newFightMappings.size > 0) {
    console.log('\n── SYNCING RATINGS ──');

    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    console.log(`  Users in new DB: ${users.length}`);

    const existingRatings = await prisma.fightRating.findMany({
      select: { fightId: true, userId: true }
    });
    const existingRatingKeys = new Set(existingRatings.map(r => `${r.fightId}|${r.userId}`));

    let ratingsCreated = 0;
    let ratingsSkipped = 0;
    let ratingsErrors = 0;
    const ratingsToCreate = [];

    let processed = 0;
    for (const user of users) {
      const emailMd5 = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
      try {
        await connection.query('USE userfightratings');
        const [ratings] = await connection.query(`SELECT * FROM \`${emailMd5}\``);
        for (const rating of ratings) {
          const legacyFightId = parseInt(rating.fightid, 10);
          const newFightId = newFightMappings.get(legacyFightId);
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
        }
      } catch (e) {
        // Table doesn't exist - normal
      }
      processed++;
      if (processed % 300 === 0) {
        console.log(`    Processed ${processed}/${users.length} users...`);
      }
    }

    console.log(`  Found ${ratingsToCreate.length} ratings to create (${ratingsSkipped} already exist)`);

    // Batch create
    const chunkSize = 1000;
    for (let i = 0; i < ratingsToCreate.length; i += chunkSize) {
      const chunk = ratingsToCreate.slice(i, i + chunkSize);
      try {
        const created = await prisma.fightRating.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        ratingsCreated += created.count;
      } catch (e) {
        ratingsErrors += chunk.length;
      }
    }

    console.log(`  Ratings created: ${ratingsCreated}, errors: ${ratingsErrors}`);
  }

  // ── Step 6: Sync reviews for new fights ────────────────────────
  if (!DRY_RUN && newFightMappings.size > 0) {
    console.log('\n── SYNCING REVIEWS ──');

    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]));

    const existingReviews = await prisma.fightReview.findMany({
      select: { userId: true, fightId: true, content: true }
    });
    const existingReviewKeys = new Set(
      existingReviews.map(r => `${r.userId}|${r.fightId}|${normalizeName(r.content?.substring(0, 50) || '')}`)
    );

    let reviewsCreated = 0;
    let reviewsSkipped = 0;

    await connection.query('USE fightreviewsdb');
    const [tables] = await connection.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];

    let processed = 0;
    for (const table of tables) {
      const tableName = table[tableKey];
      const legacyFightId = parseInt(tableName, 10);
      if (isNaN(legacyFightId)) continue;

      const newFightId = newFightMappings.get(legacyFightId);
      if (!newFightId) continue;

      try {
        const [columns] = await connection.query(`DESCRIBE \`${tableName}\``);
        if (!columns.some(c => c.Field === 'comment')) continue;

        const [reviews] = await connection.query(`SELECT * FROM \`${tableName}\``);
        for (const review of reviews) {
          const email = (review.commenteremail || '').toLowerCase().trim();
          const userId = userByEmail.get(email);
          if (!userId) continue;

          const reviewKey = `${userId}|${newFightId}|${normalizeName(review.comment?.substring(0, 50) || '')}`;
          if (existingReviewKeys.has(reviewKey)) {
            reviewsSkipped++;
            continue;
          }

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
        }
      } catch (e) {
        // skip
      }

      processed++;
      if (processed % 2000 === 0) {
        console.log(`    Processed ${processed}/${tables.length} review tables...`);
      }
    }

    console.log(`  Reviews created: ${reviewsCreated}, skipped: ${reviewsSkipped}`);
  }

  // ── Step 7: Sync tags for new fights ───────────────────────────
  if (!DRY_RUN && newFightMappings.size > 0) {
    console.log('\n── SYNCING TAGS ──');

    const LEGACY_TAG_MAPPING_PATH = __dirname + '/../legacy-tag-mapping.json';
    let legacyTagMapping = {};
    try {
      legacyTagMapping = JSON.parse(fs.readFileSync(LEGACY_TAG_MAPPING_PATH, 'utf8'));
    } catch (e) {
      console.log('  No tag mapping found - skipping tags');
    }

    if (Object.keys(legacyTagMapping).length > 0) {
      const users = await prisma.user.findMany({ select: { id: true, email: true } });
      const existingTags = await prisma.fightTag.findMany({
        select: { userId: true, fightId: true, tagId: true }
      });
      const existingTagKeys = new Set(existingTags.map(t => `${t.userId}|${t.fightId}|${t.tagId}`));

      let tagsCreated = 0;
      const tagsToCreate = [];

      for (const user of users) {
        const emailMd5 = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
        try {
          await connection.query('USE userfighttags');
          const [tags] = await connection.query(`SELECT * FROM \`${emailMd5}\``);
          for (const tag of tags) {
            const legacyFightId = parseInt(tag.fightid, 10);
            const newFightId = newFightMappings.get(legacyFightId);
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
      }

      if (tagsToCreate.length > 0) {
        try {
          const created = await prisma.fightTag.createMany({
            data: tagsToCreate,
            skipDuplicates: true,
          });
          tagsCreated = created.count;
        } catch (e) {
          console.log(`  Tag batch create error: ${e.message.split('\n')[0]}`);
        }
      }

      console.log(`  Tags created: ${tagsCreated}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    FILL MISSING UFC COMPLETE                   ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Fights created:     ${String(stats.created).padStart(6)}                                  ║`);
  console.log(`║  Fighters created:   ${String(stats.fighterCreated).padStart(6)}                                  ║`);
  console.log(`║  Events created:     ${String(stats.eventCreated).padStart(6)}                                  ║`);
  console.log(`║  Already existed:    ${String(stats.alreadyExists).padStart(6)}                                  ║`);
  console.log(`║  Errors:             ${String(stats.errors).padStart(6)}                                  ║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Next steps:                                                   ║');
  console.log('║    cd ../.. && node update-rating-stats.js                     ║');
  console.log('║    node scripts/legacy-migration/update-user-stats.js          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  await connection.end();
  await prisma.$disconnect();
}

fillMissingUFC().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
