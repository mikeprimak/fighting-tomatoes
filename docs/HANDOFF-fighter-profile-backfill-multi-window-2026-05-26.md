# Fighter Profile Backfill — Multi-Window Campaign (2026-05-26)

Hand-author the top-367 most-engaged fighters' `aiProfile` using **Claude Code as
the LLM** (no paid API), running **many windows in parallel**. Same model as the
historic fight-enrichment campaign (`docs/HANDOFF-historic-enrichment-multi-window-2026-05-18.md`).

**This doc is the single source of truth for the house style.** A fresh window
should be able to read this and run one block start-to-finish without other context.
Full system background: `docs/areas/ai-enrichment.md` → Phase 5a.

---

## Status

- **Target:** top **367** fighters by engagement (the triage cutoff = ≥100 ratings).
- **Done: 49** (ranks 1-49) — waves 1-3 on 2026-05-26. Verified live & spot-checked.
- **Remaining: ranks 50-367** (~318 fighters), partitioned into the blocks below.
- The ongoing cron (≥25 ratings) will pick up anyone past 367 later — **do not chase past rank 367.**

---

## How parallelism stays safe (read this once)

- The dump script ranks fighters by a **fixed engagement score**
  (`ratings + followers×3`, tiebreak `ratings`, then `id`). With `FP_DUMP_ALL=1`
  the ranking covers **all** fighters and **does not shrink** as profiles are
  written — so an `OFFSET` block always points at the **same fighters**, no matter
  what other windows are doing. That's what makes parallel blocks collision-free.
- Writes are **idempotent per fighterId** (an upsert-style update). Even if two
  windows somehow author the same fighter, the second write just overwrites — no
  corruption, no duplication.
- A **final reconciliation pass** (last section) sweeps up any stragglers, so
  tie-ordering quirks at block edges can't leave anyone behind.

**Rule:** claim a block in the table before starting. One window = one block.

---

## CLAIMS TABLE — edit this row before you start, and when you finish

| Block | Dump cmd offset / limit | Rank range | Window / owner | Status | Count written |
|------|--------------------------|------------|----------------|--------|---------------|
| A | `40 49`  | 50–89   | remote-control | DONE | 40 |
| B | `40 89`  | 90–129  | remote-control (opus) | DONE | 40 |
| C | `40 129` | 130–169 | remote-control (opus) | IN PROGRESS | |
| D | `40 169` | 170–209 | remote-control (opus) | DONE | 40 |
| E | `40 209` | 210–249 | _unclaimed_ | TODO | |
| F | `40 249` | 250–289 | _unclaimed_ | TODO | |
| G | `40 289` | 290–329 | _unclaimed_ | TODO | |
| H | `40 329` | 330–367 | _unclaimed_ | TODO | |

(40-fighter blocks are fine — the dump releases the DB connection before the slow
bio-fetch phase. If you want a lighter window, take half a block, e.g. `20 49`
then later someone takes `20 69`.)

---

## Per-window procedure

All commands assume your cwd is the **repo root** (`C:\Users\avoca\fight-mobile-app`).
If `pnpm -C packages/backend …` errors with `ERR_PNPM_RECURSIVE_EXEC`, you're
already *inside* `packages/backend` — drop the `-C packages/backend`.

### 1. Claim your block
Edit the CLAIMS TABLE row: put your window name + `IN PROGRESS`.

### 2. Dump bios (`OFFSET`/`LIMIT` from your block; note `FP_DUMP_ALL=1`)
```
FP_DUMP_ALL=1 pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-dump.ts 40 49 tmp/fp-49.json
```
- Use your block's numbers (e.g. block B → `40 89 tmp/fp-89.json`).
- Takes ~8-12 min (UFC page + Wikipedia + Brave editorial per fighter).
- `ufc.com=X` in the log is EXPECTED locally (a tsx/esbuild quirk); Wikipedia +
  Sherdog/Tapology + editorial carry the profile. If a fighter shows `[DONE]`,
  they already have a profile — skip them when authoring.

### 3. Get the compact grounding digest
```
pnpm -C packages/backend exec tsx scripts/fighter-profile-digest.ts tmp/fp-49.json
```
Prints, per fighter: DB identity, the record parsed from Tapology/Sherdog, a
RETIRED hint, and the top notable fights. **Author from this digest** + your own
knowledge of the fighter. For anyone the digest is thin on, open the full source
text: `scripts/fighter-profile-split.ts tmp/fp-49.json` writes per-fighter files
to `tmp/src/`, then `Read` the ones you need.

