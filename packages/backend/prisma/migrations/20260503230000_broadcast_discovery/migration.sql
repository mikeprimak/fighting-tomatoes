-- AlterTable
ALTER TABLE "promotion_broadcast_defaults" ADD COLUMN     "lastDiscoveryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "broadcast_discoveries" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promotion" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "channelSlug" TEXT,
    "channelNameRaw" TEXT NOT NULL,
    "tier" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "changeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_discoveries_status_idx" ON "broadcast_discoveries"("status");

-- CreateIndex
CREATE INDEX "broadcast_discoveries_promotion_region_idx" ON "broadcast_discoveries"("promotion", "region");

-- CreateIndex
CREATE INDEX "broadcast_discoveries_runId_idx" ON "broadcast_discoveries"("runId");

