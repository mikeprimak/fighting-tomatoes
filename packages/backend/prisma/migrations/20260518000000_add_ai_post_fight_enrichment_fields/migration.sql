-- AI post-fight enrichment fields on fights (see docs/areas/ai-enrichment.md Phase 6).
-- Sibling to the pre-fight aiTags/aiPreview/aiPreviewShort columns added 2026-05-16.
-- All nullable / safe defaults; no data backfill required.
ALTER TABLE "fights" ADD COLUMN "aiPostFightTags" JSONB;
ALTER TABLE "fights" ADD COLUMN "aiPostFightSummary" TEXT;
ALTER TABLE "fights" ADD COLUMN "aiPostFightEnrichedAt" TIMESTAMP(3);
