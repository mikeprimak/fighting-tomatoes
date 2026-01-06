/**
 * Fighter Merge Script
 *
 * Merges two fighter records into one, consolidating all related data:
 * - Fights (as fighter1 or fighter2)
 * - Followers
 * - Creates an alias for the merged name
 *
 * Usage:
 *   npx ts-node scripts/fighter-dedup/merge-fighters.ts <keep-id> <merge-id>
 *   npx ts-node scripts/fighter-dedup/merge-fighters.ts <keep-id> <merge-id> --dry-run
 *
 * Example:
 *   npx ts-node scripts/fighter-dedup/merge-fighters.ts abc123 def456
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MergeResult {
  success: boolean;
  keepFighter: { id: string; name: string };
  mergeFighter: { id: string; name: string };
  fightsTransferred: number;
  followersTransferred: number;
  aliasCreated: boolean;
  errors: string[];
}

async function mergeFighters(
  keepId: string,
  mergeId: string,
  dryRun: boolean = false
): Promise<MergeResult> {
  const result: MergeResult = {
    success: false,
    keepFighter: { id: keepId, name: '' },
    mergeFighter: { id: mergeId, name: '' },
    fightsTransferred: 0,
    followersTransferred: 0,
    aliasCreated: false,
    errors: [],
  };

  // Fetch both fighters
  const keepFighter = await prisma.fighter.findUnique({
    where: { id: keepId },
    include: {
      _count: {
        select: {
          fightsAsFighter1: true,
          fightsAsFighter2: true,
          followers: true,
        },
      },
    },
  });

  const mergeFighter = await prisma.fighter.findUnique({
    where: { id: mergeId },
    include: {
      _count: {
        select: {
          fightsAsFighter1: true,
          fightsAsFighter2: true,
          followers: true,
        },
      },
    },
  });

  if (!keepFighter) {
    result.errors.push(`Fighter to keep (${keepId}) not found`);
    return result;
  }

  if (!mergeFighter) {
    result.errors.push(`Fighter to merge (${mergeId}) not found`);
    return result;
  }

  result.keepFighter.name = `${keepFighter.firstName} ${keepFighter.lastName}`;
  result.mergeFighter.name = `${mergeFighter.firstName} ${mergeFighter.lastName}`;

  console.log('\nMerge Plan:');
  console.log('='.repeat(60));
  console.log(`KEEP:  ${result.keepFighter.name} (${keepId})`);
  console.log(`       Fights: ${keepFighter._count.fightsAsFighter1 + keepFighter._count.fightsAsFighter2}`);
  console.log(`       Followers: ${keepFighter._count.followers}`);
  console.log(`       Image: ${keepFighter.profileImage ? 'Yes' : 'No'}`);
  console.log(`MERGE: ${result.mergeFighter.name} (${mergeId})`);
  console.log(`       Fights: ${mergeFighter._count.fightsAsFighter1 + mergeFighter._count.fightsAsFighter2}`);
  console.log(`       Followers: ${mergeFighter._count.followers}`);
  console.log(`       Image: ${mergeFighter.profileImage ? 'Yes' : 'No'}`);
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n[DRY RUN] No changes will be made.\n');
  }

  try {
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        // 1. Update fights where mergeFighter is fighter1
        const fights1 = await tx.fight.updateMany({
          where: { fighter1Id: mergeId },
          data: { fighter1Id: keepId },
        });
        result.fightsTransferred += fights1.count;
        console.log(`Transferred ${fights1.count} fights (as fighter1)`);

        // 2. Update fights where mergeFighter is fighter2
        const fights2 = await tx.fight.updateMany({
          where: { fighter2Id: mergeId },
          data: { fighter2Id: keepId },
        });
        result.fightsTransferred += fights2.count;
        console.log(`Transferred ${fights2.count} fights (as fighter2)`);

        // 3. Handle followers - need to check for duplicates
        const mergeFollowers = await tx.userFighterFollow.findMany({
          where: { fighterId: mergeId },
        });

        let followersTransferred = 0;
        for (const follow of mergeFollowers) {
          // Check if this user already follows the keep fighter
          const existingFollow = await tx.userFighterFollow.findUnique({
            where: {
              userId_fighterId: {
                userId: follow.userId,
                fighterId: keepId,
              },
            },
          });

          if (!existingFollow) {
            // Transfer the follow
            await tx.userFighterFollow.update({
              where: { id: follow.id },
              data: { fighterId: keepId },
            });
            followersTransferred++;
          } else {
            // Delete the duplicate follow
            await tx.userFighterFollow.delete({
              where: { id: follow.id },
            });
          }
        }
        result.followersTransferred = followersTransferred;
        console.log(`Transferred ${followersTransferred} followers (${mergeFollowers.length - followersTransferred} were duplicates)`);

        // 4. Transfer any aliases from the merged fighter
        await tx.fighterAlias.updateMany({
          where: { fighterId: mergeId },
          data: { fighterId: keepId },
        });

        // 5. Create an alias for the merged fighter's name
        const existingAlias = await tx.fighterAlias.findUnique({
          where: {
            firstName_lastName: {
              firstName: mergeFighter.firstName,
              lastName: mergeFighter.lastName,
            },
          },
        });

        if (!existingAlias) {
          await tx.fighterAlias.create({
            data: {
              fighterId: keepId,
              firstName: mergeFighter.firstName,
              lastName: mergeFighter.lastName,
              source: 'merge',
            },
          });
          result.aliasCreated = true;
          console.log(`Created alias: "${mergeFighter.firstName} ${mergeFighter.lastName}" → "${keepFighter.firstName} ${keepFighter.lastName}"`);
        }

        // 6. Update stats on keep fighter (merge totals)
        const newTotalRatings = keepFighter.totalRatings + mergeFighter.totalRatings;
        const newTotalFights = keepFighter.totalFights + mergeFighter.totalFights;
        const newGreatFights = keepFighter.greatFights + mergeFighter.greatFights;

        // Recalculate average rating
        let newAverageRating = keepFighter.averageRating;
        if (newTotalRatings > 0 && mergeFighter.totalRatings > 0) {
          newAverageRating = (
            (keepFighter.averageRating * keepFighter.totalRatings) +
            (mergeFighter.averageRating * mergeFighter.totalRatings)
          ) / newTotalRatings;
        }

        // Copy image if keep fighter doesn't have one
        const profileImage = keepFighter.profileImage || mergeFighter.profileImage;
        const actionImage = keepFighter.actionImage || mergeFighter.actionImage;

        await tx.fighter.update({
          where: { id: keepId },
          data: {
            totalRatings: newTotalRatings,
            totalFights: newTotalFights,
            greatFights: newGreatFights,
            averageRating: newAverageRating,
            profileImage,
            actionImage,
          },
        });
        console.log(`Updated stats on ${keepFighter.firstName} ${keepFighter.lastName}`);

        // 7. Delete the merged fighter
        await tx.fighter.delete({
          where: { id: mergeId },
        });
        console.log(`Deleted fighter: ${mergeFighter.firstName} ${mergeFighter.lastName}`);
      });
    } else {
      // Dry run - just show what would happen
      const fights1Count = await prisma.fight.count({ where: { fighter1Id: mergeId } });
      const fights2Count = await prisma.fight.count({ where: { fighter2Id: mergeId } });
      const followersCount = await prisma.userFighterFollow.count({ where: { fighterId: mergeId } });

      console.log(`Would transfer ${fights1Count} fights (as fighter1)`);
      console.log(`Would transfer ${fights2Count} fights (as fighter2)`);
      console.log(`Would transfer up to ${followersCount} followers`);
      console.log(`Would create alias: "${mergeFighter.firstName} ${mergeFighter.lastName}"`);
      console.log(`Would delete fighter: ${mergeFighter.firstName} ${mergeFighter.lastName}`);

      result.fightsTransferred = fights1Count + fights2Count;
      result.followersTransferred = followersCount;
    }

    result.success = true;
  } catch (error) {
    result.errors.push(String(error));
    console.error('\nError during merge:', error);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx ts-node scripts/fighter-dedup/merge-fighters.ts <keep-id> <merge-id> [--dry-run]');
    console.log('\nThis will merge <merge-id> INTO <keep-id>, keeping the first fighter.');
    process.exit(1);
  }

  const keepId = args[0];
  const mergeId = args[1];
  const dryRun = args.includes('--dry-run');

  if (keepId === mergeId) {
    console.error('Error: Cannot merge a fighter with itself.');
    process.exit(1);
  }

  const result = await mergeFighters(keepId, mergeId, dryRun);

  console.log('\n' + '='.repeat(60));
  console.log('RESULT');
  console.log('='.repeat(60));

  if (result.success) {
    console.log(`✓ Merge ${dryRun ? 'would be' : 'was'} successful`);
    console.log(`  Fights transferred: ${result.fightsTransferred}`);
    console.log(`  Followers transferred: ${result.followersTransferred}`);
    console.log(`  Alias created: ${result.aliasCreated ? 'Yes' : 'No'}`);
  } else {
    console.log('✗ Merge failed');
    result.errors.forEach(e => console.log(`  Error: ${e}`));
  }

  if (dryRun) {
    console.log('\nTo execute merge, run without --dry-run');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
