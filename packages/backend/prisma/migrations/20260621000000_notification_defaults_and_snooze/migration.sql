-- Sprint 2 / Notifications (§2).
--
-- 1) New-user defaults = walkout-only. A fresh signup should get the single
--    highest-signal ping (their followed fighter is up next), not all four
--    lanes. These ALTER ... SET DEFAULT statements change the column default
--    for NEW rows only; existing users' stored values are untouched (Mike's
--    requirement: don't change settings for current users).
ALTER TABLE "users" ALTER COLUMN "notifyFollowedBooked" SET DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "notifyFollowed3DayWarn" SET DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "notifyFollowedMorningOf" SET DEFAULT false;

-- 2) "Silence for 8 hours" snooze. When set in the future, the dispatch layer
--    suppresses all push notifications to this user until the instant passes.
ALTER TABLE "users" ADD COLUMN "notificationsSnoozedUntil" TIMESTAMP(3);
