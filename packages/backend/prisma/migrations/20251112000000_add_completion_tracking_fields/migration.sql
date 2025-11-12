-- AlterTable
ALTER TABLE "fights" ADD COLUMN "isCancelled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fights" ADD COLUMN "completionMethod" TEXT;
ALTER TABLE "fights" ADD COLUMN "completedAt" TIMESTAMP(3);
