-- CreateTable
CREATE TABLE "user_notification_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "notifyMinutesBefore" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_notification_matches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fight_notification_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fight_notification_matches_userId_fightId_idx" ON "fight_notification_matches"("userId", "fightId");

-- CreateIndex
CREATE INDEX "fight_notification_matches_fightId_isActive_idx" ON "fight_notification_matches"("fightId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "fight_notification_matches_userId_fightId_ruleId_key" ON "fight_notification_matches"("userId", "fightId", "ruleId");

-- AddForeignKey
ALTER TABLE "user_notification_rules" ADD CONSTRAINT "user_notification_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_notification_matches" ADD CONSTRAINT "fight_notification_matches_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "user_notification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
