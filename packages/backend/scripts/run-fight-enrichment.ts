/**
 * Cron / ad-hoc wrapper for the fight enrichment orchestrator.
 *
 * Env knobs:
 *   AI_ENRICHMENT_DRY_RUN=1        compute matches but do not write
 *   AI_ENRICHMENT_MAX_EVENTS=N     safety cap (default 50)
 *   AI_ENRICHMENT_ONLY_EVENT_ID=…  restrict to a single event (manual)
 *   AI_ENRICHMENT_IGNORE_WINDOW=1  enrich even if out-of-window (manual)
 *
 *   DATABASE_URL                   required
 *   ANTHROPIC_API_KEY              required (Haiku 4.5 extraction)
 *   BRAVE_API_KEY                  required (editorial search)
 *
 * Exits 0 on success (even with per-event errors), 1 on fatal setup failure.
 */

import { PrismaClient } from '@prisma/client';
import { runFightEnrichment } from '../src/services/aiEnrichment/run';

function envFlag(name: string): boolean {
  const v = process.env[name];
  return !!v && v !== '0' && v.toLowerCase() !== 'false';
}

function envInt(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

(async () => {
  // Fail fast on missing creds — same posture as broadcast discovery.
  for (const key of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'BRAVE_API_KEY']) {
    if (!process.env[key]) {
      console.error(`[run-fight-enrichment] FATAL: ${key} missing`);
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  try {
    const summary = await runFightEnrichment(prisma, {
      dryRun: envFlag('AI_ENRICHMENT_DRY_RUN'),
      maxEvents: envInt('AI_ENRICHMENT_MAX_EVENTS'),
      ignoreWindow: envFlag('AI_ENRICHMENT_IGNORE_WINDOW'),
      onlyEventId: process.env.AI_ENRICHMENT_ONLY_EVENT_ID,
    });
    console.log(JSON.stringify(summary, null, 2));
    // Non-zero exit only on fatal setup, not per-event errors — that way a
    // single bad event doesn't fail the whole cron.
    process.exit(0);
  } catch (err: any) {
    console.error('[run-fight-enrichment] fatal:', err?.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
