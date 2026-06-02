-- Add COMMENT_REPLIED to the NotificationType enum (used for "someone replied
-- to your comment" notifications). ADD VALUE is safe inside migrate deploy's
-- transaction on PG12+ as long as the new value isn't used in the same migration.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_REPLIED';
