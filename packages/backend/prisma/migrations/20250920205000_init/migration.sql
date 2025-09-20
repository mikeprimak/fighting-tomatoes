/*
  Warnings:

  - You are about to drop the column `organizationId` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `posterUrl` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `shortName` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `comment` on the `fight_ratings` table. All the data in the column will be lost.
  - You are about to drop the column `photoUrl` on the `fighters` table. All the data in the column will be lost.
  - You are about to drop the column `record` on the `fighters` table. All the data in the column will be lost.
  - The `weightClass` column on the `fighters` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `endRound` on the `fights` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `fights` table. All the data in the column will be lost.
  - You are about to drop the column `fightOrder` on the `fights` table. All the data in the column will be lost.
  - You are about to drop the column `fighterAId` on the `fights` table. All the data in the column will be lost.
  - You are about to drop the column `fighterBId` on the `fights` table. All the data in the column will be lost.
  - You are about to drop the column `result` on the `fights` table. All the data in the column will be lost.
  - You are about to drop the column `rounds` on the `fights` table. All the data in the column will be lost.
  - The `weightClass` column on the `fights` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `isVerified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `lastLogin` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `organizations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[googleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[appleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `promotion` to the `events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gender` to the `fighters` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fighter1Id` to the `fights` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fighter2Id` to the `fights` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderOnCard` to the `fights` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "WeightClass" AS ENUM ('STRAWWEIGHT', 'FLYWEIGHT', 'BANTAMWEIGHT', 'FEATHERWEIGHT', 'LIGHTWEIGHT', 'WELTERWEIGHT', 'MIDDLEWEIGHT', 'LIGHT_HEAVYWEIGHT', 'HEAVYWEIGHT', 'SUPER_HEAVYWEIGHT', 'WOMENS_STRAWWEIGHT', 'WOMENS_FLYWEIGHT', 'WOMENS_BANTAMWEIGHT', 'WOMENS_FEATHERWEIGHT');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('MMA', 'BOXING', 'BARE_KNUCKLE_BOXING', 'MUAY_THAI', 'KICKBOXING');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'MISINFORMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TagCategory" AS ENUM ('STYLE', 'PACE', 'OUTCOME', 'EMOTION', 'QUALITY');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('FIGHT_RATED', 'REVIEW_WRITTEN', 'PREDICTION_MADE', 'PREDICTION_ACCURATE', 'REVIEW_UPVOTED', 'DAILY_LOGIN', 'FIGHTER_FOLLOWED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FIGHT_STARTING', 'FIGHTER_FIGHTING_SOON', 'REVIEW_UPVOTED', 'LEVEL_UP', 'PREDICTION_RESULT', 'SYSTEM_ANNOUNCEMENT');

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "fights" DROP CONSTRAINT "fights_fighterAId_fkey";

-- DropForeignKey
ALTER TABLE "fights" DROP CONSTRAINT "fights_fighterBId_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "organizationId",
DROP COLUMN "posterUrl",
DROP COLUMN "shortName",
ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bannerImage" TEXT,
ADD COLUMN     "greatFights" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasStarted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mainChannel" TEXT,
ADD COLUMN     "mainLink" TEXT,
ADD COLUMN     "mainStartTime" TIMESTAMP(3),
ADD COLUMN     "prelimChannel" TEXT,
ADD COLUMN     "prelimLink" TEXT,
ADD COLUMN     "prelimStartTime" TIMESTAMP(3),
ADD COLUMN     "promotion" TEXT NOT NULL,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "fight_ratings" DROP COLUMN "comment";

-- AlterTable
ALTER TABLE "fighters" DROP COLUMN "photoUrl",
DROP COLUMN "record",
ADD COLUMN     "actionImage" TEXT,
ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "championshipTitle" TEXT,
ADD COLUMN     "draws" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gender" "Gender" NOT NULL,
ADD COLUMN     "greatFights" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isChampion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "losses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "noContests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profileImage" TEXT,
ADD COLUMN     "sport" "Sport" NOT NULL DEFAULT 'MMA',
ADD COLUMN     "totalFights" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wins" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "weightClass",
ADD COLUMN     "weightClass" "WeightClass";

-- AlterTable
ALTER TABLE "fights" DROP COLUMN "endRound",
DROP COLUMN "endTime",
DROP COLUMN "fightOrder",
DROP COLUMN "fighterAId",
DROP COLUMN "fighterBId",
DROP COLUMN "result",
DROP COLUMN "rounds",
ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fighter1Id" TEXT NOT NULL,
ADD COLUMN     "fighter2Id" TEXT NOT NULL,
ADD COLUMN     "hasStarted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "highlightUrl" TEXT,
ADD COLUMN     "isComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "orderOnCard" INTEGER NOT NULL,
ADD COLUMN     "ratings1" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings10" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings2" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings3" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings4" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings5" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings6" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings7" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings8" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratings9" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "round" INTEGER,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "time" TEXT,
ADD COLUMN     "titleName" TEXT,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalReviews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "watchPlatform" TEXT,
ADD COLUMN     "watchUrl" TEXT,
DROP COLUMN "weightClass",
ADD COLUMN     "weightClass" "WeightClass";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "isVerified",
DROP COLUMN "lastLogin",
DROP COLUMN "username",
ADD COLUMN     "accuracyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "appleId" TEXT,
ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "downvotesReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMedia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "mediaOrganization" TEXT,
ADD COLUMN     "mediaWebsite" TEXT,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalReviews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "upvotesReceived" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wantsEmails" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "password" DROP NOT NULL;

-- DropTable
DROP TABLE "organizations";

-- DropTable
DROP TABLE "sessions";

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_predictions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "predictedRating" INTEGER NOT NULL,
    "actualRating" INTEGER,
    "accuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fight_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "articleUrl" TEXT,
    "articleTitle" TEXT,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fight_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "isUpvote" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TagCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "forHighRatings" BOOLEAN NOT NULL DEFAULT false,
    "forMediumRatings" BOOLEAN NOT NULL DEFAULT false,
    "forLowRatings" BOOLEAN NOT NULL DEFAULT false,
    "forVeryLowRatings" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fight_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_fighter_follows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fighterId" TEXT NOT NULL,
    "dayBeforeNotification" BOOLEAN NOT NULL DEFAULT true,
    "startOfFightNotification" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_fighter_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "alertTime" TIMESTAMP(3) NOT NULL,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fight_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "fightId" TEXT,
    "reviewId" TEXT,
    "predictionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "linkType" TEXT,
    "linkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "isViewed" BOOLEAN NOT NULL DEFAULT false,
    "isRated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "fight_predictions_userId_fightId_key" ON "fight_predictions"("userId", "fightId");

-- CreateIndex
CREATE UNIQUE INDEX "fight_reviews_userId_fightId_key" ON "fight_reviews"("userId", "fightId");

-- CreateIndex
CREATE UNIQUE INDEX "review_votes_userId_reviewId_key" ON "review_votes"("userId", "reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "fight_tags_userId_fightId_tagId_key" ON "fight_tags"("userId", "fightId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "user_fighter_follows_userId_fighterId_key" ON "user_fighter_follows"("userId", "fighterId");

-- CreateIndex
CREATE UNIQUE INDEX "fight_alerts_userId_fightId_key" ON "fight_alerts"("userId", "fightId");

-- CreateIndex
CREATE UNIQUE INDEX "user_recommendations_userId_fightId_key" ON "user_recommendations"("userId", "fightId");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fights" ADD CONSTRAINT "fights_fighter1Id_fkey" FOREIGN KEY ("fighter1Id") REFERENCES "fighters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fights" ADD CONSTRAINT "fights_fighter2Id_fkey" FOREIGN KEY ("fighter2Id") REFERENCES "fighters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_predictions" ADD CONSTRAINT "fight_predictions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_predictions" ADD CONSTRAINT "fight_predictions_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_reviews" ADD CONSTRAINT "fight_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_reviews" ADD CONSTRAINT "fight_reviews_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "fight_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "fight_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_tags" ADD CONSTRAINT "fight_tags_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_tags" ADD CONSTRAINT "fight_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fighter_follows" ADD CONSTRAINT "user_fighter_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fighter_follows" ADD CONSTRAINT "user_fighter_follows_fighterId_fkey" FOREIGN KEY ("fighterId") REFERENCES "fighters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_alerts" ADD CONSTRAINT "fight_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_alerts" ADD CONSTRAINT "fight_alerts_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
