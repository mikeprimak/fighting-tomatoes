-- Add nested comments support to PreFightComment
ALTER TABLE "pre_fight_comments" ADD COLUMN "parentCommentId" TEXT;

-- Add foreign key constraint for nested pre-fight comments
ALTER TABLE "pre_fight_comments" ADD CONSTRAINT "pre_fight_comments_parentCommentId_fkey"
  FOREIGN KEY ("parentCommentId") REFERENCES "pre_fight_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the unique constraint on userId + fightId for pre-fight comments
-- This allows users to have both a top-level comment AND replies
ALTER TABLE "pre_fight_comments" DROP CONSTRAINT IF EXISTS "pre_fight_comments_userId_fightId_key";

-- Also drop the unique index (Prisma creates both constraint and index)
DROP INDEX IF EXISTS "pre_fight_comments_userId_fightId_key";

-- Add nested comments support to FightReview (post-fight comments)
ALTER TABLE "fight_reviews" ADD COLUMN "parentReviewId" TEXT;

-- Add foreign key constraint for nested fight reviews
ALTER TABLE "fight_reviews" ADD CONSTRAINT "fight_reviews_parentReviewId_fkey"
  FOREIGN KEY ("parentReviewId") REFERENCES "fight_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the unique constraint on userId + fightId for fight reviews
-- This allows users to have both a top-level review AND replies
ALTER TABLE "fight_reviews" DROP CONSTRAINT IF EXISTS "fight_reviews_userId_fightId_key";

-- Also drop the unique index for fight reviews
DROP INDEX IF EXISTS "fight_reviews_userId_fightId_key";

-- Make rating optional for fight review replies (only top-level reviews need ratings)
ALTER TABLE "fight_reviews" ALTER COLUMN "rating" DROP NOT NULL;
