# Sector Swell Monitor — design plan

**Created:** 2026-05-10
**Status:** Designed, not yet built
**Owner:** Mike

## Purpose

A monthly automated scan of public industry resources that produces a structured report on whether the combat-sports sector is moving toward a **swell** — the conditions under which Good Fights would be optimally sold (see `GOOD_FIGHTS_90_Day_Marketing_Plan.md` → "TIMING THE SALE — SECTOR UPSWELLS").

Acts as the trigger system for the readiness commitment: when the report flags a swell forming, lean into warm acquirer relationships; when the report flags a clear swell underway, move toward engagement with corp dev.

Mirrors the architecture of the existing **Broadcast Discovery** weekly job (`packages/backend/src/services/broadcastDiscovery/`) — same cron → search → LLM extract → persist → human review pattern.

---

## Five swell dimensions

Each dimension is scored 0–10 monthly. Composite swell score is the weighted average. Dimensions match the swell-drivers documented in the marketing plan.

| Dimension | What we're measuring | Example signals |
|---|---|---|
| 1. Star / fighter momentum | Are compelling fighter narratives forming? Solo breakout or constellation? | PPV buy-rate reporting, breakout-fighter coverage, "next McGregor" headlines, division depth |
| 2. Media & distribution | Streamers expanding combat-sports posture; broadcast era broadening reach | Netflix/Amazon/Apple combat-sports announcements, Nielsen post-CBS, rights-deal news |
| 3. Capital cycle | Are sports-asset M&A multiples expanding broadly? | Sports M&A activity, sports-media SPAC waves, comparable-deal pricing, low-rate signals |
| 4. Cultural crossover | Is MMA/boxing penetrating non-sports media? | Mainstream press (NYT, Variety, WSJ) mentions, doc/series releases, crossover spectacles |
| 5. Strategic acquirers | Are likely buyers signaling appetite? | TKO investor commentary, DAZN/PFL/Misfits announcements, "consolidation" headlines, M&A team hires |

**Weighting** (initial — tune after 3 months of data): 25% / 20% / 20% / 15% / 20%.

---

## Architecture

Mirror `broadcastDiscovery/` exactly. New folder: `packages/backend/src/services/sectorSwellMonitor/`.

```
sectorSwellMonitor/
  README.md                    # mirrors broadcastDiscovery/README.md
  searchBrave.ts               # reuse via shared module if possible, otherwise copy
  fetchSources.ts              # curated source list + fetch + main-text extract
  queries.ts                   # the per-dimension Brave queries (templated)
  extract.ts                   # Claude Haiku 4.5 per-result extraction → structured findings
  score.ts                     # Sonnet 4.6 synthesis: raw findings → per-dimension score (0-10) + reasoning
  report.ts                    # generate monthly markdown report
  persist.ts                   # write findings + score to DB (SectorSwellSnapshot, SectorSwellFinding)
  run.ts                       # orchestrator
```

CLI entry: `packages/backend/scripts/run-sector-swell-monitor.ts`.

Workflow: `.github/workflows/sector-swell-monitor.yml` — runs **1st of each month, 09:00 UTC**.

### Why monthly, not weekly

Sector signals are slow. Weekly produces noise — same headlines surface 4× in a row. Monthly gives enough delta for the trend line to be meaningful.

### Why not quarterly

A swell window can open inside a quarter. Monthly cadence + emailed report = no chance of missing it for 90 days.

---

## Data flow per run

