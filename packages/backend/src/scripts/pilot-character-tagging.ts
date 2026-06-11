/**
 * Character-tagging pilot — derive the fight-character taxonomy for one
 * user's rated fights FROM STORED RECAPS (no scraping), per the
 * prod-with-guardrails decision (identity-platform.md 2026-06-11).
 *
 * Guardrails honored here:
 *   - NO schema change, no prisma migrate anything.
 *   - MERGE-ONLY write: sets the `character` (+ `characterMeta`) keys inside
 *     the existing aiPostFightTags JSONB; never touches summaries, narrative
 *     fields, or any other column.
 *   - Default is DRY-RUN. Writes require --persist.
 *
 * Usage (from packages/backend/):
 *   npx tsx src/scripts/pilot-character-tagging.ts --email avocadomike@hotmail.com --limit 20
 *   npx tsx src/scripts/pilot-character-tagging.ts --email ... --limit 20 --persist
 *   npx tsx src/scripts/pilot-character-tagging.ts --email ... --persist          (all eligible)
 *   --force re-tags fights that already carry a character object.
 */
import { prisma } from '../lib/prisma';
import { extractCharacterFromRecap } from '../services/aiEnrichment/postFight/extractCharacterFromRecap';

const CONCURRENCY = 4;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const email = arg('email');
  if (!email) {
    console.error('Usage: --email <email> [--limit N] [--persist] [--force]');
    process.exit(1);
  }
  const persist = flag('persist');
  const force = flag('force');
  const limit = arg('limit') ? Number(arg('limit')) : undefined;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`No user for ${email}`);
    process.exit(1);
  }

  const rated = await prisma.fightRating.findMany({
    where: {
      userId: user.id,
      fight: { fightStatus: 'COMPLETED', aiPostFightSummary: { not: null } },
    },
    select: {
      fight: {
        select: {
          id: true,
          method: true,
          round: true,
          time: true,
          winner: true,
          weightClass: true,
          isTitle: true,
          totalRatings: true,
          aiPostFightSummary: true,
          aiPostFightTags: true,
          event: { select: { promotion: true } },
          fighter1: { select: { id: true, lastName: true } },
          fighter2: { select: { id: true, lastName: true } },
        },
      },
    },
  });

  let fights = rated
    .map((r) => r.fight)
    .filter((f) => force || !(f.aiPostFightTags as any)?.character)
    .sort((a, b) => b.totalRatings - a.totalRatings);
  if (limit) fights = fights.slice(0, limit);

  console.log(
    `${rated.length} rated fights with recaps; ${fights.length} to tag` +
      `${persist ? ' (PERSIST)' : ' (dry-run)'}${force ? ' (force)' : ''}`,
  );

  let done = 0;
  let written = 0;
  let nullCharacter = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const failures: string[] = [];

  async function worker(slice: typeof fights) {
    for (const f of slice) {
      try {
        const winnerName =
          f.winner === f.fighter1.id
            ? f.fighter1.lastName
            : f.winner === f.fighter2.id
              ? f.fighter2.lastName
              : f.winner; // "draw" / "nc" / null pass through

        const tags = (f.aiPostFightTags ?? {}) as Record<string, unknown>;
        const extra = [tags.methodNarrative, tags.momentDescription]
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .join(' | ');

        const { character, usage } = await extractCharacterFromRecap({
          fighter1: f.fighter1.lastName,
          fighter2: f.fighter2.lastName,
          weightClass: f.weightClass,
          isTitle: f.isTitle,
          promotion: f.event?.promotion ?? null,
          winnerName,
          method: f.method,
          round: f.round,
          time: f.time,
          recap: f.aiPostFightSummary as string,
          extraContext: extra || null,
        });
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;

        if (!character) {
          nullCharacter++;
        } else if (persist) {
          // Merge-only: existing keys preserved, only character* keys set.
          await prisma.fight.update({
            where: { id: f.id },
            data: {
              aiPostFightTags: {
                ...tags,
                character,
                characterMeta: {
                  source: 'recap-pilot-v1',
                  taggedAt: new Date().toISOString(),
                },
              } as any,
            },
          });
          written++;
        }

        done++;
        if (done <= 3 && character) {
          console.log(`\n--- ${f.fighter1.lastName} vs ${f.fighter2.lastName} ---`);
          console.log(JSON.stringify(character, null, 1));
        }
        if (done % 50 === 0) console.log(`  ${done}/${fights.length} ...`);
      } catch (e: any) {
        failures.push(`${f.id}: ${e?.message ?? e}`);
      }
    }
  }

  const slices: (typeof fights)[] = Array.from({ length: CONCURRENCY }, () => []);
  fights.forEach((f, i) => slices[i % CONCURRENCY].push(f));
  await Promise.all(slices.map(worker));

  console.log(
    `\nDone: ${done}/${fights.length} tagged` +
      (persist ? `, ${written} written` : ' (dry-run, nothing written)') +
      `, ${nullCharacter} null-character, ${failures.length} failures`,
  );
  console.log(
    `Tokens: ${inputTokens} in / ${outputTokens} out ` +
      `(~$${((inputTokens / 1e6) * 1 + (outputTokens / 1e6) * 5).toFixed(2)})`,
  );
  if (failures.length) console.log(failures.slice(0, 5).join('\n'));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
