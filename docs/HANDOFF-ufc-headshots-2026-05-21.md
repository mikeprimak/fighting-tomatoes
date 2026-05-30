# UFC Headshot Backfill — Handoff (2026-05-21)

## Where things stand

Backfill works correctly now. The wrong-photo corruption bug is fixed,
validation is in place, and Brave Search API is the slug source. But the
remaining `[no-img]` tail is much larger than expected — **most of the
residual ~428 fighters are 1990s-2000s era UFC veterans whose UFC.com
pages exist but contain no `og:image` meta tag** (text-only profiles, no
modern headshot). This is a UFC.com data gap, not a code bug.

## Today's runs

| # | Run | Result | Notes |
|---|---|---|---|
| 1 | [26229548254](https://github.com/mikeprimak/fighting-tomatoes/actions/runs/26229548254) | success, 33.4 min, started 511 candidates | First run with Brave. Hit the $5 Brave monthly cap mid-run; remaining queries from that point returned null → fighters fell through to `[no-img]` even when they had real UFC.com pages. Mike bumped Brave cap to $10. |
| 2 | [26231414611](https://github.com/mikeprimak/fighting-tomatoes/actions/runs/26231414611) | success, 15.7 min, started 450 candidates | Second pass after Brave cap bump. Healed 6 corrupted rows from prior DDG runs. Uploaded only 12 — see below for analysis. |

Second-run summary (current truth):
```
considered: 450
uploaded:   12
  via existing slug: 1
  via derived slug:  2
  via DDG search:    9     (the label still says "DDG" — function was renamed
                             internally to Brave but the stat var keeps the name)
  placeholder used:  1     (Gable Steveson — UFC's SILHOUETTE.png)
skipped (already set): 0
no ufc.com page: 0
page exists, no image: 428
errors: 10
```

12 successful uploads from this run:
- `[ok-search]` Patchy Mix → patrick-mix (Brave found the legal name)
- `[ok-search]` Ali Al Qaisi → ali-alqaisi (spacing variant)
- `[ok-search]` Geraldo de Freitas Jr. → gerlado-de-freitas-jr (typo in slug)
- `[ok-search]` Cee Jay Hamilton → cj-hamilton (initials variant)
- `[ok-search]` Vinicius Quieroz → vinicius-queiroz (typo)
- `[ok-search]` Carlos Fodor → caros-fodor (typo)
- `[ok-noslug]` Yanan Wu, Danny Downes, Kurt Warburton — slug-collision-with-duplicate fallback (image written, slug not, because another row owns the canonical slug)
- `[ok-placeholder]` Gable Steveson — UFC's silhouette
- `[ok]` Da Un Jung, TJ O'Brien (derived/existing slug)

6 `[reject]` lines confirm the og:title trust check is actively blocking wrong-photo writes. 6 `[heal]` lines confirm the cleanup pre-pass nulled out corrupted rows from prior DDG-era runs.

## Why 428 [no-img] is mostly NOT fixable via Brave

Sampling the tail of the no-img list confirms these are deeply retired
fighters: Tank Abbott, Don Frye, Marco Ruas, Kevin Randleman, Tim Sylvia,
Caol Uno, Pat Miletich, Frank Shamrock, Jens Pulver, Kimo Leopoldo, Bas
Rutten, Roy Nelson era and earlier. UFC.com keeps text/stats profiles for
them but never had (or has stripped) the modern `og:image` headshot tag.
**Brave finds the right slug; UFC.com just has no photo to serve.**

Also in the list: a handful of current active fighters with name typos in
the DB that Brave couldn't bridge ("Trevino Jones" vs "Trevin Jones" —
real fighter exists but the typo is too far). Manual cleanup or a stricter
fuzzy match would help these but the scope is tiny.

## What's committed this session

```
be7f0aa fix(headshots): use existing BRAVE_API_KEY secret
1048cf3 feat(headshots): Brave Search slug + og:title trust check + corruption cleanup
579031e revert(headshots): back to working b0b7d19 sequential DDG path, 350min timeout
0d31bea feat(headshots): canonical UFC.com athletes index as slug source of truth  (reverted)
bbc2de8 perf(headshots): HTTP DDG + parallel workers, 120min timeout  (reverted)
b0b7d19 feat(headshots): DDG slug search fallback + silhouette handling
437d3d3 feat(headshots): UFC backfill catches dead legacy URLs + GH Actions workflow  (yesterday)
```

Current code:
- `packages/backend/src/services/scrapeUFCAthleteHeadshot.ts` — Brave Search slug lookup (`searchUFCAthleteSlugViaBrave`), og:title trust check (`isHeadshotTrustworthy`), silhouette detection
- `packages/backend/src/scripts/backfillUFCHeadshots.ts` — three-tier slug resolution (existing → derived → Brave), trust check on every page, `healCorruptedRows` pre-pass
- `.github/workflows/ufc-headshot-backfill.yml` — manual dispatch, 350 min timeout, BRAVE_API_KEY secret wired in
- Brave free-tier cap bumped to $10/month

Brave env var name is `BRAVE_API_KEY` (matches `services/broadcastDiscovery/searchBrave.ts`). Don't accidentally rename to `BRAVE_SEARCH_API_KEY` — already had to fix that.

## What to consider next session

The remaining ~428 fighters split roughly into three groups; pick a treatment per group, not one-size-fits-all.

### Group A: 1990s-2000s legends with no UFC.com photo (the bulk)

UFC.com genuinely has no photo. Options:

1. **Accept the loss** for fighters whose last UFC bout was pre-2010.
   These are the people users least-likely scroll to. Show a generic
   placeholder.
2. **Tapology fallback** — Mike previously said no (lower quality). But
   for fighters where UFC.com truly has nothing, Tapology > nothing.
   Tapology has every MMA fighter and isn't bot-protected. Could be
   gated to *only* run after UFC.com returns no-image AND Brave's slug
   actually existed (so we're sure we tried).
3. **ufcstats.com fallback** — has every UFC fighter ever, no bot
   protection. Image quality lower than UFC.com but probably better
   than a placeholder. Same gating logic.
4. **Wikipedia fallback** — many notable fighters have infobox images
   via Wikimedia Commons. Quality varies. Free API, no scraping.

Recommendation: ask Mike to pick ONE secondary source (probably ufcstats.com since we already use it and it's UFC-branded photography for some fighters).

### Group B: name typos in DB that Brave couldn't bridge

Examples (suspected): "Trevino Jones" (probably Trevin Jones), some others.
Two paths:

1. Loosen the Levenshtein threshold in the trust check from ≤ 1 to ≤ 2.
   Risk: more false-positives on common surnames.
2. Build a manual override CSV: `fighter-name-overrides.csv` with rows
   `<DB id>,<correct ufc.com slug>`. Backfill consults the CSV before
   any other path. Tiny effort to maintain.

### Group C: duplicate-fighter rows (Doo Ho Choi etc.)

31 known groups (per earlier diag). The image-only slug-collision
fallback already covers some, but the *root* fix is fighter-row dedup:
merge the legacy row with the fight history into the new row, repoint
`Fight.fighter1Id` / `Fight.fighter2Id`. ~30 min of careful migration
work, separate from the backfill.

## Things NOT to repeat next session

- Don't switch DDG to HTTP-fetch (blocked on AWS IPs — Brave is the fix).
- Don't try to scrape `ufc.com/athletes/all` for an index (browse pages
  time out under Puppeteer; individual `/athlete/<slug>` pages work fine).
- Don't trust ANY external search result without the og:title check —
  this is what caused the Polo Reyes → Hadzovic-photo bug.
- The 25s `PAGE_TIMEOUT_MS` and the `--disable-blink-features` flags in
  `launchAthleteBrowser` are load-bearing. Don't lower the timeout to
  "optimize" — UFC.com pages are slow.

## Test accounts / inspection

- Mike's main test account: `avocadomike@hotmail.com`
- Polo Reyes specifically: row was healed (NULL'd) by the cleanup pre-pass. The next backfill run will retry — likely lands as `[no-img]` because UFC.com has no photo for him post-retirement. He's in Group A.

## Pickup order for next session

1. Read this doc.
2. Look at `okFromSearch` (currently labeled "via DDG search" — rename the stat field for honesty) and decide whether the search-tier yield justifies the Brave spend going forward. If yes, choose a Group A secondary source. If no, just accept Group A as lost and close out the project.
3. Optionally: build the manual override CSV for Group B (low effort, high signal value on visible names).
4. Defer Group C to its own dedup session.
