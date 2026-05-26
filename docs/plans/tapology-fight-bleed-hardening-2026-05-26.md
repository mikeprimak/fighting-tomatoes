# Plan: Tapology fight-bleed hardening (all scrapers)

**Created:** 2026-05-26
**Status:** Planned — not started
**Trigger phrase for the session:** "tapology hardening session" / "fix the fight bleed"

## Problem

Tapology event pages render bouts that are **not part of that event** —
related-fight widgets, fighters' other-bout panels, co-promotion cross-links.
Our `scrape*Tapology.js` daily scrapers hoover these up and attach them to the
wrong event, producing **duplicate / phantom fight rows**. Users see the same
fight on two cards, or a fight on an event it never belonged to.

This has recurred for months. It is the single most damaging data-quality bug
in the dataset (which is load-bearing for the acquisition narrative).

## Prior efforts (do NOT redo — build on these)

| Date | What shipped | Ref |
|---|---|---|
| 2026-04-11 | Scope fighter-link extraction to `<li.border-b>` rows, excluding `nav/header/footer/aside`. Applied to all 7 `scrape*Tapology.js`. **Partial fix — insufficient.** | commit `e8eb464` |
| 2026-05-03 | Event lookup tightened to `ufcUrl`-only (no OR-name fallback merging sibling events). All 14 Tapology parsers swept. | commit `573e828` |
| 2026-05-23 | Top Rank event `142087` bled Tyson Fury + an Oktagon MMA bout into Foster vs. Ford. Blacklisted the ID. **2,571 phantom fight rows deleted** across 95 events / 8 promotions (3-pass cleanup). Also reset 20 Oktagon fighters' `sport` corrupted to BOXING. | data-only, see `docs/daily/2026-05-23.md` |
| 2026-05-26 | DBX 5 had absorbed DBX 3's entire card (13 dup bouts). Merged dupes → canonical DBX 3 fights, migrated ratings, deleted dups; un-stuck 83 DBX fights frozen UPCOMING on completed events. | data-only, see `docs/daily/2026-05-26.md` |

**Key lesson from 2026-05-23:** the `li.border-b` scoping is NOT enough.
Tapology renders related/sidebar bouts *inside* `li.border-b` in the main
content, so the `nav/header/footer/aside` exclusion still lets them through.
That session explicitly **deferred** the real fix: *"DOM scoping — needs a real
container selector instead of `li.border-b` page-wide."* This plan is that
deferred work.

**Why the big 05-23 cleanup didn't catch DBX:** Pass 2 only deleted
fighter-pairs appearing on **5+ Tapology events** (a threshold chosen to avoid
nuking real rematches like Cruz/Faber). DBX dupes lived on only 2 events, so
they survived. Any import-time guard we build must stay rematch-safe.

## Root cause

`scrape*Tapology.js` fight extraction selects **page-wide** `li.border-b` rows.
The bout-card list and the related/sidebar bout widgets share that class, and
the exclusion list (`nav/header/footer/aside`) doesn't cover the in-`#main`
panels Tapology uses for related fights. Extraction is also **unstable** between
runs (same DBX page yielded 0 fights one run, 17 the next), which is a second
symptom of selecting from an unscoped, layout-dependent set.

## Proposed fix — two layers + parser hardening

Do all of this in ONE session, applied **uniformly across all 7 scrapers**
(`DirtyBoxing, GoldStar, GoldenBoy, KarateCombat, MVP, TopRank, ZuffaBoxing`;
also check `Gamebred`). Divergent per-scraper implementations are how we got
here — keep them identical.

### Layer 1 — Real container selector (the actual fix)

1. Inspect a live Tapology event page DOM (puppeteer; mind bot protection +
   residential-IP rate limits — see `lesson_ufc_cdn_rate_limits_home_ip`,
   `lesson_puppeteer_stealth_shared_page_crash`). Identify the container that
   holds **only this event's bout list** (the "Main Card / Full Card /
   Fight Card" section — likely a `#sectionFightCard`-style id or a labeled
   wrapper), versus the related-bouts widgets.
