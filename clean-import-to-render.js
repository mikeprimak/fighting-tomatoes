const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const RENDER_URL = 'postgresql://fightcrewappdb_k127_user:DLeYZBwCclr4JOEKDndStpQT0hBGNRlL@dpg-d3oee81r0fns73c59610-a.oregon-postgres.render.com/fightcrewappdb_k127';

// Tables in correct deletion order (children first, then parents)
const TABLES_TO_TRUNCATE = [
  // Child tables first (depend on others)
  'SentPreEventNotification',
  'UserFeedback',
  'NewsArticle',
  'CrewReaction',
  'CrewRoundVote',
  'CrewPrediction',
  'CrewMessage',
  'CrewMember',
  'Crew',
  'DailyMetrics',
  'UserSession',
  'AnalyticsEvent',
  'UserRecommendation',
  'UserNotification',
  'UserActivity',
  'FightNotificationMatch',
  'UserNotificationRule',
  'UserFighterFollow',
  'FightTag',
  'Tag',
  'ReviewReport',
  'ReviewVote',
  'PreFightCommentReport',
  'PreFightCommentVote',
  'PreFightComment',
  'FightReview',
  'FightPrediction',
  'FightRating',
  // Then main tables
  'Fight',
  'Event',
  'Fighter',
  'RefreshToken',
  'User',
  // Don't touch _prisma_migrations
];

async function cleanImport() {
  const client = new Client({ connectionString: RENDER_URL });

  try {
    await client.connect();
    console.log('Connected to Render database');

    // Step 1: Truncate all tables with CASCADE
    console.log('\n=== TRUNCATING ALL TABLES ===');
    for (const table of TABLES_TO_TRUNCATE) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        console.log(`  ✓ Truncated ${table}`);
      } catch (err) {
        console.log(`  - ${table}: ${err.message}`);
      }
    }

    // Step 2: Read and execute the dump file
    console.log('\n=== IMPORTING DUMP FILE ===');
    const dumpPath = path.join(__dirname, 'full_dump.sql');
    const dumpContent = fs.readFileSync(dumpPath, 'utf8');

    // Remove the \restrict line that pg_dump added
    const cleanedDump = dumpContent.replace(/^\\restrict.*$/m, '');

    // Split into individual statements
    const statements = cleanedDump
      .split(/;\s*$/m)
      .filter(s => s.trim())
      .filter(s => s.includes('INSERT INTO'));

    console.log(`Found ${statements.length} INSERT statements`);

    let successCount = 0;
    let errorCount = 0;
    let lastTable = '';

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      // Extract table name for logging
      const tableMatch = stmt.match(/INSERT INTO public\.(\w+)/);
      const tableName = tableMatch ? tableMatch[1] : 'unknown';

      if (tableName !== lastTable) {
        if (lastTable) console.log(`  ✓ ${lastTable}: ${successCount} rows`);
        lastTable = tableName;
        successCount = 0;
      }

      try {
        await client.query(stmt);
        successCount++;
      } catch (err) {
        errorCount++;
        if (errorCount <= 10) {
          console.log(`  ERROR in ${tableName}: ${err.message.substring(0, 100)}`);
        }
      }
    }
    if (lastTable) console.log(`  ✓ ${lastTable}: ${successCount} rows`);

    console.log(`\n=== IMPORT COMPLETE ===`);
    console.log(`Errors: ${errorCount}`);

    // Step 3: Verify counts
    console.log('\n=== VERIFICATION ===');
    const counts = await Promise.all([
      client.query('SELECT COUNT(*) FROM "User"'),
      client.query('SELECT COUNT(*) FROM "Fighter"'),
      client.query('SELECT COUNT(*) FROM "Event"'),
      client.query('SELECT COUNT(*) FROM "Fight"'),
      client.query('SELECT COUNT(*) FROM "FightRating"'),
    ]);

    console.log(`Users: ${counts[0].rows[0].count}`);
    console.log(`Fighters: ${counts[1].rows[0].count}`);
    console.log(`Events: ${counts[2].rows[0].count}`);
    console.log(`Fights: ${counts[3].rows[0].count}`);
    console.log(`Ratings: ${counts[4].rows[0].count}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

cleanImport();
