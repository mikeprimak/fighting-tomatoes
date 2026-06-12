/**
 * Character-tag backfill — derive the fight-character taxonomy for ALL
 * completed fights that already carry a stored recap (aiPostFightSummary),
 * no scraping. Generalization of pilot-character-tagging.ts after the
 * 2026-06-11 pilot review froze FIGHT_CHARACTER_VOCAB.
 *
 * Guardrails honored here:
 *   - NO schema change, no prisma migrate anything.
 *   - MERGE-ONLY write: sets the `character` (+ `characterMeta`) keys inside
 *     the existing aiPostFightTags JSONB; never touches summaries, narrative
 *     fields, or any other column.
 *   - Default is DRY-RUN. Writes require --persist.
 *
 * Usage (from packages/backend/):
 *   npx tsx src/scripts/backfill-character-tags.ts --limit 5
 *   npx tsx src/scripts/backfill-character-tags.ts --persist          (all eligible)
 *   --force re-tags fights that already carry a character object.
 *   --min-ratings N  only fights with totalRatings >= N (default 0).
 */
import { prisma } from '../lib/prisma';
import { extractCharacterFromRecap } from '../services/aiEnrichment/postFight/extractCharacterFromRecap';

// Org rate limit is 50k input tokens/min on Haiku (~1.6k/call → ~30 calls/min).
// Two workers with a per-call delay keeps us under it; 429s back off and retry.
const CONCURRENCY = 2;
const PER_CALL_DELAY_MS = 4000;
const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate_limit/i.test(String(e?.message ?? ''));
      if (!is429 || attempt >= MAX_RETRIES) throw e;
      const backoff = 30_000 * (attempt + 1);
      console.log(`  429 rate limit, backing off ${backoff / 1000}s ...`);
      await sleep(backoff);
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const persist = flag('persist');
  const force = flag('force');
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const minRatings = arg('min-ratings') ? Number(arg('min-ratings')) : 0;

  const all = await prisma.fight.findMany({
    where: {
      fightStatus: 'COMPLETED',
      aiPostFightSummary: { not: null },
      totalRatings: { gte: minRatings },
    },
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
  });

  let fights = all
    .filter((f) => force || !(f.aiPostFightTags as any)?.character)
    .sort((a, b) => b.totalRatings - a.totalRatings);
  if (limit) fights = fights.slice(0, limit);

  console.log(
    `${all.length} completed fights with recaps; ${fights.length} to tag` +
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

        const { character, usage } = await withRateLimitRetry(() =>
          extractCharacterFromRecap({
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
          }),
        );
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        await sleep(PER_CALL_DELAY_MS);

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
                  source: 'recap-backfill-v1',
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
