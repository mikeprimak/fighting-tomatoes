-- Rename trackerMode → scraperType
ALTER TABLE "events" RENAME COLUMN "trackerMode" TO "scraperType";

-- Clear obsolete values (manual, time-based, live are no longer valid)
UPDATE "events" SET "scraperType" = NULL WHERE "scraperType" IN ('manual', 'time-based', 'live');
