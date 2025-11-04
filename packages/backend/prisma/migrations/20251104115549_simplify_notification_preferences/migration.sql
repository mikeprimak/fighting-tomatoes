-- AlterTable: Simplify notification preferences
-- Remove old notification fields and add new simplified ones

-- Drop old notification preference columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyEventStart";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyFightStart";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyMainCardOnly";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyUFCOnly";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyCrewMessages";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyCrewInvites";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyRoundChanges";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyFightResults";

-- Add new notification preference columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifyFollowedFighterFights" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifyPreEventReport" BOOLEAN NOT NULL DEFAULT true;
