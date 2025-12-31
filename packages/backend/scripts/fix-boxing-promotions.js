/**
 * Script to identify and update boxing events with generic "Boxing" promotion
 * to their correct promoters.
 *
 * Usage:
 *   node scripts/fix-boxing-promotions.js          # List events (dry run)
 *   node scripts/fix-boxing-promotions.js --apply  # Apply changes
 */

const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient();

// Known boxing promoters and keywords to identify them
const PROMOTER_PATTERNS = {
  'Showtime Boxing': [
    /showtime/i,
    /mayweather.*mcgregor/i,
    /mcgregor.*mayweather/i,
  ],
  'DAZN': [
    /dazn/i,
  ],
  'PBC': [
    /pbc/i,
    /premier boxing/i,
  ],
  'ESPN Boxing': [
    /espn/i,
  ],
  'Most Valuable Promotions': [
    /jake paul/i,
    /paul.*diaz/i,
    /diaz.*paul/i,
    /mvp boxing/i,
    /most valuable/i,
  ],
  // Add more patterns as needed
};

async function identifyPromoter(eventName) {
  const nameLower = eventName.toLowerCase();

  for (const [promoter, patterns] of Object.entries(PROMOTER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(eventName)) {
        return promoter;
      }
    }
  }

  return null; // Unknown - needs manual review
}

async function main() {
  const applyChanges = process.argv.includes('--apply');

  console.log('='.repeat(80));
  console.log('Boxing Promotion Fixer');
  console.log('='.repeat(80));
  console.log('');

  // Find all events with generic "Boxing" promotion
  const events = await prisma.event.findMany({
    where: { promotion: 'Boxing' },
    select: { id: true, name: true, date: true, promotion: true },
    orderBy: { date: 'desc' }
  });

  console.log(`Found ${events.length} events with generic "Boxing" promotion:\n`);

  const identified = [];
  const needsReview = [];

  for (const event of events) {
    const suggestedPromoter = await identifyPromoter(event.name);
    const dateStr = event.date.toISOString().split('T')[0];

    if (suggestedPromoter) {
      identified.push({ ...event, suggestedPromoter });
      console.log(`✓ ${dateStr} | ${event.name}`);
      console.log(`  → Suggested: ${suggestedPromoter}`);
    } else {
      needsReview.push(event);
      console.log(`? ${dateStr} | ${event.name}`);
      console.log(`  → NEEDS MANUAL REVIEW`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`Summary: ${identified.length} can be auto-fixed, ${needsReview.length} need manual review`);
  console.log('='.repeat(80));

  if (applyChanges && identified.length > 0) {
    console.log('\nApplying changes...\n');

    for (const event of identified) {
      await prisma.event.update({
        where: { id: event.id },
        data: { promotion: event.suggestedPromoter }
      });
      console.log(`Updated: ${event.name} → ${event.suggestedPromoter}`);
    }

    console.log('\n✓ Done! Updated ' + identified.length + ' events.');
  } else if (!applyChanges && identified.length > 0) {
    console.log('\nDry run complete. Run with --apply to make changes.');
  }

  if (needsReview.length > 0) {
    console.log('\n--- Events needing manual review ---');
    console.log('Add patterns to PROMOTER_PATTERNS or update manually in database:');
    for (const event of needsReview) {
      console.log(`  - ${event.name} (${event.id})`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
