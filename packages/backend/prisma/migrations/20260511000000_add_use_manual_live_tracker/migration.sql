-- Manual live tracking: admin advances the card by setting fights COMPLETED.
-- Suppresses the Step 1.7 section-start fallback; fires per-fight notifs on
-- event LIVE (first fight) and on each fight COMPLETED (next-up fight).
ALTER TABLE "events" ADD COLUMN "useManualLiveTracker" BOOLEAN NOT NULL DEFAULT false;
