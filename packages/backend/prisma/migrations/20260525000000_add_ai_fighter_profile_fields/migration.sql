-- AI fighter-profile enrichment fields on fighters (see docs/areas/ai-enrichment.md Phase 5).
-- Mirrors the Fight.ai* pre/post-fight columns. All nullable / safe defaults; no backfill required.
-- String[] maps to a Postgres text[] with an empty-array default, matching aiSourceUrls on fights.
ALTER TABLE "fighters" ADD COLUMN "aiProfile" JSONB;
ALTER TABLE "fighters" ADD COLUMN "aiProfileSummary" TEXT;
ALTER TABLE "fighters" ADD COLUMN "aiProfileEnrichedAt" TIMESTAMP(3);
ALTER TABLE "fighters" ADD COLUMN "aiProfileSourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "fighters" ADD COLUMN "aiProfileConfidence" DOUBLE PRECISION;
ALTER TABLE "fighters" ADD COLUMN "aiProfileRecordAtEnrich" TEXT;