2. Scope extraction to `container.querySelectorAll('li.border-b')` instead of
   `document.querySelectorAll(...)`.
3. Cross-check: the bout-card list on a Tapology event page is bounded by a
   known fight count (headliner first). If the container can't be found,
   **return 0 fights and log loudly** rather than falling back to page-wide
   (fail closed, not open — a missed scrape is recoverable, a polluted one is
   corrective work).
4. Factor the extraction into a shared helper so all 7 scrapers call the same
   code. `tapologyLiveScraper.ts` already had a good scoped version (per
   `scrapers.md:73`) — use it as the reference / consolidation target.

### Layer 2 — Import-time dedup backstop (source-agnostic)

In each Tapology parser's fight-upsert path, before creating a fight, check
whether the **same fighter-pair already exists on a different same-promotion
event**. If so, do NOT blindly create — this is the bleed signature.

Rematch-safety (critical — see 05-23 false-positive lesson):
- Only guard within `scraperType='tapology'` + same promotion.
- A real rematch is on a *different date's* event and is genuinely on that
  event's Tapology card. The bleed case is the pair appearing on event B whose
  page merely *references* it. Distinguishing heuristics to evaluate:
  - Date proximity: bleed copies cluster on adjacent events; rematches are
    months/years apart.
  - If the canonical already-existing fight is on an event whose date is
    **after** the event being imported, the import copy is suspect.
  - When ambiguous, **flag for admin review** (write to a review table / log)
    rather than auto-skip — never silently drop a possibly-real bout.

### Layer 3 — Parser hardening (defensive, while we're in there)

Per `lesson_tapology_parsers_overwrite_sport`: Tapology-derived parsers must set
`sport` / `weightClass` / `gender` **only on fighter create, not update**. This
won't prevent bleed, but it stops a future leak from corrupting existing
fighters' classification (the 20-Oktagon-fighters-→-BOXING damage on 05-23).
- `dirtyBoxingDataParser.ts` is already clean here (update block doesn't touch
  sport). Audit the other 6 and fix any that force-overwrite.

## Scope / files

- `packages/backend/src/services/scrape*Tapology.js` (7 files) — Layer 1.
- `packages/backend/src/services/*DataParser.ts` (Tapology-derived) — Layers 2 & 3.
- Shared extraction helper — new, or consolidate onto `tapologyLiveScraper.ts`'s.
- Consider a small `tapologyFightExtraction` unit around the container logic.

## Testing

- Cannot rely on prod re-scrapes (bot protection, rate limits). Save a real
  Tapology event-page HTML fixture (one polluted, one clean) and unit-test the
  extraction against it — assert it returns ONLY the card's bouts.
- Dry-run each parser against `scraped-data/*/latest-events.json` and diff fight
  counts vs the current DB before/after.
- Re-run the dup detector (the throwaway script pattern from 05-26) across all
  promotions afterward to confirm 0 cross-event dupes.

## Risks

- DOM selector is layout-dependent; Tapology can change it. Mitigate with the
  fail-closed rule (Layer 1.3) and the import-time backstop (Layer 2) so a
  selector regression degrades to "missing fights," never "polluted fights."
- Import-time dedup false-positives on real rematches — mitigated by the
  rematch-safe heuristics + flag-don't-drop.

## Out of scope (track separately)

- Event-level co-promotion dedup (two event rows for one card) — see
  `project_cross_scraper_event_dedup`. Related but distinct.
- Boxing historic backfill (boxrec.com) — coverage gap noted 2026-05-23.
- The 6 manual-review (eventId, orderOnCard) slots with competing user ratings
  from the 05-23 cleanup (Kenneth/Kenny Cross fighter-row merge, etc.).
