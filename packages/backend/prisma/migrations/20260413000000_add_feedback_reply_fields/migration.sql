-- Add admin reply tracking to user_feedback
ALTER TABLE "user_feedback"
  ADD COLUMN "replyBody" TEXT,
  ADD COLUMN "repliedAt" TIMESTAMP(3),
  ADD COLUMN "repliedBy" TEXT;
