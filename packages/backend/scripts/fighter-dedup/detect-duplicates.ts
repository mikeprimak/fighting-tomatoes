/**
 * Fighter Duplicate Detection Script
 *
 * Scans the database for potential duplicate fighters using fuzzy matching.
 * Outputs a report for manual review before merging.
 *
 * Usage:
 *   npx ts-node scripts/fighter-dedup/detect-duplicates.ts
 *   npx ts-node scripts/fighter-dedup/detect-duplicates.ts --min-similarity 0.8
 *   npx ts-node scripts/fighter-dedup/detect-duplicates.ts --output duplicates.json
 */

import { PrismaClient } from '@prisma/client';
import { findAllDuplicates, DuplicateCandidate } from '../../src/utils/fighterMatcher';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface FighterStats {
  id: string;
  firstName: string;
  lastName: string;
  totalFights: number;
  totalRatings: number;
  hasImage: boolean;
  createdAt: Date;
}

async function getFighterStats(fighterId: string): Promise<FighterStats | null> {
  const fighter = await prisma.fighter.findUnique({
    where: { id: fighterId },
    include: {
      _count: {
        select: {
          fightsAsFighter1: true,
          fightsAsFighter2: true,
        },
      },
    },
  });

  if (!fighter) return null;

  return {
    id: fighter.id,
    firstName: fighter.firstName,
    lastName: fighter.lastName,
    totalFights: fighter._count.fightsAsFighter1 + fighter._count.fightsAsFighter2,
    totalRatings: fighter.totalRatings,
    hasImage: !!fighter.profileImage,
    createdAt: fighter.createdAt,
  };
}

async function main() {
  console.log('Fighter Duplicate Detection\n');
  console.log('='.repeat(60));

  // Parse command line arguments
  const args = process.argv.slice(2);
  let minSimilarity = 0.85;
  let outputFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-similarity' && args[i + 1]) {
      minSimilarity = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    }
  }

  console.log(`Minimum similarity threshold: ${minSimilarity * 100}%\n`);

  // Find duplicates
  console.log('Scanning database for potential duplicates...\n');
  const duplicates = await findAllDuplicates(prisma, { minSimilarity });

  if (duplicates.length === 0) {
    console.log('No potential duplicates found!');
    return;
  }

  console.log(`Found ${duplicates.length} potential duplicate pairs\n`);
  console.log('='.repeat(60));

  // Enrich with stats
  const enrichedDuplicates: Array<{
    candidate: DuplicateCandidate;
    fighter1Stats: FighterStats;
    fighter2Stats: FighterStats;
    recommendation: 'merge_to_1' | 'merge_to_2' | 'review';
  }> = [];

  for (const candidate of duplicates) {
    const stats1 = await getFighterStats(candidate.fighter1.id);
    const stats2 = await getFighterStats(candidate.fighter2.id);

    if (!stats1 || !stats2) continue;

    // Determine recommendation based on:
    // 1. Who has more fights
    // 2. Who has more ratings
    // 3. Who has a profile image
    // 4. Who was created first (likely canonical)
    let recommendation: 'merge_to_1' | 'merge_to_2' | 'review' = 'review';

    const score1 = stats1.totalFights * 10 + stats1.totalRatings + (stats1.hasImage ? 50 : 0);
    const score2 = stats2.totalFights * 10 + stats2.totalRatings + (stats2.hasImage ? 50 : 0);

    if (score1 > score2 * 1.5) {
      recommendation = 'merge_to_1';
    } else if (score2 > score1 * 1.5) {
      recommendation = 'merge_to_2';
    }

    enrichedDuplicates.push({
      candidate,
      fighter1Stats: stats1,
      fighter2Stats: stats2,
      recommendation,
    });
  }

  // Print report
  for (let i = 0; i < enrichedDuplicates.length; i++) {
    const { candidate, fighter1Stats, fighter2Stats, recommendation } = enrichedDuplicates[i];

    console.log(`\n[${i + 1}/${enrichedDuplicates.length}] ${candidate.reason}`);
    console.log('-'.repeat(60));

    console.log(`  Fighter 1: ${fighter1Stats.firstName} ${fighter1Stats.lastName}`);
    console.log(`    ID: ${fighter1Stats.id}`);
    console.log(`    Fights: ${fighter1Stats.totalFights} | Ratings: ${fighter1Stats.totalRatings} | Image: ${fighter1Stats.hasImage ? 'Yes' : 'No'}`);
    console.log(`    Created: ${fighter1Stats.createdAt.toISOString().split('T')[0]}`);

    console.log(`  Fighter 2: ${fighter2Stats.firstName} ${fighter2Stats.lastName}`);
    console.log(`    ID: ${fighter2Stats.id}`);
    console.log(`    Fights: ${fighter2Stats.totalFights} | Ratings: ${fighter2Stats.totalRatings} | Image: ${fighter2Stats.hasImage ? 'Yes' : 'No'}`);
    console.log(`    Created: ${fighter2Stats.createdAt.toISOString().split('T')[0]}`);

    console.log(`  Similarity: ${Math.round(candidate.similarity * 100)}%`);
    console.log(`  Recommendation: ${recommendation === 'merge_to_1' ? 'Keep Fighter 1' : recommendation === 'merge_to_2' ? 'Keep Fighter 2' : 'Manual review needed'}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const autoMerge = enrichedDuplicates.filter(d => d.recommendation !== 'review');
  const needReview = enrichedDuplicates.filter(d => d.recommendation === 'review');

  console.log(`Total potential duplicates: ${enrichedDuplicates.length}`);
  console.log(`Auto-merge candidates: ${autoMerge.length}`);
  console.log(`Need manual review: ${needReview.length}`);

  // Output to file if requested
  if (outputFile) {
    const output = {
      generatedAt: new Date().toISOString(),
      minSimilarity,
      totalDuplicates: enrichedDuplicates.length,
      duplicates: enrichedDuplicates.map(d => ({
        fighter1: {
          id: d.fighter1Stats.id,
          name: `${d.fighter1Stats.firstName} ${d.fighter1Stats.lastName}`,
          fights: d.fighter1Stats.totalFights,
          ratings: d.fighter1Stats.totalRatings,
          hasImage: d.fighter1Stats.hasImage,
        },
        fighter2: {
          id: d.fighter2Stats.id,
          name: `${d.fighter2Stats.firstName} ${d.fighter2Stats.lastName}`,
          fights: d.fighter2Stats.totalFights,
          ratings: d.fighter2Stats.totalRatings,
          hasImage: d.fighter2Stats.hasImage,
        },
        similarity: d.candidate.similarity,
        reason: d.candidate.reason,
        recommendation: d.recommendation,
      })),
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\nReport saved to: ${outputFile}`);
  }

  console.log('\nTo merge duplicates, run:');
  console.log('  npx ts-node scripts/fighter-dedup/merge-fighters.ts <keep-id> <merge-id>');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
