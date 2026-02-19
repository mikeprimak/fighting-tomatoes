-- CreateEnum
CREATE TYPE "FightStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED');

-- AlterTable: Add new enum columns with defaults
ALTER TABLE "fights" ADD COLUMN "fightStatus" "FightStatus" NOT NULL DEFAULT 'UPCOMING';
ALTER TABLE "fights" ADD COLUMN "trackerFightStatus" "FightStatus";
ALTER TABLE "events" ADD COLUMN "eventStatus" "EventStatus" NOT NULL DEFAULT 'UPCOMING';

-- Migrate fight data (order matters: cancelled first, then completed, then live; UPCOMING is default)
UPDATE "fights" SET "fightStatus" = 'CANCELLED' WHERE "isCancelled" = true;
UPDATE "fights" SET "fightStatus" = 'COMPLETED' WHERE "isComplete" = true AND "isCancelled" = false;
UPDATE "fights" SET "fightStatus" = 'LIVE' WHERE "hasStarted" = true AND "isComplete" = false AND "isCancelled" = false;

-- Migrate tracker shadow fields
UPDATE "fights" SET "trackerFightStatus" = 'COMPLETED' WHERE "trackerIsComplete" = true;
UPDATE "fights" SET "trackerFightStatus" = 'LIVE' WHERE "trackerHasStarted" = true AND ("trackerIsComplete" IS NULL OR "trackerIsComplete" = false);

-- Migrate event data
UPDATE "events" SET "eventStatus" = 'COMPLETED' WHERE "isComplete" = true;
UPDATE "events" SET "eventStatus" = 'LIVE' WHERE "hasStarted" = true AND "isComplete" = false;

-- Drop old columns from fights
ALTER TABLE "fights" DROP COLUMN "hasStarted";
ALTER TABLE "fights" DROP COLUMN "isComplete";
ALTER TABLE "fights" DROP COLUMN "isCancelled";
ALTER TABLE "fights" DROP COLUMN "trackerHasStarted";
ALTER TABLE "fights" DROP COLUMN "trackerIsComplete";

-- Drop old columns from events
ALTER TABLE "events" DROP COLUMN "hasStarted";
ALTER TABLE "events" DROP COLUMN "isComplete";
