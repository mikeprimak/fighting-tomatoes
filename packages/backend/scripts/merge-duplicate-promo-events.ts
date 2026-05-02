/**
 * CLI: merge duplicate promo events.
 *
 *   pnpm tsx scripts/merge-duplicate-promo-events.ts            # apply
 *   pnpm tsx scripts/merge-duplicate-promo-events.ts --dry-run  # report only
 */

import 'dotenv/config';
import { mergeDuplicatePromoEvents, disconnect } from '../src/services/mergeDuplicatePromoEvents';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const banner = dryRun ? 'DRY RUN — no changes will be written' : 'APPLY — merging duplicates';
  console.log(`\n=== mergeDuplicatePromoEvents :: ${banner} ===\n`);

  const result = await mergeDuplicatePromoEvents({ dryRun });

  console.log(`Candidate duplicate pairs found: ${result.candidatePairs}`);
  console.log(`Pairs handled: ${result.merged}   skipped (errors): ${result.skipped}\n`);

  if (result.details.length === 0) {
    console.log('Nothing to merge.');
  } else {
    for (const d of result.details) {
      const tag = d.action === 'dry-run' ? '[DRY]' : d.action === 'merged' ? '[MERGED]' : '[SKIP]';
      console.log(`${tag} keep:  ${d.canonicalName}  (${d.canonicalId})`);
      console.log(`        drop:  ${d.duplicateName}  (${d.duplicateId})`);
      console.log(`        fights reparented: ${d.fightsReparented}, collapsed: ${d.fightsCollapsed}`);
      if (d.action === 'merged') {
        console.log(`        ratings moved: ${d.ratingsMoved}, dropped on conflict: ${d.ratingsDropped}`);
      }
      if (d.skipReason) console.log(`        reason: ${d.skipReason}`);
      console.log('');
    }
  }

  await disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await disconnect();
  process.exit(1);
});
