# HANDOFF: McGregor / UFC 329 SEO Content Cluster Expansion

**Created:** 2026-06-17
**Status:** 3 new blog posts written as `draft: true`, **now committed (pushed to main, `c816bf56`)**, still **not published (`draft: true`), not fully fact-checked by Mike.**
**Owner of next step:** Mike fact-checks, then a session flips drafts live + does post-publish SEO.
**Playbook this follows:** `docs/playbooks/seo-fight-preview-cluster.md` (read it first).

---

## UPDATE 2026-06-17 evening - paused here, resume next session

Session 3 added an automated odds system + a draft-reading tool, then **stopped at
Mike's request** (rest to be done in a later session). Full detail: `docs/daily/2026-06-17.md`
(Session 3) and memory `project_odds_graph_system`.

**Shipped this session (all pushed to main):**
- **Daily odds graph** on the full-card post (`ufc-329-full-card-odds-predictions`):
  main-event implied-win-probability line chart, file-based history
  (`packages/web/src/content/odds/ufc-329.json`), SVG generator + daily updater
  (`packages/web/scripts/odds/`), GH Action `.github/workflows/ufc-329-odds.yml`
  (daily 17:00 UTC). **Validated in CI** - secret `ODDS_API_KEY` works, live line
  today = McGregor +230 / Holloway -289. Self-no-ops after July 11.
- **Admin draft viewer**: admin Blog tab "Drafts" section + preview modal
  (`/admin/drafts` endpoints). Read drafts here once the backend redeploy lands.
- Reworded the full-card post so no hardcoded main-event odds contradict the live chart.

**Resume from here (in order):**
1. **Fact-check all 3 drafts** (admin Drafts tab, or dev server). Honesty-first.
2. **Eyeball `public/blog/ufc-329-betting-odds.png`** - static banner may still show
   the old "-310 to -550" range in its pixels (alt text already neutralized).
3. Then continue with the original NEXT STEPS below (publish, index, etc.).
   Note: graph only shows on the LIVE site once the full-card post is `draft: false`.

---

---

## 1. Goal / why this exists

Conor McGregor returns against Max Holloway at **UFC 329 on Saturday, July 11, 2026**. McGregor
is one of the most-searched athletes alive, so this fight is a large, time-boxed SEO opportunity.
We already had a 3-post cluster live; this session **expanded it with 3 more posts** to capture
additional long-tail and evergreen query clusters the original hub couldn't cover alone.

As of writing we are **~3.5 weeks out**, so per the playbook we are on the **compressed-timing
path**: publish fast, submit to search engines same day, refresh 2x/week instead of weekly.

---

## 2. The fight (confirmed facts)

- **Event:** UFC 329: McGregor vs Holloway 2
- **Date:** Saturday, July 11, 2026 (International Fight Week)
- **Venue:** T-Mobile Arena, Las Vegas, NV
- **Main event:** Conor McGregor vs Max Holloway, **welterweight (170 lb), non-title** (no belt, no BMF)
- **First fight:** McGregor won by unanimous decision, Boston, August 2013 (tore his ACL mid-fight)
- **McGregor layoff:** last fought July 2021 (broken leg vs Poirier at UFC 264); ~5 years out
- **Odds:** Holloway heavy favorite (-310 to -550 across books); McGregor underdog (+250 to +350)
- **Co-main:** Benoit Saint-Denis vs Paddy Pimblett (lightweight)

---

## 3. Existing cluster (already LIVE, dated 2026-05-30)

All in `packages/web/src/content/posts/`:

| Slug | Role |
|---|---|
| `mcgregor-holloway-2-ufc-329` | **Hub** — full preview, 30+ question H2s, has `event:` block, `updated: 2026-06-13` |
| `conor-mcgregor-return-five-years` | Cluster — McGregor's road back / why he's been out |
| `max-holloway-career-explained` | Cluster — Holloway's arc from 2013 prospect to legend |

Live at `https://goodfights.app/blog/<slug>`.

---

## 4. What this session shipped (3 NEW drafts — NOT yet live)

All in `packages/web/src/content/posts/`, all `draft: true`, all `featured: false`, all
em-dash-clean (grep-verified), all bidirectionally interlinked with each other AND the existing
3 cluster posts.

### Post #1 — How to watch (fight-week money page)
- **File:** `2026-06-17-how-to-watch-ufc-329-mcgregor-holloway-2.md`
- **Slug:** `how-to-watch-ufc-329-mcgregor-holloway-2`
- **Targets:** the highest-volume query cluster. ~18 question H2s: is it on Paramount+, is it a
  PPV, which plan (Essential vs Premium), how much, is there a free way, start times, walkout
  time, devices, can-I-watch-on-TV, replay, cheapest way, **one H2 per country**
  (Canada / UK / Ireland / Australia / Europe — each its own long-tail target).
- Has `event:` block (fires SportsEvent JSON-LD).
- Reuses banner `/blog/mcgregor-holloway-banner.png` + `/blog/ufc-329-where-to-watch.png`.

### Post #2 — Full card, odds & predictions (refresh target)
- **File:** `2026-06-17-ufc-329-full-card-odds-predictions.md`
- **Slug:** `ufc-329-full-card-odds-predictions`
- **Targets:** card + odds + who-wins query cluster. Full card, per-fight odds, honest
  prediction for all 6 main-card bouts + prelim picks + FOTN/upset H2s.
