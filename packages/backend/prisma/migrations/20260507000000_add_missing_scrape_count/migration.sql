-- Two-strike cancellation guard: track consecutive missing scrapes
-- per event/fight. Cancel only when threshold reached, not on first miss.
ALTER TABLE "events" ADD COLUMN "missingScrapeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "fights" ADD COLUMN "missingScrapeCount" INTEGER NOT NULL DEFAULT 0;
