-- Allow per-cardSection broadcasts on the same channel for the same event/region.
-- Without cardSection in the key, e.g. CA UFC 328 can't have both
-- Sportsnet (Sub) on PRELIMS and Sportsnet (PPV) on MAIN_CARD.

ALTER TABLE "event_broadcasts"
  DROP CONSTRAINT IF EXISTS "event_broadcasts_eventId_channelId_region_key";

-- DROP CONSTRAINT only drops the constraint, not the underlying index when it predates
-- the constraint or was Prisma-introspected. Drop the index by name too.
DROP INDEX IF EXISTS "event_broadcasts_eventId_channelId_region_key";

ALTER TABLE "event_broadcasts"
  ADD CONSTRAINT "event_broadcasts_event_channel_region_section_key"
  UNIQUE NULLS NOT DISTINCT ("eventId", "channelId", "region", "cardSection");
