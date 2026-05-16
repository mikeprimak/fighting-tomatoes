-- Fan DNA tables. See docs/areas/rewarding-users.md "Fan DNA" + the
-- architectural commit in docs/HANDOFF-next-session-2026-05-16.md.
--
-- Additive only — no changes to existing tables. Drop is safe (kills the
-- feature; no other system reads from these tables).

-- CreateTable
CREATE TABLE "fan_dna_trait_values" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traitId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasFloor" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fan_dna_trait_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fan_dna_trait_values_userId_traitId_key" ON "fan_dna_trait_values"("userId", "traitId");

-- CreateIndex
CREATE INDEX "fan_dna_trait_values_traitId_idx" ON "fan_dna_trait_values"("traitId");

-- AddForeignKey
ALTER TABLE "fan_dna_trait_values" ADD CONSTRAINT "fan_dna_trait_values_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "fan_dna_line_impressions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traitId" TEXT,
    "copyKey" TEXT,
    "lineKey" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fightId" TEXT,
    "value" DOUBLE PRECISION,
    "variant" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fan_dna_line_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fan_dna_line_impressions_userId_firedAt_idx" ON "fan_dna_line_impressions"("userId", "firedAt");

-- CreateIndex
CREATE INDEX "fan_dna_line_impressions_userId_lineKey_firedAt_idx" ON "fan_dna_line_impressions"("userId", "lineKey", "firedAt");

-- CreateIndex
CREATE INDEX "fan_dna_line_impressions_userId_fightId_action_firedAt_idx" ON "fan_dna_line_impressions"("userId", "fightId", "action", "firedAt");

-- CreateIndex
CREATE INDEX "fan_dna_line_impressions_traitId_firedAt_idx" ON "fan_dna_line_impressions"("traitId", "firedAt");

-- AddForeignKey
ALTER TABLE "fan_dna_line_impressions" ADD CONSTRAINT "fan_dna_line_impressions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
