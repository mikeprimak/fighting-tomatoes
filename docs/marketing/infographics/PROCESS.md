# "What Makes a Good Fight?" — Data Infographic Process

An annual data infographic built from Good Fights' own user ratings. The idea:
once a year, mine what fans actually reward, and present it on-brand. This doc is
the playbook so next year's edition can reference this year's and improve on it.

**This edition:** June 2026 (v5). Built by analyzing every fight with 10+ real
fan ratings.

> **Spinoff: fighter-profile editions.** The same design system + `render.js`
> pipeline now also powers single-fighter graphics. First one: **Conor McGregor —
> "By the Ratings"** (`conor-mcgregor-vN.html/.png`, June 2026, kept at v7; root
> deliverable `GOOD-FIGHTS-CONOR-MCGREGOR-INFOGRAPHIC-v7.png`). Spine is still our
> own data (his 14 fights with ≥10 ratings) with biography/business facts as the
> supporting array. Adds **photo cutouts** via `rembg` (u2net), staged in
> `img/`. **Versioning rule is now stricter** ([[feedback_infographic_always_version]]):
> *every* render goes to a new `-vN`, not just approved ones — never overwrite.

---

## 1. Where everything lives

| Thing | Path |
|---|---|
| Infographic HTML (latest) | `docs/marketing/infographics/good-fights-data.html` |
| Versioned snapshots | `docs/marketing/infographics/good-fights-data-v3.html` … `-v5.html` (+ matching `.png`) |
| Renderer | `docs/marketing/infographics/render.js` |
| Final deliverables (repo root) | `GOOD-FIGHTS-WHAT-MAKES-A-GOOD-FIGHT-INFOGRAPHIC[-vN].png` |
| Brand assets | repo root (logos) + `packages/mobile/assets/` (star, flame) |
| Analysis scripts | `packages/backend/src/scripts/rating-*.ts` |

**Versioning rule:** never overwrite an approved version. Snapshot it as
`good-fights-data-vN.html/.png`, keep iterating on the working file, and copy the
chosen render to root as `...INFOGRAPHIC-vN.png`.

---

## 2. The data (how to reproduce)

All three scripts are **read-only**, run from `packages/backend` (Prisma
auto-loads the prod Render DB via `.env`):

```
cd packages/backend
npx tsx src/scripts/rating-enrichment-correlation.ts   # method/bonus/pace/title correlations
npx tsx src/scripts/rating-infographic-stats.ts        # distribution, method board, hall of fame, hype anecdotes
npx tsx src/scripts/rating-career-arc.ts               # career arc + by-year + cohorts (exploratory)
```

**Sample definition (important — keep consistent year to year):** a fight counts
only if it has **≥10 real ratings**, counted from the `fight_ratings` table — NOT
the denormalized `Fight.totalRatings`, which lies. The correlation/stats scripts
also require post-fight AI enrichment (`Fight.aiPostFightTags`).

This year's sample: **2,036 fights / 43,476 ratings / overall avg 7.50**.

---

## 3. Datapoints used this year (v5)

| Panel | Numbers | Source script |
|---|---|---|
| Rating distribution | <6: 14% · 6–7: 12% · 7–8: 28% · 8–9: 36% · 9+: 10%. **46% rate ≥8.0**, 74% ≥7.0 | infographic-stats |
| Finish beats decision | KO/TKO **8.1** (n=797) · Submission **7.8** (342) · Decision **6.8** (740) | infographic-stats / enrichment |
| Bonus delivers | Bonus **8.1** vs no-bonus **6.9** | enrichment |
| Fast finish ≠ better | R1 **8.02** · R2 **7.99** · R3+ **8.02** | enrichment |
| Pace (fighter style) | Fast **7.96** · Tactical **6.88** · Grinding **6.77** (+1.1) | enrichment (`aiTags.pace`) |
| Anticipation vs payoff | Grasso–Barber 🔥7.8→★8.8 · Holloway–Oliveira 🔥9.5→★4.5 | career-arc / hype data |
| Title = crowd, not quality | 2.3× ratings, +0.3 score | enrichment |
| Hall of Fame (≥20 ratings) | Teixeira–Prochazka 9.76 · Swanson–Choi 9.66 · Lawler–MacDonald 9.59 · Johnson–Gaethje 9.58 · Henderson–Rua 9.55 | infographic-stats |

---

## 4. Honesty log — ideas we KILLED and why (read before reusing)

Don't re-pitch these without re-checking the data; this is where the time went.

- **Weight-class leaderboard** — `Fight.weightClass` is null on almost every row
  in the sample (only ~17 had it). No honest "best division" stat is possible
  until that column is populated.
