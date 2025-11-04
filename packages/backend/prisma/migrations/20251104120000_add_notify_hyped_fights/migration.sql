-- AlterTable: Add notifyHypedFights field
-- Users will receive notifications 15 minutes before fights with 8.5+ hype

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifyHypedFights" BOOLEAN NOT NULL DEFAULT true;