- **This is the designated freshness-refresh target** (odds move). Has `updated:` field +
  `event:` block. Reuses `/blog/ufc-329-betting-odds.png`.

### Post #6 — Every McGregor fight, ranked (evergreen pillar)
- **File:** `2026-06-17-conor-mcgregor-fights-ranked.md`
- **Slug:** `conor-mcgregor-fights-ranked`
- **Targets:** evergreen McGregor search volume (not tied to July 11). All 15 career fights
  ranked countdown (Aldo 13s KO = #1, Alvarez #2, Diaz 2 #3). Plus FAQ-style H2s (record / best
  fight / biggest win / has he been KO'd) for People-Also-Ask capture.
- Reuses `/blog/conor-mcgregor-hero.jpg` + `/blog/mcgregor-ufc189-2015.jpg`.

> Numbering (#1/#2/#6) refers to my original 9-suggestion list this session. Mike picked these 3.

---

## 5. Facts pulled this session (live web search, mid-June — VERIFY before publish)

- **Paramount+ (US):** UFC numbered events are **included, no separate PPV**. Essential ~$8.99/mo,
  Premium ~$13.99/mo. UFC is **not tier-locked** (Essential is enough). Standard free trial
  discontinued early 2026, but bundles (e.g. Walmart+) still include Paramount+.
- **Per-country broadcast** (same as hub): Canada = Sportsnet+ PPV ~C$60; UK/Ireland = TNT Sports
  / discovery+; Australia = Main Event PPV (Kayo/Foxtel); Europe = DAZN (DE/AT/IT/ES/PT), Fight
  Pass fallback.
- **Undercard odds:** Saint-Denis -200 / Pimblett +170; Bautista -150 / Sandhagen +130 (Sandhagen
  vs Bautista is a rematch, near pick'em); Kavanagh -170 / Royval +145; Steveson -1800 / Ellison
  +900; Whittaker favored over Krylov.
- **McGregor record:** 22-6 MMA (19 by KO/TKO), 0-1 pro boxing (Mayweather TKO10, 2017).

---

## 6. NEXT STEPS (in order)

1. **Mike fact-checks all 3 drafts.** Honesty-over-optimism is non-negotiable per playbook.
2. **CARD CAVEAT — re-verify before publishing #2.** Card placement + odds drift weekly. The
   latest 12-bout confirmation I found **dropped King Green vs Terrance McKinney** (was in the
   hub) and **added Gandra-Reese + Osbourne-Durden**. Re-check the full card section against a
   current source on publish day.
3. **Flip `draft: false`** on each post, then commit + `git push origin HEAD:main`. Vercel
   auto-deploys `packages/web` from main. (Drafts are currently uncommitted working-tree changes.)
4. **Validate rich results** at search.google.com/test/rich-results for each URL (FAQPage +
   BlogPosting + SportsEvent should fire).
5. **Submit to search engines** (one-time per URL): GSC URL Inspection -> Request Indexing; Bing
   Webmaster Tools -> Request indexing.
6. **Set up freshness-refresh routine** via `/schedule` (2x/week given the short window). Target
   = the card+odds page (#2). Routine prompt MUST: check the date and **no-op after July 11**,
   **forbid fabrication**, enforce **no em dashes**, and push to main. Mike disables it after the
   fight (routines can't be deleted via API).
7. **Decide `featured: true`** for fight week. Only ONE post should be featured at a time.
   Highest-volume candidate = the how-to-watch page (#1). The hub is currently `featured: false`.
8. **Fight week only:** Reddit helpful-comment in a real r/MMA thread (never link early — automod
   strips self-promo); owned social (X with banner + UTM, FB, IG). Skip Threads.
9. **After the fight:** disable the refresh routine.

---

## 7. Remaining unwritten McGregor angles (backlog, from the original 9 suggestions)

If we want to keep expanding the cluster:
- Standalone **first-fight (2013) deep dive** — "what happened in McGregor vs Holloway 1" (evergreen gold)
- **Why are they fighting at welterweight?** explainer
- **McGregor full record** fight-by-fight explainer
- **McGregor vs Mayweather, revisited** (huge evergreen volume)
- **Tier 3 data moat:** "How Good Fights users rated every McGregor fight" — pulls the app's
  actual rating data. Nobody else can write this; strongest differentiation + hard app CTA.
  (Note: post #6 is an *editorial* ranking and deliberately does NOT fabricate rating numbers;
  the data piece would use real data.)

---

## 8. Key conventions (don't violate)

- **No em dashes** anywhere in blog/marketing copy. Commas/colons/hyphens only. Sweep before commit.
- **Canonical domain:** https://goodfights.app (never web-jet-gamma-12).
- **Source of truth:** edit posts only in `packages/web/src/content/posts/`. Backend copy is
  generated by `syncBlogPosts.js` — never edit it.
- **Images:** self-host in `packages/web/public/blog/`. Never hotlink.
- **CTA:** light. One near top ("rate how hyped you are"), one at bottom + slogan
  "Never miss a Good Fight."
- **Question H2s** = FAQ schema fuel. `extractFaqs()` builds Q&A from any `## ` heading containing `?`.

---

## 9. Pointers

- Full session log: `docs/daily/2026-06-17.md` (Session 2 section).
- Playbook: `docs/playbooks/seo-fight-preview-cluster.md`.
- Memory: `project_seo_fight_preview_playbook`.
