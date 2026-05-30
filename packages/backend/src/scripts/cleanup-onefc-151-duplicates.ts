/**
 * One-off cleanup for ONE Friday Fights 151 duplicate rows.
 *
 * Context: the daily scraper parsed two fighters' names inconsistently across
 * daily runs (garbage URL slug "Petmuangsri TDed99" vs correct "Torfunfarm";
 * transliteration "Kathi" vs "Kati"), creating parallel Fighter + Fight rows.
 * The earlier-dated rows ended up with the canonical result data from the
 * live tracker, but under the wrong fighter names.
 *
 * Strategy per duplicate:
 *   1. Delete the orphan Fight row (UPCOMING, no result) — cascades
 *      ratings/reviews/tags/predictions.
 *   2. Delete the now-unreferenced orphan Fighter (cascades followers).
 *   3. Rename the keeper Fighter to the correct name.
 *   4. Fix keeper Fight's orderOnCard if needed.
 *
 * Safety checks before each delete:
 *   - Orphan fight has zero crew-linked rows (those don't cascade).
 *   - Orphan fighter has zero other fights referencing it.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Duplicate {
  label: string;
  orphanFightId: string;
  orphanFighterId: string;
  keeperFightId: string;
  keeperFighterId: string;
  correctFirstName: string;
  correctLastName: string;
  correctOrderOnCard: number;
}

const DUPLICATES: Duplicate[] = [
  {
    label: 'Petmuangsri',
    orphanFightId: '352f5256-5444-40c9-b32b-8eb6b6910dc7',
    orphanFighterId: 'e0f49aae-bd9c-4173-b0c7-a3dfa2cb7957', // Torfunfarm (correct name, empty fight)
    keeperFightId: '99c186e6-8f9f-413b-9f2d-995ddea5b4da',
    keeperFighterId: '5d9d2a40-62a2-4f50-8525-9b94364a9203', // TDed99 (garbage name, has result)
    correctFirstName: 'Petmuangsri',
    correctLastName: 'Torfunfarm',
    correctOrderOnCard: 2,
  },
  {
    label: 'Mor RajabhatKorat',
    orphanFightId: '5642f7f2-9242-450f-9c5c-ebeae37d8ddc',
    orphanFighterId: '41d6bfdf-2df9-4bd5-9265-830fb5e0b1ba', // Kati (correct name, empty fight)
    keeperFightId: '9c97a884-a0f8-4c53-a316-0b607b94cc1a',
    keeperFighterId: '0214d722-177b-43db-9cd4-882c11e49a98', // Kathi (has result, wrong transliteration)
    correctFirstName: 'Kati',
    correctLastName: 'Mor RajabhatKorat',
    correctOrderOnCard: 6,
  },
];

async function auditFightReferences(fightId: string): Promise<Record<string, number>> {
  const [crewMsgs, crewPreds, crewVotes, crewRxns, ratings, reviews, preFightComments, tags, predictions] = await Promise.all([
    prisma.crewMessage.count({ where: { fightId } }),
    prisma.crewPrediction.count({ where: { fightId } }),
    prisma.crewRoundVote.count({ where: { fightId } }),
    prisma.crewReaction.count({ where: { fightId } }),
    prisma.fightRating.count({ where: { fightId } }),
    prisma.fightReview.count({ where: { fightId } }),
    prisma.preFightComment.count({ where: { fightId } }),
    prisma.fightTag.count({ where: { fightId } }),
    prisma.fightPrediction.count({ where: { fightId } }),
  ]);
  return {
    crewMessages: crewMsgs, // non-cascade — blocks delete
    crewPredictions: crewPreds, // non-cascade
    crewRoundVotes: crewVotes, // non-cascade
    crewReactions: crewRxns, // non-cascade
    fightRatings: ratings, // cascades
    fightReviews: reviews, // cascades
    preFightComments: preFightComments, // cascades
    fightTags: tags, // cascades
    fightPredictions: predictions, // cascades
  };
}

async function auditFighterReferences(fighterId: string, excludeFightId: string): Promise<{ otherFights: number; followers: number }> {
  const [otherFights, followers] = await Promise.all([
    prisma.fight.count({
      where: {
        OR: [{ fighter1Id: fighterId }, { fighter2Id: fighterId }],
        NOT: { id: excludeFightId },
      },
    }),
    prisma.userFighterFollow.count({ where: { fighterId } }),
  ]);
  return { otherFights, followers };
}

async function main() {
  for (const dup of DUPLICATES) {
    console.log(`\n=== ${dup.label} ===`);

    // Audit orphan fight
    const fightAudit = await auditFightReferences(dup.orphanFightId);
    console.log(`  Orphan fight ${dup.orphanFightId.slice(0, 8)} references:`, fightAudit);

    const nonCascadeBlockers =
      fightAudit.crewMessages + fightAudit.crewPredictions + fightAudit.crewRoundVotes + fightAudit.crewReactions;
    if (nonCascadeBlockers > 0) {
      console.log(`  ⛔ Orphan fight has ${nonCascadeBlockers} non-cascading references (crew-*). SKIPPING.`);
      continue;
    }

    // Audit orphan fighter
    const fighterAudit = await auditFighterReferences(dup.orphanFighterId, dup.orphanFightId);
    console.log(`  Orphan fighter ${dup.orphanFighterId.slice(0, 8)} other refs:`, fighterAudit);

    if (fighterAudit.otherFights > 0) {
      console.log(`  ⛔ Orphan fighter has ${fighterAudit.otherFights} other fight references. SKIPPING.`);
      continue;
    }

    // Step 1: delete orphan fight
    console.log(`  🗑️  Deleting orphan fight ${dup.orphanFightId.slice(0, 8)}...`);
    await prisma.fight.delete({ where: { id: dup.orphanFightId } });
    console.log(`     ✓ fight deleted (cascades applied)`);

    // Step 2: delete orphan fighter
    console.log(`  🗑️  Deleting orphan fighter ${dup.orphanFighterId.slice(0, 8)}...`);
    await prisma.fighter.delete({ where: { id: dup.orphanFighterId } });
    console.log(`     ✓ fighter deleted (${fighterAudit.followers} followers cascaded)`);

    // Step 3: rename keeper fighter
    console.log(`  ✏️  Renaming keeper fighter ${dup.keeperFighterId.slice(0, 8)} -> ${dup.correctFirstName} ${dup.correctLastName}`);
    const renamed = await prisma.fighter.update({
      where: { id: dup.keeperFighterId },
      data: { firstName: dup.correctFirstName, lastName: dup.correctLastName },
      select: { firstName: true, lastName: true },
    });
    console.log(`     ✓ renamed to ${renamed.firstName} ${renamed.lastName}`);

    // Step 4: fix orderOnCard if needed
    const keeperFight = await prisma.fight.findUnique({
      where: { id: dup.keeperFightId },
      select: { orderOnCard: true },
    });
    if (keeperFight && keeperFight.orderOnCard !== dup.correctOrderOnCard) {
      console.log(`  🔢 Fixing orderOnCard ${keeperFight.orderOnCard} -> ${dup.correctOrderOnCard}`);
      await prisma.fight.update({
        where: { id: dup.keeperFightId },
        data: { orderOnCard: dup.correctOrderOnCard },
      });
      console.log(`     ✓ orderOnCard updated`);
    } else {
      console.log(`  ✓ orderOnCard already correct (${keeperFight?.orderOnCard})`);
    }
  }

  console.log('\n=== Done ===');
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('❌ Error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
