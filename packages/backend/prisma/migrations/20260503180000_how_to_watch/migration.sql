-- CreateEnum
CREATE TYPE "BroadcastTier" AS ENUM ('FREE', 'SUBSCRIPTION', 'PPV');

-- CreateEnum
CREATE TYPE "BroadcastSource" AS ENUM ('MANUAL', 'SCRAPED', 'DEFAULT');

-- CreateEnum
CREATE TYPE "BroadcastReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "broadcastRegion" TEXT;

-- CreateTable
CREATE TABLE "broadcast_channels" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "homepageUrl" TEXT,
    "iosDeepLink" TEXT,
    "androidDeepLink" TEXT,
    "webDeepLink" TEXT,
    "affiliateUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_broadcasts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "tier" "BroadcastTier" NOT NULL,
    "eventDeepLink" TEXT,
    "language" TEXT,
    "note" TEXT,
    "source" "BroadcastSource" NOT NULL DEFAULT 'MANUAL',
    "lastVerifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_broadcast_defaults" (
    "id" TEXT NOT NULL,
    "promotion" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "tier" "BroadcastTier" NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_broadcast_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_reports" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT,
    "eventId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "reportedBy" TEXT,
    "reason" TEXT NOT NULL,
    "status" "BroadcastReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "broadcast_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_channels_slug_key" ON "broadcast_channels"("slug");

-- CreateIndex
CREATE INDEX "event_broadcasts_eventId_idx" ON "event_broadcasts"("eventId");

-- CreateIndex
CREATE INDEX "event_broadcasts_region_idx" ON "event_broadcasts"("region");

-- CreateIndex
CREATE UNIQUE INDEX "event_broadcasts_eventId_channelId_region_key" ON "event_broadcasts"("eventId", "channelId", "region");

-- CreateIndex
CREATE INDEX "promotion_broadcast_defaults_promotion_region_idx" ON "promotion_broadcast_defaults"("promotion", "region");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_broadcast_defaults_promotion_region_channelId_key" ON "promotion_broadcast_defaults"("promotion", "region", "channelId");

-- CreateIndex
CREATE INDEX "broadcast_reports_status_idx" ON "broadcast_reports"("status");

-- CreateIndex
CREATE INDEX "broadcast_reports_eventId_idx" ON "broadcast_reports"("eventId");

-- AddForeignKey
ALTER TABLE "event_broadcasts" ADD CONSTRAINT "event_broadcasts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_broadcasts" ADD CONSTRAINT "event_broadcasts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "broadcast_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_broadcast_defaults" ADD CONSTRAINT "promotion_broadcast_defaults_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "broadcast_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

