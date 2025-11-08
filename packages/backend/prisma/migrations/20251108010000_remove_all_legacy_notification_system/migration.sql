-- Remove all legacy notification system tables and fields
-- This migrates everything to the new UserNotificationRule system

-- Step 1: Remove User table notification preference fields
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyFollowedFighterFights";
ALTER TABLE "users" DROP COLUMN IF EXISTS "notifyPreEventReport";

-- Step 2: Remove UserFighterFollow notification fields
ALTER TABLE "user_fighter_follows" DROP COLUMN IF EXISTS "dayBeforeNotification";
ALTER TABLE "user_fighter_follows" DROP COLUMN IF EXISTS "startOfFightNotification";

-- Step 3: Drop FightAlert table entirely
DROP TABLE IF EXISTS "fight_alerts";

-- Note: Existing users will need to reconfigure their notification preferences
-- using the new rule-based system. The Settings screen already supports this.
