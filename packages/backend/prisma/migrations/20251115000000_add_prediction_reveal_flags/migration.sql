-- AlterTable
ALTER TABLE "fight_predictions" ADD COLUMN "hasRevealedHype" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasRevealedWinner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasRevealedMethod" BOOLEAN NOT NULL DEFAULT false;
