-- CreateTable
CREATE TABLE "pre_fight_comments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_fight_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pre_fight_comments_userId_fightId_key" ON "pre_fight_comments"("userId", "fightId");

-- AddForeignKey
ALTER TABLE "pre_fight_comments" ADD CONSTRAINT "pre_fight_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_fight_comments" ADD CONSTRAINT "pre_fight_comments_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
