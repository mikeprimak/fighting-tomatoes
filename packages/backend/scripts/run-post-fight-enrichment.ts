/**
 * Cron / ad-hoc wrapper for the POST-fight enrichment orchestrator.
 *
 * Env knobs:
 *   POST_FIGHT_DRY_RUN=1            compute matches but do not write
 *   POST_FIGHT_MAX_EVENTS=N        safety cap (default 25)
 *   POST_FIGHT_MIN_DAYS_AFTER=N    days after event before enriching (default 5)
 *   POST_FIGHT_MAX_AGE_DAYS=N      ceiling on event age (default 45)
 *   POST_FIGHT_ONLY_EVENT_ID=…     restrict to a single event (manual)
 *   POST_FIGHT_IGNORE_WINDOW=1     ignore the T+5d / max-age window (manual)
 *
 *   DATABASE_URL                   required
 *   ANTHROPIC_API_KEY              required (Haiku 4.5 extraction)
 *   BRAVE_API_KEY                  required (editorial recap search)
 *
 * Exits 0 on success (even with per-event errors), 1 on fatal setup failure.
 */

import { PrismaClient } from '@prisma/client';
import { runPostFightEnrichment } from '../src/services/aiEnrichment/postFight/runPostFight';

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
  for (const key of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'BRAVE_API_KEY']) {
    if (!process.env[key]) {
      console.error(`[run-post-fight-enrichment] FATAL: ${key} missing`);
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  try {
    const summary = await runPostFightEnrichment(prisma, {
      dryRun: envFlag('POST_FIGHT_DRY_RUN'),
      maxEvents: envInt('POST_FIGHT_MAX_EVENTS'),
      minDaysAfter: envInt('POST_FIGHT_MIN_DAYS_AFTER'),
      maxAgeDays: envInt('POST_FIGHT_MAX_AGE_DAYS'),
      ignoreWindow: envFlag('POST_FIGHT_IGNORE_WINDOW'),
      onlyEventId: process.env.POST_FIGHT_ONLY_EVENT_ID,
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('[run-post-fight-enrichment] fatal:', err?.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
