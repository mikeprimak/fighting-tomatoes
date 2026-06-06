-- Event-level AI enrichment (services/aiEnrichment).
-- A card-wide "why care" one-liner that reasons across the whole card
-- ("3 title fights, a returning ex-champ"), distinct from the per-fight
-- aiPreviewShort. Written by the same enrichment pass; confidence-gated
-- (>=0.5) before display. All additive + nullable.
ALTER TABLE "events" ADD COLUMN "aiEventSummary" TEXT;
ALTER TABLE "events" ADD COLUMN "aiEventConfidence" DOUBLE PRECISION;
ALTER TABLE "events" ADD COLUMN "aiEventEnrichedAt" TIMESTAMP(3);