- **"Hype predicts quality" as a population claim** — only ~60 fights have ≥5
  pre-fight hype predictions; correlation r ≈ −0.11 (noisy). Hype is also
  historically bot-seeded (seeding ceased 2026-03-30). Use hype only as **named
  anecdotes** (the anticipation-vs-payoff panel), never as an aggregate.
- **"X% of fights end in a finish" donut** — **selection bias.** Fans skip rating
  dull decisions, so those fights never enter the ≥10-ratings sample. The finish
  share (looked like 59%) is inflated. Removed in v5.
- **Career arc ("best fights come early")** — the raw line (early 8.01 → late
  7.02) looks dramatic but **~⅔ of it is an era/survivorship artifact**: old
  fights in the DB are filtered down to the memorable classics, recent years
  capture whole cards. Year-adjusted (each fight vs its year's average) the fade
  is only ~0.3 pts, and for the **top-15 most-rated fighters it's essentially flat**
  (slope ≈ −0.04) — the stars stay ~0.3 above their era average their whole
  careers. Removed from the graphic. If revisited, the only supportable framing
  is "the biggest draws stay must-watch start to finish," not "fighters fade."

**Standing rule:** post-fight outcomes (bonus, method, FOTY) are *validation*, not
forward-looking levers. The only genuinely pre-fight signal we found is fighter
*pace reputation* (`aiTags.pace`).

---

## 5. Design system

- **Canvas:** 1080px wide, dark `#0d0d0d` with a radial gold glow + faint diagonal
  hazard texture. Gold `#F5C518`. Panels `#181818`→`#141414`, border `#2c2c2c`.
- **Type:** `Anton` (condensed display) for big numbers/headlines, `Inter`
  (400–900) for everything else. Both from Google Fonts.
- **Heat colors = the core device.** Every score is colored by the EXACT
  interpolation from `packages/mobile/utils/heatmap.ts` (replicated inline in the
  HTML `<script>`). Stops: 1.0 grey(128,128,128) → 5.0 (200,185,130) → 7.0
  (255,207,59) → 7.5 (253,183,12) → 8.0 (243,134,53) → 8.5 (237,94,50) → 9.0
  (233,52,48) → 10.0 red(255,0,0). So ~6.8 reads gold, 8+ orange, 9.5+ red. Keep
  this in sync if the app's heatmap ever changes.
- **Icons:** ratings use a heat-colored solid **star**; hype uses a heat-colored
  **flame** — both generated as inline SVG `data:` URIs filled with the heat color
  (see the `starURI`/`flameURI` functions in the HTML). This matches how the app
  tints its own star/flame.
- **Brand assets — use the ALPHA versions** (transparent background):
  - top logo `logo.png` = `GOOD-FIGHTS-FULL-LOGO-VERTICAL-ALPHA.png`
  - footer hand `hand.png` = `GOOD-FIGHTS-LOGO-HAND-THICKER-ALPHA.png`
  - `flame.png` = `packages/mobile/assets/flame-full-2.png`
  - **⚠ Do NOT use `THICKER-GOOD-FIGHTS-LOGO-HAND-AND-WORD-TALLER.png`** — it has a
    baked-in black rectangle that doesn't match the canvas. (Quick test for any
    logo: composite it on magenta and screenshot; a colored box = no alpha.)
- Top logo is centered above all header content. Date sits small, bottom-right
  under `goodfights.app` (e.g. `JUNE 2026`). Slogan: **"Never miss a Good Fight."**

---

## 6. Render pipeline

```
node docs/marketing/infographics/render.js              # renders good-fights-data.html
node docs/marketing/infographics/render.js good-fights-data-v5   # renders a specific version
```

- `render.js` takes an optional basename arg and writes `<basename>.png`.
- It requires **puppeteer**, which is not installed at repo root — `render.js`
  resolves it from `packages/backend/node_modules` (the scrapers' copy).
- Output is 2× device scale (~2160px wide PNG). The graphic is intentionally tall
  (long-form, good for web/Pinterest/X). A 4:5 IG-feed crop is a known TODO.

---

## 7. Checklist for next year's edition

1. Re-run the three analysis scripts; refresh every number in §3. Update the
   sample size + overall average in the header.
2. Re-read the honesty log (§4) before adding/removing panels. Re-check whether
   `weightClass` and hype coverage have improved enough to unlock those panels.
3. Refresh the Hall of Fame (new classics may have entered the ≥20-ratings set).
4. Bump the date (§5). Snapshot the prior version (§1 rule).
5. Verify the heatmap stops still match `packages/mobile/utils/heatmap.ts`.
6. Render, eyeball every panel at full res (stars/flames/heat numbers are
   JS-generated — confirm they actually drew), copy the chosen render to root.
7. Compare against this year: did the distribution shift? Did the average move?
   That trend is itself a story.

---

*Brand voice: honesty over optimism. If a stat needs an asterisk, it probably
isn't a headline. Every claim here should survive someone asking "how do you know?"*
