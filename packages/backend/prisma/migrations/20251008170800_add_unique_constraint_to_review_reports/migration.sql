-- AlterTable: Add unique constraint to review_reports table
CREATE UNIQUE INDEX "review_reports_reporterId_reviewId_key" ON "review_reports"("reporterId", "reviewId");
