-- AI enrichment fields on fights (see docs/areas/ai-enrichment.md).
-- All nullable / safe defaults; no data backfill required.
ALTER TABLE "fights" ADD COLUMN "aiTags" JSONB;
ALTER TABLE "fights" ADD COLUMN "aiPreviewShort" TEXT;
ALTER TABLE "fights" ADD COLUMN "aiPreview" TEXT;
ALTER TABLE "fights" ADD COLUMN "aiEnrichedAt" TIMESTAMP(3);
ALTER TABLE "fights" ADD COLUMN "aiSourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "fights" ADD COLUMN "aiConfidence" DOUBLE PRECISION;
