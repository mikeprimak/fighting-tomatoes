#!/usr/bin/env node
/**
 * ============================================================================
 * WIPE LEGACY DATA - COMPLETE DATABASE RESET
 * ============================================================================
 *
 * Deletes ALL user data and imported data in FK-safe order.
 * This is the first step in a complete migration reset.
 *
 * USAGE:
 *   node wipe-legacy-data.js --dry-run     # Preview what will be deleted
 *   node wipe-legacy-data.js --confirm     # Actually delete everything
 *   node wipe-legacy-data.js --verify      # Show current data counts
 *
 * WHAT IT PRESERVES:
 *   - tags table (system-defined tag definitions like FOTY, FOTN)
 *   - news_articles (from news scrapers, not legacy)
 *   - Database schema/migrations
 *
 * WHAT IT DELETES:
 *   - All users and user data (ratings, reviews, predictions, etc.)
 *   - All fights, events, fighters (these come from legacy, not scrapers)
 *   - All crew data (crews, messages, predictions, votes)
 *   - All analytics and session data
 *   - All notification rules and matches
 *
 * ============================================================================
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONFIRM = args.includes('--confirm');
const VERIFY = args.includes('--verify');

// Deletion order - respects foreign key constraints
// Delete child tables before parent tables
const DELETION_ORDER = [
  // Review-related (deepest dependencies first)
  { table: 'reviewVote', name: 'review_votes' },
  { table: 'reviewReport', name: 'review_reports' },
  { table: 'fightReview', name: 'fight_reviews' },

  // Pre-fight comment related
  { table: 'preFightCommentVote', name: 'pre_fight_comment_votes' },
  { table: 'preFightCommentReport', name: 'pre_fight_comment_reports' },
  { table: 'preFightComment', name: 'pre_fight_comments' },

  // User fight data
  { table: 'fightRating', name: 'fight_ratings' },
  { table: 'fightTag', name: 'fight_tags' },
  { table: 'fightPrediction', name: 'fight_predictions' },
  { table: 'userFighterFollow', name: 'user_fighter_follows' },

  // Notification system
  { table: 'fightNotificationMatch', name: 'fight_notification_matches' },
  { table: 'userNotificationRule', name: 'user_notification_rules' },

  // User activity and analytics
  { table: 'userActivity', name: 'user_activities' },
  { table: 'userNotification', name: 'user_notifications' },
  { table: 'userRecommendation', name: 'user_recommendations' },
  { table: 'userSession', name: 'user_sessions' },
  { table: 'analyticsEvent', name: 'analytics_events' },
  { table: 'refreshToken', name: 'refresh_tokens' },

  // Crew system (must delete before users)
  { table: 'crewReaction', name: 'crew_reactions' },
  { table: 'crewRoundVote', name: 'crew_round_votes' },
  { table: 'crewPrediction', name: 'crew_predictions' },
  { table: 'crewMessage', name: 'crew_messages' },
  { table: 'crewMember', name: 'crew_members' },
  { table: 'crew', name: 'crews' },

  // User feedback
  { table: 'userFeedback', name: 'user_feedback' },

  // Event-related (before events)
  { table: 'sentPreEventNotification', name: 'sent_pre_event_notifications' },

  // Scraper logs and metrics
  { table: 'scraperLog', name: 'scraper_logs' },
  { table: 'dailyMetrics', name: 'daily_metrics' },

  // Core tables (delete in order: fights -> events -> fighters -> users)
  { table: 'fight', name: 'fights' },
  { table: 'event', name: 'events' },
  { table: 'fighter', name: 'fighters' },
  { table: 'user', name: 'users' },

  // NOTE: We PRESERVE these tables:
  // - tags (system-defined tag definitions)
  // - news_articles (from news scrapers, not legacy)
];

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           WIPE LEGACY DATA - COMPLETE DATABASE RESET           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (VERIFY) {
    await verifyData();
    return;
  }

  if (!CONFIRM && !DRY_RUN) {
    console.log('Usage:');
    console.log('  node wipe-legacy-data.js --dry-run     # Preview what will be deleted');
    console.log('  node wipe-legacy-data.js --confirm     # Actually delete everything');
    console.log('  node wipe-legacy-data.js --verify      # Show current data counts');
    console.log('');
    console.log('⚠️  This is a destructive operation. Use --confirm to execute.');
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No data will be deleted\n');
  } else {
    console.log('⚠️  WARNING: This will DELETE ALL DATA!\n');
    console.log('    Waiting 5 seconds before proceeding...');
    console.log('    Press Ctrl+C to cancel.\n');
    await sleep(5000);
  }

  const results = {};
  let totalDeleted = 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('DELETING DATA...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  for (const { table, name } of DELETION_ORDER) {
    try {
      // Get count first
      const count = await prisma[table].count();

      if (count === 0) {
        results[name] = 0;
        continue;
      }

      if (!DRY_RUN) {
        // Delete all records
        await prisma[table].deleteMany({});
      }

      results[name] = count;
      totalDeleted += count;
      console.log(`  ✅ ${name.padEnd(35)} ${String(count).padStart(8)} records`);
    } catch (error) {
      // Table might not exist or other error
      console.log(`  ⚠️  ${name.padEnd(35)} Error: ${error.message.split('\n')[0]}`);
    }
  }

  // Print summary
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  if (DRY_RUN) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    DRY RUN COMPLETE                            ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Would delete: ${String(totalDeleted).padStart(10)} total records                     ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  To execute: node wipe-legacy-data.js --confirm                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
  } else {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    WIPE COMPLETE                               ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  Deleted: ${String(totalDeleted).padStart(10)} total records                          ║`);
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  Preserved:                                                    ║');
    console.log('║    - tags (system-defined tag definitions)                     ║');
    console.log('║    - news_articles (from news scrapers)                        ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  Next step:                                                    ║');
    console.log('║    cd mysql-export && node sync-all-from-live.js               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
  }

  console.log('');
  await prisma.$disconnect();
}

async function verifyData() {
  console.log('📊 Current Database Counts:\n');

  const counts = {
    // Core tables
    users: await prisma.user.count(),
    fighters: await prisma.fighter.count(),
    events: await prisma.event.count(),
    fights: await prisma.fight.count(),

    // User data
    ratings: await prisma.fightRating.count(),
    reviews: await prisma.fightReview.count(),
    reviewVotes: await prisma.reviewVote.count(),
    tags: await prisma.fightTag.count(),
    predictions: await prisma.fightPrediction.count(),
    follows: await prisma.userFighterFollow.count(),

    // Comments
    preFightComments: await prisma.preFightComment.count(),

    // Crews
    crews: await prisma.crew.count(),
    crewMembers: await prisma.crewMember.count(),
    crewMessages: await prisma.crewMessage.count(),

    // Preserved tables
    tagDefinitions: await prisma.tag.count(),
    newsArticles: await prisma.newsArticle.count(),
  };

  console.log('  Core Tables:');
  console.log(`    Users:                ${String(counts.users).padStart(10)}`);
  console.log(`    Fighters:             ${String(counts.fighters).padStart(10)}`);
  console.log(`    Events:               ${String(counts.events).padStart(10)}`);
  console.log(`    Fights:               ${String(counts.fights).padStart(10)}`);
  console.log('');
  console.log('  User Data:');
  console.log(`    Ratings:              ${String(counts.ratings).padStart(10)}`);
  console.log(`    Reviews:              ${String(counts.reviews).padStart(10)}`);
  console.log(`    Review Votes:         ${String(counts.reviewVotes).padStart(10)}`);
  console.log(`    Tags:                 ${String(counts.tags).padStart(10)}`);
  console.log(`    Predictions:          ${String(counts.predictions).padStart(10)}`);
  console.log(`    Fighter Follows:      ${String(counts.follows).padStart(10)}`);
  console.log('');
  console.log('  Crews:');
  console.log(`    Crews:                ${String(counts.crews).padStart(10)}`);
  console.log(`    Crew Members:         ${String(counts.crewMembers).padStart(10)}`);
  console.log(`    Crew Messages:        ${String(counts.crewMessages).padStart(10)}`);
  console.log('');
  console.log('  Preserved Tables:');
  console.log(`    Tag Definitions:      ${String(counts.tagDefinitions).padStart(10)}`);
  console.log(`    News Articles:        ${String(counts.newsArticles).padStart(10)}`);
  console.log('');

  // Check for claimable users
  const claimableUsers = await prisma.user.count({ where: { password: null } });
  console.log(`  Legacy users (password=null): ${claimableUsers}`);

  // Check for users with ratings
  const usersWithRatings = await prisma.user.count({ where: { totalRatings: { gt: 0 } } });
  console.log(`  Users with ratings: ${usersWithRatings}`);

  console.log('');
  await prisma.$disconnect();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
