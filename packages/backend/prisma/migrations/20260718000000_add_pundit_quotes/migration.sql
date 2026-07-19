-- Pundit quotes ("What the media said") — a critic layer on completed fights.
-- See docs/plans/pundit-quotes-2026-07-17.md.
--
-- Hand-authored (additive: two NEW tables, no changes to existing tables) and
-- applied via `prisma migrate deploy`; never author migrations with
-- `migrate dev`/`db push`/`migrate diff` against this DB (it is prod — the
-- shadow DB those commands create OOM-crashed Postgres on 2026-06-06).

CREATE TABLE "pundits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[],
    "role" TEXT NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pundits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pundits_slug_key" ON "pundits"("slug");

CREATE TABLE "pundit_quotes" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "punditId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "outlet" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "aiConfidence" DOUBLE PRECISION NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "quoteHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pundit_quotes_pkey" PRIMARY KEY ("id")
);

-- Same quote laundered through two aggregators collapses to one row.
CREATE UNIQUE INDEX "pundit_quotes_fightId_punditId_quoteHash_key" ON "pundit_quotes"("fightId", "punditId", "quoteHash");

-- The read path: quotes for one fight, filtered to VISIBLE.
CREATE INDEX "pundit_quotes_fightId_status_idx" ON "pundit_quotes"("fightId", "status");

ALTER TABLE "pundit_quotes" ADD CONSTRAINT "pundit_quotes_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pundit_quotes" ADD CONSTRAINT "pundit_quotes_punditId_fkey" FOREIGN KEY ("punditId") REFERENCES "pundits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
