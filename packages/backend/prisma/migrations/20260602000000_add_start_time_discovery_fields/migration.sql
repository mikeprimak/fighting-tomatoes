-- Start-time discovery provenance (services/startTimeDiscovery).
-- Tapology and most aggregators publish only the main-card time; this records
-- when/how the earlier prelim/early-prelim times were inferred from web sources
-- so the daily resolver never clobbers a more-authoritative scraper/admin value.
-- All additive + nullable (text[] gets the empty-array default, matching aiSourceUrls).
ALTER TABLE "events" ADD COLUMN "startTimeSource" TEXT;
ALTER TABLE "events" ADD COLUMN "startTimeConfidence" DOUBLE PRECISION;
ALTER TABLE "events" ADD COLUMN "startTimeSourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "events" ADD COLUMN "startTimeDiscoveredAt" TIMESTAMP(3);