### 4. Author profiles → `tmp/authored/fp-<OFFSET>.json`
Write one record per fighter (skip any marked `[DONE]`). Follow the **HOUSE STYLE**
spec below exactly. The shape:
```json
{
  "records": [
    {
      "fighterId": "<copy from digest>",
      "confidence": 0.85,
      "profile": {
        "tldr": "one punchy newbie catch-up sentence",
        "careerArc": "2-4 sentences: where they came from -> rose -> where they are now",
        "style": "how they fight, plain English",
        "highlights": ["title wins, signature finishes, records, accolades"],
        "signatureFights": [
          { "opponent": "Name", "result": "what happened (e.g. 'KO win, R2 (UFC 257, 2021)')", "whyItMattered": "one line on stakes/legacy" }
        ],
        "appeal": "the draw — why a casual fan would want to watch them",
        "personaType": "fan-favorite | heel | respected-veteran | rising-prospect | polarizing | quiet-killer | gatekeeper | null",
        "whyFansLove": "what makes fans love them",
        "whyFansHate": "in-sport heel reasons, or null"
      },
      "summary": "2-3 short paragraphs of readable prose (career + style + draw woven together). Plain prose, no headers/bullets. This renders on the page and is indexed for SEO."
    }
  ]
}
```

### 5. Persist (dry-run first, then real)
```
pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-write.ts tmp/authored/fp-49.json --sources tmp/fp-49.json --dry-run
pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-write.ts tmp/authored/fp-49.json --sources tmp/fp-49.json
```
`--sources` pulls each fighter's real grounding URLs from the dump (don't hand-copy
them). The write floor-gates at confidence 0.5 and stamps the record snapshot.

### 6. Mark your CLAIMS TABLE row `DONE` with the count, and commit the doc edit
```
git add docs/HANDOFF-fighter-profile-backfill-multi-window-2026-05-26.md
git commit -m "docs: claim/close fighter-profile backfill block <X>"
git push
```
(`tmp/` is gitignored — the profiles live in the DB, not in git. Only the doc's
claims table is committed, so windows can see each other's progress on pull.)

---

## HOUSE STYLE — match this exactly (it's what the first 49 used)

**Voice:** confident, knowledgeable combat-sports writer catching up a newcomer.
Tight and punchy, not flowery. No em dashes in a way that reads AI — prefer "-",
commas, colons (matches the blog style rule).

**Grounding & accuracy:**
- The digest's `notableFights` come straight from our DB — **ground signatureFights
  in those** (real opponents/results). Use your own knowledge for narrative, but
  don't invent fights or records.
- **Record:** if the digest shows DB `record=null`, use the record from the
  Tapology/Sherdog `src-record` line instead — do NOT assert "0-0-0".
- **Retirement/status:** the DB `active` flag is often stale. If the digest shows
  a `RETIRED` hint or recent results make it obvious, write them as retired/inactive.
- **Champions:** check recent fights — titles change hands. (e.g. Chimaev won the
  MW title then lost it to Strickland in 2026; write current reality.)

**`whyFansHate` — IN-SPORT ONLY (hard rule, Mike's call):**
- Allowed: trash talk, heel/villain persona, perceived ducking/cherry-picking,
  controversial or robbery decisions, repeated weight misses, dirty tactics (eye
  pokes, fence grabs), poor sportsmanship, bad blood/rivalries, arrogance, hype
  outpacing results, inactivity/withdrawals.
- **Forbidden, even if well-documented:** criminal charges, civil suits, arrests,
  abuse/assault allegations, drug/DUI/legal issues, politics, religion, family or
  relationship scandal, any personal-life controversy. If the only "hate" material
  is out-of-sport, set `whyFansHate` to `null`.
- Most beloved/respected fighters have **no** in-sport hate → `null`. Only populate
  it for genuinely polarizing figures.
- Labels render gender-neutral ("Why fans love **them**" / "Why some fans hate
  **them**"), so phrase accordingly.

**`personaType`:** pick the best fit. Most legends/champions = `respected-veteran`;
beloved action fighters = `fan-favorite`; genuinely divisive = `polarizing`; up-and-
comers = `rising-prospect`. Use `null` if none fit.

**`confidence`:** 0.85-0.9 for well-documented stars; 0.8-0.83 for solid but lighter
coverage; below 0.5 = the write script skips them (don't author someone you can't
ground). Floor is 0.5.

**Length:** `summary` = 2-3 paragraphs. `careerArc` 2-4 sentences. `highlights`
4-6 short noun phrases. `signatureFights` 2-4 entries. Keep it scannable.

---

## When ALL blocks are DONE — final reconciliation (one window)

This catches anyone missed at block boundaries / tie-ordering. Uses the DEFAULT
dump mode (no `FP_DUMP_ALL`) so it only returns fighters still missing a profile:
```
pnpm -C packages/backend exec tsx --env-file=.env \
  scripts/fighter-profile-dump.ts 60 0 tmp/fp-reconcile.json
```
If it returns fighters ranked within the top 367 (check `engagement.ratings` ≥ ~100),
author + write them the same way. When this dump returns only sub-100-rating
fighters (or none in the top 367), the campaign is complete — the cron owns the rest.

Verify a few live:
`curl -s https://fightcrewapp-backend.onrender.com/api/fighters/<id> | python -m json.tool`

Then update `docs/areas/ai-enrichment.md` Phase 5a ("Wave 1 shipped: top-25…") to
note the full 367 backfill is complete, and log it in `docs/daily/<date>.md`.
