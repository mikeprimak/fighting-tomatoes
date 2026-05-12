-- Add cardSection to PromotionBroadcastDefault and BroadcastDiscovery so
-- the How-to-Watch system can express per-card-section defaults (e.g. UFC
-- US Prelims on CBS + Main Card on Paramount+) instead of one flat default
-- per (promotion, region).

-- ============== PromotionBroadcastDefault ==============
ALTER TABLE "promotion_broadcast_defaults"
  ADD COLUMN IF NOT EXISTS "cardSection" TEXT;

-- Drop old (promotion, region, channelId) unique constraint + index.
ALTER TABLE "promotion_broadcast_defaults"
  DROP CONSTRAINT IF EXISTS "promotion_broadcast_defaults_promotion_region_channelId_key";

DROP INDEX IF EXISTS "promotion_broadcast_defaults_promotion_region_channelId_key";

-- New unique key includes cardSection. NULLS NOT DISTINCT so null+null
-- collisions (the existing whole-event rows) are caught.
ALTER TABLE "promotion_broadcast_defaults"
  DROP CONSTRAINT IF EXISTS "promotion_broadcast_defaults_promotion_region_channel_section_key";

ALTER TABLE "promotion_broadcast_defaults"
  ADD CONSTRAINT "pbd_promotion_region_channel_section_key"
  UNIQUE NULLS NOT DISTINCT ("promotion", "region", "channelId", "cardSection");

-- ============== BroadcastDiscovery ==============
ALTER TABLE "broadcast_discoveries"
  ADD COLUMN IF NOT EXISTS "cardSection" TEXT;
