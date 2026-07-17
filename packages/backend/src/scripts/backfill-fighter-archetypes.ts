/**
 * Fighter-archetype backfill — derive styleArchetype + fighterAppeals tokens
 * for every fighter that already carries an aiProfile, from the STORED prose
 * only (no fetching). Fighter-side sibling of backfill-character-tags.ts.
 *
 * Guardrails honored here:
 *   - NO schema change, no prisma migrate anything.
 *   - MERGE-ONLY write: sets the styleArchetype/fighterAppeals (+ archetypeMeta)
 *     keys inside the existing aiProfile JSONB. Never touches aiProfileSummary,
 *     aiProfileSource (Opus-bio provenance pin), aiProfileEnrichedAt, or any
 *     other column — this is annotation, not re-enrichment.
 *   - Default is DRY-RUN. Writes require --persist.
 *   - Resumable: fighters whose aiProfile already carries archetypeMeta are
 *     skipped (so [] results don't get re-called). --force re-tags.
 *
 * Usage (from packages/backend/):
 *   npx tsx src/scripts/backfill-fighter-archetypes.ts --limit 5
 *   npx tsx src/scripts/backfill-fighter-archetypes.ts --persist
 */
import { prisma } from '../lib/prisma';
import {
  extractArchetypeFromProfile,
  hasUsableProse,
  type ArchetypeProseInput,
} from '../services/aiEnrichment/fighterProfile/extractArchetypeFromProfile';

// Inputs are small (~700 tok incl. cached system read); 2 workers + 1.5s pacing
// stays well under the 50k input-tok/min org limit. 429s back off and retry.
const CONCURRENCY = 2;
const PER_CALL_DELAY_MS = 1500;
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

  const all = await prisma.fighter.findMany({
    where: { aiProfile: { not: null as any } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      weightClass: true,
      sport: true,
      aiProfile: true,
    },
  });

  let fighters = all.filter((f) => {
    const p = (f.aiProfile ?? {}) as Record<string, unknown>;
    return force || !p.archetypeMeta;
  });
  if (limit) fighters = fighters.slice(0, limit);

  console.log(
    `${all.length} fighters with aiProfile; ${fighters.length} to tag` +
      `${persist ? ' (PERSIST)' : ' (dry-run)'}${force ? ' (force)' : ''}`,
  );

  let done = 0;
  let written = 0;
  let emptyTokens = 0;
  let skippedNoProse = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const failures: string[] = [];

  async function worker(slice: typeof fighters) {
    for (const f of slice) {
      try {
        const p = (f.aiProfile ?? {}) as Record<string, unknown>;
        const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
        const input: ArchetypeProseInput = {
          name: `${f.firstName} ${f.lastName}`.trim(),
          weightClass: f.weightClass,
          sport: f.sport ?? 'MMA',
          tldr: str(p.tldr),
          style: str(p.style),
          appeal: str(p.appeal),
          careerArc: str(p.careerArc),
          personaType: str(p.personaType),
          whyFansLove: str(p.whyFansLove),
          whyFansHate: str(p.whyFansHate),
        };

        if (!hasUsableProse(input)) {
          skippedNoProse++;
          done++;
          continue;
        }

        const { tokens, usage } = await withRateLimitRetry(() =>
          extractArchetypeFromProfile(input),
        );
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        await sleep(PER_CALL_DELAY_MS);

        if (!tokens) {
          failures.push(`${f.id} (${input.name}): unparseable model output`);
          done++;
          continue;
        }
        if (tokens.styleArchetype.length === 0 && tokens.fighterAppeals.length === 0) {
          emptyTokens++;
        }

        if (persist) {
          // Merge-only: existing profile keys preserved, only the token fields
          // (+ provenance marker) set. archetypeMeta doubles as the resume skip.
          await prisma.fighter.update({
            where: { id: f.id },
            data: {
              aiProfile: {
                ...p,
                styleArchetype: tokens.styleArchetype,
                fighterAppeals: tokens.fighterAppeals,
                archetypeMeta: {
                  source: 'prose-backfill-v1',
                  confidence: tokens.confidence,
                  taggedAt: new Date().toISOString(),
                },
              } as any,
            },
          });
          written++;
        }

        done++;
        if (done <= 8) {
          console.log(
            `\n--- ${input.name} (persona: ${input.personaType ?? 'null'}) ---\n` +
              `  style:   [${tokens.styleArchetype.join(', ')}]\n` +
              `  appeals: [${tokens.fighterAppeals.join(', ')}]  (conf ${tokens.confidence})`,
          );
        }
        if (done % 50 === 0) console.log(`  ${done}/${fighters.length} ...`);
      } catch (e: any) {
        failures.push(`${f.id}: ${e?.message ?? e}`);
        done++;
      }
    }
  }

  const slices: (typeof fighters)[] = Array.from({ length: CONCURRENCY }, () => []);
  fighters.forEach((f, i) => slices[i % CONCURRENCY].push(f));
  await Promise.all(slices.map(worker));

  console.log(
    `\nDone: ${done}/${fighters.length}` +
      (persist ? `, ${written} written` : ' (dry-run, nothing written)') +
      `, ${emptyTokens} empty-token, ${skippedNoProse} skipped (no prose), ${failures.length} failures`,
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
