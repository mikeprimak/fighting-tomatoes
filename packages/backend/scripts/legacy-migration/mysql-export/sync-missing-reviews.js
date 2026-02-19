/**
 * sync-missing-reviews.js
 *
 * OPTIMIZED: First gets all legacy reviews, then matches to new DB fights.
 */

const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const mysqlConfig = {
  host: '216.69.165.113',
  port: 3306,
  user: 'fotnadmin',
  password: 'HungryMonkey12',
};

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

async function syncMissingReviews() {
  console.log('='.repeat(60));
  console.log('SYNC MISSING REVIEWS FROM LEGACY (OPTIMIZED)');
  console.log('='.repeat(60));
  console.log('');

  const connection = await mysql.createConnection(mysqlConfig);

  // Step 1: Get ALL legacy reviews first (this is faster than checking each fight)
  console.log('Step 1: Loading all legacy reviews...');
  await connection.query('USE fightreviewsdb');

  const [tables] = await connection.query('SHOW TABLES');
  const tableKey = Object.keys(tables[0])[0];
  console.log(`  Found ${tables.length} review tables`);

  const legacyReviews = []; // { legacyFightId, reviews: [...] }
  let tablesWithReviews = 0;

  for (let i = 0; i < tables.length; i++) {
    const tableName = tables[i][tableKey];
    const legacyFightId = parseInt(tableName, 10);
    if (isNaN(legacyFightId)) continue;

    try {
      const [columns] = await connection.query(`DESCRIBE \`${tableName}\``);
      if (!columns.some(c => c.Field === 'comment')) continue;

      const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
      if (rows.length > 0) {
        tablesWithReviews++;
        legacyReviews.push({ legacyFightId, reviews: rows });
      }
    } catch (e) {
      // Skip
    }

    if ((i + 1) % 2000 === 0) {
      console.log(`  Checked ${i + 1}/${tables.length} tables, found ${tablesWithReviews} with reviews`);
    }
  }

  console.log(`  Total: ${tablesWithReviews} fights have reviews (${legacyReviews.reduce((sum, r) => sum + r.reviews.length, 0)} total reviews)`);

  // Step 2: Get legacy fight info for fights with reviews
  console.log('\nStep 2: Loading legacy fight info...');
  await connection.query('USE fightdb');

  const legacyFightIds = legacyReviews.map(r => r.legacyFightId);
  const [legacyFights] = await connection.query(`
    SELECT id, f1fn, f1ln, f2fn, f2ln, eventname, promotion
    FROM fights
    WHERE id IN (${legacyFightIds.join(',')})
  `);

  const legacyFightMap = new Map(legacyFights.map(f => [f.id, f]));
  console.log(`  Loaded info for ${legacyFights.length} fights`);

  // Step 3: Get new DB fights and create matching lookup
  console.log('\nStep 3: Loading new DB fights...');
  const newFights = await prisma.fight.findMany({
    include: {
      fighter1: true,
      fighter2: true,
      event: true,
      reviews: { select: { userId: true, content: true } }
    }
  });
  console.log(`  Found ${newFights.length} fights in new DB`);

  // Create lookup: normalized fighter names -> new fight
  const newFightLookup = new Map();
  for (const nf of newFights) {
    const f1 = normalizeName(`${nf.fighter1.firstName}${nf.fighter1.lastName}`);
    const f2 = normalizeName(`${nf.fighter2.firstName}${nf.fighter2.lastName}`);
    const event = normalizeName(nf.event.name);
    const fighters = [f1, f2].sort().join('|');

    // Store with event+fighters and just fighters
    newFightLookup.set(`${fighters}|${event}`, nf);
    if (!newFightLookup.has(fighters)) {
      newFightLookup.set(fighters, nf);
    }
  }

  // Step 4: Get user mapping
  console.log('\nStep 4: Loading users...');
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const userMap = new Map(users.map(u => [u.email.toLowerCase(), u.id]));
  console.log(`  Loaded ${userMap.size} users`);

  // Step 5: Match and find missing reviews
  console.log('\nStep 5: Matching fights and finding missing reviews...');

  const reviewsToImport = [];
  let matchedFights = 0;
  let unmatchedFights = 0;

  for (const lr of legacyReviews) {
    const legacyFight = legacyFightMap.get(lr.legacyFightId);
    if (!legacyFight) {
      unmatchedFights++;
      continue;
    }

    // Create lookup keys
    const f1 = normalizeName(`${legacyFight.f1fn}${legacyFight.f1ln}`);
    const f2 = normalizeName(`${legacyFight.f2fn}${legacyFight.f2ln}`);
    const event = normalizeName(legacyFight.eventname);
    const fighters = [f1, f2].sort().join('|');

    // Find matching new fight
    const newFight = newFightLookup.get(`${fighters}|${event}`) || newFightLookup.get(fighters);

    if (!newFight) {
      unmatchedFights++;
      continue;
    }

    matchedFights++;

    // Get existing review keys for this fight
    const existingKeys = new Set(
      newFight.reviews.map(r => `${r.userId}|${normalizeName(r.content?.substring(0, 50) || '')}`)
    );

    // Check each legacy review
    for (const review of lr.reviews) {
      const userId = userMap.get(review.commenteremail?.toLowerCase());
      if (!userId) continue; // User doesn't exist in new system

      const reviewKey = `${userId}|${normalizeName(review.comment?.substring(0, 50) || '')}`;
      if (existingKeys.has(reviewKey)) continue; // Already imported

      reviewsToImport.push({
        fightId: newFight.id,
        fightName: `${newFight.fighter1.firstName} ${newFight.fighter1.lastName} vs ${newFight.fighter2.firstName} ${newFight.fighter2.lastName}`,
        userId,
        userEmail: review.commenteremail,
        content: review.comment,
        upvotes: review.helpful || 0,
        createdAt: review.date ? (review.date > 1000000000 ? new Date(review.date * 1000) : new Date(review.date, 0, 1)) : new Date(),
      });
    }
  }

  console.log(`  Matched: ${matchedFights}, Unmatched: ${unmatchedFights}`);
  console.log(`  Reviews to import: ${reviewsToImport.length}`);

  // Step 6: Show what will be imported
  if (reviewsToImport.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('REVIEWS TO IMPORT');
    console.log('='.repeat(60));

    const byFight = new Map();
    for (const r of reviewsToImport) {
      if (!byFight.has(r.fightId)) byFight.set(r.fightId, { name: r.fightName, reviews: [] });
      byFight.get(r.fightId).reviews.push(r);
    }

    for (const [, data] of byFight) {
      console.log(`\n${data.name}:`);
      for (const r of data.reviews) {
        console.log(`  - ${r.userEmail}: "${r.content?.substring(0, 50)}..." (${r.upvotes} upvotes)`);
      }
    }

    // Step 7: Import
    console.log('\n' + '='.repeat(60));
    console.log('IMPORTING...');
    console.log('='.repeat(60));

    let imported = 0, skipped = 0, errors = 0;

    for (const r of reviewsToImport) {
      try {
        // Double-check for duplicates
        const existing = await prisma.fightReview.findFirst({
          where: { fightId: r.fightId, userId: r.userId, content: r.content }
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.fightReview.create({
          data: {
            fightId: r.fightId,
            userId: r.userId,
            content: r.content,
            upvotes: r.upvotes,
            createdAt: r.createdAt,
          }
        });
        imported++;
        console.log(`✅ ${r.userEmail} on ${r.fightName}`);
      } catch (e) {
        errors++;
        console.log(`❌ ${r.userEmail}: ${e.message}`);
      }
    }

    console.log(`\nDone: ${imported} imported, ${skipped} skipped, ${errors} errors`);
  } else {
    console.log('\nNo reviews to import!');
  }

  await connection.end();
  await prisma.$disconnect();
}

syncMissingReviews().catch(console.error);
