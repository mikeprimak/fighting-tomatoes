# Card-placement evergreen generator

Keeps the blog article **`packages/web/src/content/posts/2026-06-24-ufc-card-placement-rankings.md`**
fresh without a full manual rebuild. Semi-automated by design: the bot regenerates
the data; a human reviews and merges. READ-ONLY against the DB.

## What's automated vs human-owned

**Auto-regenerated** (wrapped in `<!-- AUTO:KEY:start -->` / `<!-- AUTO:KEY:end -->`
fences in the article — anything between a fence pair is overwritten each run):

| Fence key | Block |
|---|---|
| `p4p-bigcard` | Big Card pound-for-pound list |
| `p4p-fightnight` | Fight Night pound-for-pound list |
| `chart` | "Big Card fighters by division" bar charts (men + women) |
| `divisions` | All 11 division boards: titles, leader banners, both lists |
| `alltime-mains` | All-Time Main Event Leaders list |

The leader **banners pull headshots from `Fighter.profileImage`** automatically, so
no more hand-pasted R2 / ufc.com URLs. A leader with no `profileImage` renders a grey
block and is flagged in `CHANGES.md`.

The **social banner** (`packages/web/public/blog/card-placement-thumb.png`) is rebuilt
by `banner.py` only when the top-5 Big Card P4P changes. Assets (arena background +
pre-cut Chael Sonnen cutout) live in `assets/`.

**Human-owned** (never auto-applied — these lean on fragile legacy event-order
recovery and were hand-curated): *Highest Average Placement Across a Career*,
*career climbs*, *Historical Card Headliners*. The generator writes its current take
to **`suggested.md`**; copy in only what you've verified. Older years (<= 2020) are
explicitly flagged because legacy inverted-order cards produce occasional
false-positive headliners.

The **prose** (intros, "A few notes", the Fight Night story, etc.) is also human-owned.
`CHANGES.md` flags any sentence whose underlying numbers moved (e.g. "Eight fighters
average a perfect 1.0" — is it still eight?).

## Method

Mirrors the article's stated method: a fighter's number is the **simple average of
their last 3 card slots** (1 = main event), no recency decay, no PPV weighting. Board
split: **Big Card** if >= 2 of the last 3 bouts were on a numbered event, else **Fight
Night**. Active = a bout within the last 18 months and >= 2 bouts in the last 24 months.
Legacy inverted-order events are corrected on the fly (event name signal, then a
rating-monotonicity fallback) — same logic as `historical-placement-analysis.ts`.

Shared compute lives in `compute.ts`; emit/splice/report in `generate-article.ts`.

## Usage

```bash
cd packages/backend
pnpm card-placement:check                 # dry run: exit 1 if blocks would change, writes nothing
pnpm card-placement:generate              # rewrite the article in place (as of today)
pnpm card-placement:generate --asof 2026-06-22   # reproduce a past snapshot
```

Outputs (all in this directory): `snapshot.json` (diff baseline for the next run —
**committed**), `CHANGES.md` (change report + prose flags), `suggested.md` (REVIEW
blocks).

## Schedule

`.github/workflows/card-placement-evergreen.yml` runs the 1st of each month (and on
manual dispatch), regenerates, and opens/updates the PR `bot/card-placement-evergreen`
with `CHANGES.md` as the PR body. Nothing reaches production until a human merges.
