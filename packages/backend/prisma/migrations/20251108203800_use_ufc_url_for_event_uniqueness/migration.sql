-- AlterTable: Make ufcUrl required and unique
-- First, update any NULL ufcUrl values to a default (shouldn't be any from scraper)
UPDATE "events" SET "ufcUrl" = CONCAT('https://www.ufc.com/event/', LOWER(REPLACE(name, ' ', '-'))) WHERE "ufcUrl" IS NULL;

-- Remove the old unique constraint on (name, date)
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_name_date_key";

-- Delete duplicate events - keep the one with the most fights
-- This handles events like "UFC Fight Night Bonfim vs. Brown" that exist twice
WITH duplicates AS (
  SELECT
    e.id,
    e."ufcUrl",
    COUNT(f.id) as fight_count,
    ROW_NUMBER() OVER (PARTITION BY e."ufcUrl" ORDER BY COUNT(f.id) DESC, e."createdAt" ASC) as rn
  FROM "events" e
  LEFT JOIN "fights" f ON f."eventId" = e.id
  WHERE e."ufcUrl" IS NOT NULL
  GROUP BY e.id, e."ufcUrl"
)
DELETE FROM "events"
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Make ufcUrl NOT NULL
ALTER TABLE "events" ALTER COLUMN "ufcUrl" SET NOT NULL;

-- Add unique constraint on ufcUrl
ALTER TABLE "events" ADD CONSTRAINT "events_ufcUrl_key" UNIQUE ("ufcUrl");
