/**
 * Cron / ad-hoc wrapper for the FIGHTER-PROFILE enrichment orchestrator.
 *
 * Env knobs:
 *   FIGHTER_PROFILE_DRY_RUN=1          run the pipeline but do not write
 *   FIGHTER_PROFILE_MAX_FIGHTERS=N     safety cap (default 40)
 *   FIGHTER_PROFILE_MIN_RATINGS=N      engagement threshold (default 25)
 *   FIGHTER_PROFILE_STALE_DAYS=N       re-enrich profiles older than N days (default 180)
 *   FIGHTER_PROFILE_ONLY_FIGHTER_ID=…  restrict to a single fighter (manual)
 *   FIGHTER_PROFILE_IGNORE_THRESHOLD=1 ignore the engagement bar (manual cohort backfill)
 *
 *   DATABASE_URL                       required
 *   ANTHROPIC_API_KEY                  required (Haiku 4.5 extraction)
 *   BRAVE_API_KEY                      required (editorial bio search)
 *
 * Exits 0 on success (even with per-fighter errors), 1 on fatal setup failure.
 */

import { PrismaClient } from '@prisma/client';
import { runFighterProfileEnrichment } from '../src/services/aiEnrichment/fighterProfile/runFighterProfile';

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
      console.error(`[run-fighter-profile-enrichment] FATAL: ${key} missing`);
      process.exit(1);
    }
  }

  const prisma = new PrismaClient();
  try {
    const summary = await runFighterProfileEnrichment(prisma, {
      dryRun: envFlag('FIGHTER_PROFILE_DRY_RUN'),
      maxFighters: envInt('FIGHTER_PROFILE_MAX_FIGHTERS'),
      minRatings: envInt('FIGHTER_PROFILE_MIN_RATINGS'),
      staleDays: envInt('FIGHTER_PROFILE_STALE_DAYS'),
      ignoreThreshold: envFlag('FIGHTER_PROFILE_IGNORE_THRESHOLD'),
      onlyFighterId: process.env.FIGHTER_PROFILE_ONLY_FIGHTER_ID,
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('[run-fighter-profile-enrichment] fatal:', err?.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
