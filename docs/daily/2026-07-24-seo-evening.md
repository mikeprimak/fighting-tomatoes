# 2026-07-24 (evening) — SEO: /schedule/boxing sport-facet hub

Weekly striking-distance session off the 2026-07-20 GSC report (the designed
Monday-report → pick-a-win cadence; the 07-21/07-24 day sessions were bug work,
so the report hadn't been actioned).

## Why boxing

The report's striking-distance list showed **`boxing tonight` (pos 5.4),
`boxing match today` (2.8), `boxing fight today` (2.5)** — ~140 combined
impressions, ~0 clicks — all landing on the *combined MMA* schedule pages.
Google already wants to rank us for boxing-today intent; we had no
boxing-specific page to give it. Meanwhile the boxing pipeline is healthy
post-un-shelving (8 upcoming cards: Matchroom ×2, Zuffa Boxing ×2, Golden Boy,
MVP ×2 — incl. **Joshua vs. Prenga the very next day**).

Checked and rejected as tonight's target: org-hub "schedule" queries
(`bkfc schedule` pos 5.0) — the `/orgs/[org]` titles already lead with
"Schedule & Results", nothing on-page to fix, that's authority/time.

## Shipped (`3eaaf93b`)

- **`/schedule/boxing`** — sport-facet schedule hub (Own The SERPs P2):
  "Boxing tonight" section (answers *is there a boxing match tonight* directly;
  shows next card when empty), full upcoming boxing schedule grouped by ET day,
  **US broadcasts fetched for every listed card** (how-to-watch intent), ItemList
  JSON-LD, boxing org-hub cross-links, BKFC pointer. 15-min ISR like its
  siblings.
- **`OrgInfo.sport`** added to `packages/web/src/lib/orgs.ts`
  (`mma | boxing | bareknuckle | other`) + `eventSport()` in `lib/schedule.ts`.
  Filter **fails closed**: unknown promotion → excluded, a missed card beats a
  polluted page. If the backend registry adds orgs, classify them here too
  (same mirror rule as the existing slug/promotion mirror).
- Internal links: "Boxing" pill on `/schedule`, `/schedule/tonight`,
  `/schedule/this-weekend`; boxing org hubs link back via ExploreLinks;
  root-sitemap entry (daily changefreq, moving lastModified).

## Prod data fix

**Deleted the 0-fight Golden Boy stub** `b0010335…` ("Golden Boy: Roach Jr vs.
Zepeda", created 2026-06-09 by the dead promoter scraper, `ufcUrl` =
goldenboy.com, stale since 07-01). The real Tapology event (`135770ef…`,
6 fights, tapology 143758) was created fresh 2026-07-23, so the pair rendered
as a visible dup — exactly the Matchroom-stub pattern from 2026-07-21, same
resolution. Verified 0 fights before delete.

## Verification

- Live at https://goodfights.app/schedule/boxing — "No boxing tonight" +
  next-card pointer to Joshua vs. Prenga (Sat July 25 ET), 8 cards in the
  upcoming section, Golden Boy shows the single clean card post-dedup.
- Sitemap resubmitted via `node packages/backend/scripts/gsc.js submit`.

## Watch next

- `boxing tonight` / `boxing match today` positions + clicks in the Monday GSC
  reports — the thesis is those queries migrate from the combined pages to
  `/schedule/boxing` and start converting impressions to clicks.
- UFC 330 how-to-watch remains scheduled for **Aug 1 (T-14)** — extend
  `ufc-330-makhachev-garry-preview`, per-country CA/UK/IE/AU sections.
