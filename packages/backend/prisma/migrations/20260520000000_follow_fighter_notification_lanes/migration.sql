-- CreateEnum
CREATE TYPE "FollowNotificationLane" AS ENUM ('BOOKED', 'THREE_DAY', 'MORNING_OF', 'WALKOUT');

-- AlterTable
ALTER TABLE "fight_notification_matches" ADD COLUMN     "bookedSentAt" TIMESTAMP(3),
ADD COLUMN     "morningOfSentAt" TIMESTAMP(3),
ADD COLUMN     "threeDaySentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyFollowed3DayWarn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFollowedBooked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFollowedMorningOf" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFollowedWalkout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York';

-- CreateTable
CREATE TABLE "follow_notification_events" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "fighterId" TEXT,
    "lane" "FollowNotificationLane" NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "follow_notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_notification_events_userId_dispatchedAt_idx" ON "follow_notification_events"("userId", "dispatchedAt");

-- CreateIndex
CREATE INDEX "follow_notification_events_fightId_lane_idx" ON "follow_notification_events"("fightId", "lane");

-- CreateIndex
CREATE INDEX "follow_notification_events_fighterId_idx" ON "follow_notification_events"("fighterId");

-- CreateIndex
CREATE INDEX "fight_notification_matches_threeDaySentAt_idx" ON "fight_notification_matches"("threeDaySentAt");

-- CreateIndex
CREATE INDEX "fight_notification_matches_morningOfSentAt_idx" ON "fight_notification_matches"("morningOfSentAt");

-- AddForeignKey
ALTER TABLE "follow_notification_events" ADD CONSTRAINT "follow_notification_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "fight_notification_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
