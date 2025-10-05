-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('USER_LIFECYCLE', 'AUTH_SESSION', 'CONTENT_INTERACTION', 'USER_ACTION', 'NAVIGATION', 'ENGAGEMENT', 'CONVERSION', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'PREDICTION', 'ROUND_VOTE', 'RATING', 'REACTION', 'FIGHT_UPDATE', 'FIGHT_RESULT', 'DELETED');

-- CreateEnum
CREATE TYPE "PredictionMethod" AS ENUM ('DECISION', 'KO_TKO', 'SUBMISSION');

-- AlterTable
ALTER TABLE "fight_predictions" ADD COLUMN     "accuracyScore" DOUBLE PRECISION,
ADD COLUMN     "confidence" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "isCorrectMethod" BOOLEAN,
ADD COLUMN     "isCorrectRound" BOOLEAN,
ADD COLUMN     "isCorrectWinner" BOOLEAN,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "predictedMethod" "PredictionMethod",
ADD COLUMN     "predictedRound" INTEGER,
ADD COLUMN     "predictedWinner" TEXT,
ALTER COLUMN "predictedRating" DROP NOT NULL;

-- AlterTable
ALTER TABLE "fights" ADD COLUMN     "completedRounds" INTEGER,
ADD COLUMN     "currentRound" INTEGER,
ADD COLUMN     "scheduledRounds" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "startTime" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyCrewInvites" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyCrewMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyEventStart" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFightResults" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFightStart" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMainCardOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyRoundChanges" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyUFCOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pushToken" TEXT;

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "properties" JSONB,
    "userAgent" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "platform" TEXT,
    "appVersion" TEXT,
    "deviceId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "screenViewCount" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "ratingsGiven" INTEGER NOT NULL DEFAULT 0,
    "reviewsPosted" INTEGER NOT NULL DEFAULT 0,
    "wasConverted" BOOLEAN NOT NULL DEFAULT false,
    "lastScreenName" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "returningUsers" INTEGER NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalTags" INTEGER NOT NULL DEFAULT 0,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "avgSessionDuration" DOUBLE PRECISION,
    "totalScreenViews" INTEGER NOT NULL DEFAULT 0,
    "fightsRated" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "fightsViewed" INTEGER NOT NULL DEFAULT 0,
    "platformMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crews" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "maxMembers" INTEGER NOT NULL DEFAULT 20,
    "createdBy" TEXT NOT NULL,
    "allowPredictions" BOOLEAN NOT NULL DEFAULT true,
    "allowRoundVoting" BOOLEAN NOT NULL DEFAULT true,
    "allowReactions" BOOLEAN NOT NULL DEFAULT true,
    "followOnlyUFC" BOOLEAN NOT NULL DEFAULT false,
    "totalMembers" INTEGER NOT NULL DEFAULT 1,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "totalFights" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "role" "CrewRole" NOT NULL DEFAULT 'MEMBER',
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "predictionsCount" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_messages" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT,
    "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
    "fightId" TEXT,
    "structuredData" JSONB,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "crew_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_predictions" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "hypeLevel" INTEGER,
    "predictedWinner" TEXT,
    "predictedMethod" "PredictionMethod",
    "predictedRound" INTEGER,
    "confidence" INTEGER NOT NULL DEFAULT 5,
    "isCorrectWinner" BOOLEAN,
    "isCorrectMethod" BOOLEAN,
    "isCorrectRound" BOOLEAN,
    "accuracyScore" DOUBLE PRECISION,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crew_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_round_votes" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "winner" TEXT NOT NULL,
    "score" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_round_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_reactions" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT,
    "emoji" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_eventName_createdAt_idx" ON "analytics_events"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_userId_createdAt_idx" ON "analytics_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_createdAt_idx" ON "analytics_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_platform_createdAt_idx" ON "analytics_events"("platform", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_sessionId_key" ON "user_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "user_sessions_userId_startedAt_idx" ON "user_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "user_sessions_sessionId_idx" ON "user_sessions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_date_key" ON "daily_metrics"("date");

-- CreateIndex
CREATE INDEX "daily_metrics_date_idx" ON "daily_metrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "crews_inviteCode_key" ON "crews"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "crew_members_userId_crewId_key" ON "crew_members"("userId", "crewId");

-- CreateIndex
CREATE INDEX "crew_messages_crewId_createdAt_idx" ON "crew_messages"("crewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crew_predictions_crewId_userId_fightId_key" ON "crew_predictions"("crewId", "userId", "fightId");

-- CreateIndex
CREATE UNIQUE INDEX "crew_round_votes_crewId_userId_fightId_roundNumber_key" ON "crew_round_votes"("crewId", "userId", "fightId", "roundNumber");

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crews" ADD CONSTRAINT "crews_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_messages" ADD CONSTRAINT "crew_messages_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_messages" ADD CONSTRAINT "crew_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_messages" ADD CONSTRAINT "crew_messages_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_predictions" ADD CONSTRAINT "crew_predictions_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_predictions" ADD CONSTRAINT "crew_predictions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_predictions" ADD CONSTRAINT "crew_predictions_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_round_votes" ADD CONSTRAINT "crew_round_votes_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_round_votes" ADD CONSTRAINT "crew_round_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_round_votes" ADD CONSTRAINT "crew_round_votes_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_reactions" ADD CONSTRAINT "crew_reactions_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_reactions" ADD CONSTRAINT "crew_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_reactions" ADD CONSTRAINT "crew_reactions_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
