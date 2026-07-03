-- Fighter physical facts (SEO step 7 — richer Person JSON-LD).
-- Hand-authored (nullable ADD COLUMNs only) and applied via `prisma migrate deploy`;
-- never author migrations with `migrate dev`/`db push` against this DB (prod).
ALTER TABLE "fighters" ADD COLUMN "nationality" TEXT;
ALTER TABLE "fighters" ADD COLUMN "height" TEXT;
ALTER TABLE "fighters" ADD COLUMN "reach" TEXT;
ALTER TABLE "fighters" ADD COLUMN "stance" TEXT;
ALTER TABLE "fighters" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
