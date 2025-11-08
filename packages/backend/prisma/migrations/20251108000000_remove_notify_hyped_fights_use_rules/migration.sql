-- AlterTable: Remove notifyHypedFights column from users table
-- This feature now uses the UserNotificationRule system instead
ALTER TABLE "users" DROP COLUMN "notifyHypedFights";
