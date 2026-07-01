-- SEO slugs for programmatic-SEO web pages (docs/plans/programmatic-seo-2026-07-01.md).
-- Human, keyword-bearing URL segments for fighter/event/fight pages on goodfights.app,
-- replacing UUID-keyed routes. Additive + nullable; backfilled by
-- scripts/backfillSlugs.ts. Unique index allows multiple NULLs on Postgres, so it is
-- safe to add before the backfill populates values.
ALTER TABLE "fighters" ADD COLUMN "slug" TEXT;
ALTER TABLE "events" ADD COLUMN "slug" TEXT;
ALTER TABLE "fights" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "fighters_slug_key" ON "fighters"("slug");
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");
CREATE UNIQUE INDEX "fights_slug_key" ON "fights"("slug");
