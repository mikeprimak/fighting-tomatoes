/**
 * Taste-profile pilot runner — READ-ONLY against the DB.
 *
 * Loads one user's rated fights + fighter signals, runs the pure engine, and
 * prints the ranked insights + signature stats for review. This is the pilot
 * review surface: Mike reads the output and judges "would I screenshot this?"
 *
 * Run (from packages/backend/):
 *   npx tsx src/scripts/taste-profile-run.ts --email avocadomike@hotmail.com
 *   npx tsx src/scripts/taste-profile-run.ts --email ... --max 25 --salt 2026-W24
 */
import { prisma } from '../lib/prisma';
import { loadTasteInputs } from '../services/fanDNA/tasteProfile/loadInputs';
import { computeTasteProfile } from '../services/fanDNA/tasteProfile';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email');
  if (!email) {
    console.error('Usage: npx tsx src/scripts/taste-profile-run.ts --email <email> [--max N] [--salt S]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  console.log(`Loading taste inputs for ${user.email} ...`);
  const inputs = await loadTasteInputs(prisma, user.id);
  const cc = inputs.characterCoverage;
  console.log(
    `  ${inputs.fights.length} rated completed fights | ` +
      `${cc.withCharacter}/${cc.total} carry the character taxonomy | ` +
      `${inputs.fighters.length} fighters with signal`,
  );

  const result = computeTasteProfile({
    userId: user.id,
    fights: inputs.fights,
    fighters: inputs.fighters,
    rotationSalt: arg('salt'),
    maxInsights: arg('max') ? Number(arg('max')) : 25,
  });

  const b = result.signature.baseline;
  console.log(
    `\nBaseline: avg ${b.avg.toFixed(2)} (sd ${b.sd.toFixed(2)}) across ${b.count} fights, ${b.tensCount} tens`,
  );
  console.log(`Token stats tracked: ${result.signature.tokens.length}`);

  console.log(`\n=== RANKED INSIGHTS (${result.insights.length}) ===`);
  for (const i of result.insights) {
    console.log(`\n[${i.score.toFixed(2)}] (${i.kind}: ${i.dimension}.${i.token})`);
    console.log(`  ${i.headline}`);
    console.log(`  ${i.subline}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