1. **Build query set.** Per dimension, generate 8–15 Brave queries from `queries.ts` templates (e.g. `"UFC PPV buyrate {month} {year}"`, `"TKO Group acquisition combat sports"`). Total ~50–75 queries.
2. **Search.** Brave Search API. Filter by 30-day recency.
3. **Fetch & summarize.** For each result, fetch the page, extract main text. Curated trusted-source list (SBJ, Bloomberg, MMA Junkie, MMA Fighting, Variety, Deadline, NYT, WSJ, Front Office Sports, etc.) gets weighted; unknown sources still pass but flagged lower confidence.
4. **Per-finding extraction (Haiku 4.5 + prompt caching).** For each result: `{dimension, headline, source, date, signal_strength: low|medium|high, signal_direction: positive|neutral|negative, summary, url}`.
5. **Per-dimension synthesis (Sonnet 4.6).** Feed all findings for one dimension to Sonnet, get back: score 0–10 + 2–3 sentence reasoning + top-3 headlines. (This is internal data — feeds the next step, doesn't get shown to the user.)
6. **Composite & trend (internal).** Weighted-average composite score, prior-month delta. Stored for the appendix and historical tracking, not the headline.
7. **Briefing synthesis (Sonnet 4.6, the key step).** Feed Sonnet: this month's per-dimension reasoning + last month's briefing + a voice/style prompt. Output: the **3–5 paragraph plain-language briefing** that is the actual product. This step is where the value is — it has to write well, commit to a take, and end with a clear recommendation. Spend the prompt-engineering time here.
8. **Report.** Write briefing to `docs/sector-monitor/YYYY-MM.md` with appendix (score table + source links), commit to repo (so trend is git-diffable across months).
9. **Email.** Send full briefing as the email body via Resend. Subject: `Sector Swell Monitor — {month}: {one-line headline take}`. The user reads the email and is done.
10. **Persist.** Snapshot + findings + final briefing written to DB for admin-panel browsing and historical query.

---

## Output report shape

The output is a **scannable bulletin** — written for a tired reader with a lot on their plate. Read time: ~60 seconds for the top half, ~3 minutes if they want the full picture. Voice: plain language, friendly, direct. Short sentences. Bullets where possible. **No inline citations in the prose** — links live in a sources block at the bottom.

The dimensional decomposition (5 swell drivers) lives inside the prompt and the appendix scores. The body of the briefing is organized around what the user actually needs: bottom line, what to do, why, what changed, what to watch.

Format validated by the May 2026 prototype at `docs/sector-monitor/2026-05.md`. **Future months should match its shape exactly.**

### Required sections, in order

1. **The bottom line** — one bold sentence ("Market is warmer than it was. Not a swell yet."), then the composite score on its own line.
2. **What you should do** — 1–3 bullets max. Concrete, actionable, doable in under an hour each.
3. **Why — the things that got better** — bulleted, grouped by 2–4 concrete signals. Each signal has 2–4 sub-bullets with specific facts and a one-line "translation" of what it means.
4. **Why — the things that didn't get better** — same shape. Always include this section even if the picture is mostly positive; it forces the LLM to surface countervailing signals.
5. **What changed since last month** — short bulleted list. Compares this month's read to last month's. (For month 1, says so.)
6. **Watch these 2–3 things in the next 60 days** — small table: date, signal, why it matters.
7. **Bottom of the page — for when you have time** — appendix with per-dimension score table, sources list, methodology notes.

### Voice & style guidance for the synthesis prompt

- Plain language at a tired-reader level. No "swell-driver", "constellation", "composite score" or other internal jargon in the body.
- Specific over general. "UFC 326 pulled 2.5 million viewers" beats "ratings were strong."
- **No inline links in the body.** Sources go in the bottom block. Inline links break scannability.
- Short sentences. Short paragraphs.
- End each major signal with a one-line plain-English translation ("Translation: a brand-new mainstream pipe just opened, and it's pumping").
- The **What you should do** section commits to a take. Not a traffic light, not a menu — actual instructions the user could do today.
- The **Watch these 2–3 things** table is mandatory. It carries the trend forward to next month.

---

## DB schema (additions to Prisma)

```prisma
model SectorSwellSnapshot {
  id              String   @id @default(uuid())
  runDate         DateTime @default(now())
  month           String   // "2026-05"
  compositeScore  Float
  trend           String?  // "UP", "DOWN", "FLAT"
  recommendation  String   // "MAINTAIN" | "LEAN_IN" | "MOVE"
  reportMarkdown  String   @db.Text
  scoresByDim     Json     // { star: 4.5, media: 5.0, ... }
  reasoning       Json     // per-dimension synthesis
  createdAt       DateTime @default(now())
  findings        SectorSwellFinding[]

  @@unique([month])
}

model SectorSwellFinding {
  id          String  @id @default(uuid())
  snapshotId  String
  snapshot    SectorSwellSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  dimension   String  // "star" | "media" | "capital" | "cultural" | "acquirer"
  headline    String
  source      String
  url         String
  publishedAt DateTime?
  signalStrength String // "LOW" | "MEDIUM" | "HIGH"
  signalDirection String // "POSITIVE" | "NEUTRAL" | "NEGATIVE"
  summary     String  @db.Text
  confidence  Float   // 0-1
  createdAt   DateTime @default(now())

  @@index([snapshotId, dimension])
}
```

---

## Required env / secrets

- `DATABASE_URL` (already set in workflow secrets)
- `BRAVE_API_KEY` (already set — reuse from broadcast-discovery)
- `ANTHROPIC_API_KEY` (already set)
- `RESEND_API_KEY` (already set)
- `SECTOR_MONITOR_EMAIL_TO=avocadomike@hotmail.com` (new — or hardcode in run script)

## Cost estimate

Per monthly run:
- ~75 Brave queries × $0.005 = **$0.40**
- ~75 Haiku extractions × $0.001 (with prompt caching) = **$0.10**
- 5 Sonnet syntheses + 1 composite reasoning × ~$0.05 = **$0.30**
- Email = free
- **~$0.80/month, ~$10/year**

---

## Tuning knobs (env-overridable for manual dispatch)

- `SECTOR_MONITOR_DIMENSIONS=star,media` — limit scope for testing
- `SECTOR_MONITOR_LOOKBACK_DAYS=30` — search recency window (default 30)
- `SECTOR_MONITOR_MAX_QUERIES=100` — Brave query cap per run
- `SECTOR_MONITOR_DRY_RUN=true` — skip DB write + email, print to stdout

---

## Rollout plan

1. **Phase 1 — scaffolding (1–2 hrs).** Folder structure, workflow file, Prisma migration, env wiring. No real run yet.
2. **Phase 2 — query templates + Brave fetch (1 hr).** Build `queries.ts` for all 5 dimensions. Test with `DRY_RUN=true`.
3. **Phase 3 — extraction + per-dimension scoring (2 hrs).** Haiku extraction prompts, Sonnet per-dimension synthesis prompts. Validate against a hand-graded month.
4. **Phase 4 — briefing synthesis (2 hrs, the key step).** This is where most of the value is. Iterate the briefing-synthesis prompt against May 2026 real data until the output reads like a competent analyst's note — voice, specificity, judgment. Compare drafts side-by-side. Don't ship until at least one full briefing reads like something the user would actually want to receive monthly.
5. **Phase 5 — report file + email (1 hr).** Markdown template with prose body + appendix, Resend integration, commit to repo.
6. **Phase 6 — admin review surface (optional, later).** Add findings to admin panel for spot-checking. Not required for v1.
7. **Phase 7 — calibration (3 months).** First 3 briefings get reviewed in real time. Tune the synthesis prompt (voice, judgment, what to include vs. cut) and dimension weights. The briefing is the product — calibrate it like one.

Total v1 build estimate: **6–8 hours of focused work** (the extra hour vs. earlier estimate is for the briefing-prompt iteration in Phase 4 — that's where this project lives or dies).

---

## Delivery surfaces

Locked in for v1:

| Channel | Purpose | Status |
|---|---|---|
| **Email (Resend)** | Primary read — lands in inbox | In Phase 5 |
| **Admin panel page** | Browse all past briefings, see trend chart of composite + per-dimension scores across months, see prior months' "Watch" tables to check whether predicted signals played out | Add as Phase 5b |
| **Markdown in repo** (`docs/sector-monitor/YYYY-MM.md`) | Free archival, git-diffable, no UI needed | In Phase 5 |
| **PDF export from admin panel** | Forwardable artifact — for sending to advisors or pasting into corp-dev intros at the right moment | Add as Phase 5c |

Not adding for v1: Slack/Discord webhooks, mobile push, in-app banners. Would be noise.

### Phase 5b — admin panel page (~1 hr)

New page `/admin/sector-monitor`:
- Latest briefing rendered (markdown → HTML)
- Sparkline / small chart of composite score across all months
- Sparkline per dimension
- List of past briefings (clickable, opens that month's view)
- Each past month shows its "Watch these 3 things" table — reviewer can mark items as `played out` / `did not` / `pending` to track the monitor's accuracy over time

### Phase 5c — PDF export (~30 min)

Button on the admin panel: `Download PDF`. Renders the current month's briefing to a clean PDF (headline, body bullets, watch table, appendix). Use existing PDF generation lib if one is already in the stack; otherwise a simple HTML→PDF via Puppeteer in the route handler is fine.

## Open questions for v1

- Do we trust Sonnet's score directly, or require a human ratification before the email goes out? Default: trust the score, but recommendation `MOVE` requires manual confirmation before being acted on.

---

## Adjacent / future extensions

- **Acquirer-specific tracker.** Once warm relationships exist, a dedicated tracker per likely acquirer (TKO, DAZN, Netflix, etc.) — quarterly, more depth.
- **Comparable-deal multiples database.** Maintained list of public sports-data / sports-media deals with $/MAU and $/data-point comps to support valuation conversations when the swell hits.
- **Press-mention alerting.** Real-time monitor for any mention of "Good Fights" or "fightcrewapp" in trade press once the brand starts traveling.
