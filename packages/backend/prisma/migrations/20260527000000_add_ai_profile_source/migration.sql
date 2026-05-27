-- Provenance marker for fighter AI profiles (see docs/areas/ai-enrichment.md Phase 5a).
-- 'handauthored' = premium Opus bio (one-time backfill / hand-author re-author passes).
-- 'cron-haiku'   = daily Haiku enrichment cron.
-- The cron's candidate selection skips 'handauthored' so Haiku never overwrites a
-- hand-authored bio (even when the fighter's record changes). Hand-author writes are
-- unconditional, so Opus always overwrites a Haiku bio on conflict.
ALTER TABLE "fighters" ADD COLUMN "aiProfileSource" TEXT;

-- One-time backfill: as of this migration the entire profiled set is the just-completed
-- top-367 Opus hand-author backfill (the daily cron had barely run). Mark them all
-- 'handauthored' so they are protected. A negligible number of early cron-tail bios
-- may be over-pinned by this; the next Opus re-author routine reconciles them.
UPDATE "fighters" SET "aiProfileSource" = 'handauthored' WHERE "aiProfileEnrichedAt" IS NOT NULL;
