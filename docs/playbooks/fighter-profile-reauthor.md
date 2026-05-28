# Playbook — Opus re-author of stale top-fighter profiles

Keep the **premium (hand-authored) fighter bios** current after a top fighter
fights again. This is the Opus tier of the two-tier profile system:

- **Tier 1 — Haiku cron** (`fighter-profile-enrichment.yml`, daily 18:00 UTC):
  auto-refreshes everyone EXCEPT hand-authored profiles. It is pinned off
  `aiProfileSource='handauthored'`, so it never downgrades an Opus bio.
- **Tier 2 — this routine** (Opus / Claude Code as the LLM, no API cost): the
  ONLY thing that refreshes a hand-authored bio. Because Tier 1 deliberately
  ignores them, a top fighter's bio goes stale until you run this.

House style + the full record shape live in
`docs/HANDOFF-fighter-profile-backfill-multi-window-2026-05-26.md` — **read its
HOUSE STYLE section before authoring.** This playbook is the *selection +
mechanics* for the refresh case; the authoring rules are identical to the backfill.

---

## When to run

**Wednesday after any card that featured a hand-authored (top-367) fighter.**
Not Monday — fight results/reviews aren't fully settled that soon. That's the only
time the stale set is non-empty. Volume per run is small (typically a handful).

**The nudge is in the admin panel.** The AI Enrichment health widget on
`admin.html` shows an amber "N VIP bios need an Opus refresh" callout (with names +
old→new record) whenever the stale set is non-empty, and "✓ VIP bios: all current"
otherwise. Fed by `/admin/health/enrichment` (`data.staleVipProfiles`), using the
SAME predicate as `FP_STALE` below — so the panel count and the dump always agree.

Trigger phrase: **"fighter profile refresh"** — Mike says this (usually after
seeing the admin nudge), you run the steps below. We deliberately did NOT automate
the *writing* (unattended LLM writes to prod = the exact risk the hand-authored
tier exists to avoid); we automated the *detection* instead, keeping a reviewed
write in the loop.

---

## Steps (cwd = repo root)

### 1. Dump the genuinely-stale hand-authored fighters
```
FP_STALE=1 pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-dump.ts 40 0 tmp/fp-stale.json
```
`FP_STALE=1` selects `aiProfileSource='handauthored'` rows whose live record no
longer matches `aiProfileRecordAtEnrich` — i.e. the fighter has fought since the
bio was written. (Add `FP_STALE_DAYS=N` to also pull bios older than N days, but
record-change is the real trigger — a bio isn't stale just from age.)

If the dump prints `No fighters match this window. Done.` → **nothing to do, stop.**

Everyone returned shows `[DONE]` (they all already have a profile). That is
expected here — **you RE-author them anyway.** Do NOT skip `[DONE]` in this mode
(opposite of the backfill).

### 2. Digest + author
```
pnpm -C packages/backend exec tsx scripts/fighter-profile-digest.ts tmp/fp-stale.json
```
Author refreshed profiles → `tmp/authored/fp-stale.json`, same JSON shape and
HOUSE STYLE as the backfill. The point of the refresh: weave in the new fight(s)
and any title/record/status change (champion lost belt, retired, etc.). For
anyone the digest is thin on, `scripts/fighter-profile-split.ts tmp/fp-stale.json`
+ `Read` the per-fighter source files.

### 3. Persist (dry-run, then real)
```
pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-write.ts tmp/authored/fp-stale.json --sources tmp/fp-stale.json --dry-run
pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-write.ts tmp/authored/fp-stale.json --sources tmp/fp-stale.json
```
The write re-stamps `aiProfileRecordAtEnrich` to the current live record and keeps
`aiProfileSource='handauthored'` — so the row drops out of the stale set and stays
pinned off the Haiku cron.

### 4. Verify + log
```
curl -s https://fightcrewapp-backend.onrender.com/api/fighters/<id> | python -m json.tool
```
Log in `docs/daily/<date>.md`.

---

## Gotchas

- **Bulk record backfills create false staleness.** If a job like
  `backfillFighterRecords.ts` fills records AFTER bios were authored, those rows
  flip to "stale" (snapshot `0-0-0-0` -> real record) even though the bio is
  already correct. That's NOT a re-author case — heal it cheaply instead:
  ```
  pnpm -C packages/backend exec tsx --env-file=.env \
    scripts/fighter-profile-reconcile-snapshot.ts --apply
  ```
  This re-stamps only the `0-0-0-0`-snapshot artifacts (leaves genuine fights for
  this routine). Run it after any bulk record backfill. (Done once 2026-05-28 for
  the 211 ufcstats-backfill artifacts.)

- **Promoting a Haiku bio to the Opus tier.** A rising fighter who crosses the
  engagement bar gets a `cron-haiku` bio, not Opus. To give them the premium
  treatment, just author + write them like the backfill (they're not pinned, so
  the write stamps `handauthored` and pins them going forward).
