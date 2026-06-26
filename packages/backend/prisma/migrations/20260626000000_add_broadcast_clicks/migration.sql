-- CreateTable
CREATE TABLE "broadcast_clicks" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "eventId" TEXT,
    "region" TEXT NOT NULL,
    "cardSection" TEXT,
    "tier" TEXT,
    "placement" TEXT,
    "targetUrl" TEXT NOT NULL,
    "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_clicks_channelId_idx" ON "broadcast_clicks"("channelId");

-- CreateIndex
CREATE INDEX "broadcast_clicks_eventId_idx" ON "broadcast_clicks"("eventId");

-- CreateIndex
CREATE INDEX "broadcast_clicks_createdAt_idx" ON "broadcast_clicks"("createdAt");

-- CreateIndex
CREATE INDEX "broadcast_clicks_isAffiliate_idx" ON "broadcast_clicks"("isAffiliate");

-- AddForeignKey
ALTER TABLE "broadcast_clicks" ADD CONSTRAINT "broadcast_clicks_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "broadcast_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
