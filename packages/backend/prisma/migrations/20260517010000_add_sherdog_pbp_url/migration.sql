-- Sherdog play-by-play URL — used by the Sherdog live tracker for orgs
-- without a reliable native live source (MVP, Top Rank, Golden Boy, Gold
-- Star, anywhere Tapology updates lag). Set per-event when Sherdog staff
-- covers the card; null otherwise.
ALTER TABLE "events" ADD COLUMN "sherdogPbpUrl" TEXT;
