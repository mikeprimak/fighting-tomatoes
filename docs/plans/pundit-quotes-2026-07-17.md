# Pundit Quotes ("What the media said") — Scope

*Drafted 2026-07-17 from a brainstorm + live dry run against UFC 329 (McGregor vs Holloway 2).*

## Product shape

A Rotten-Tomatoes-inspired **critic layer** on completed fights: a strip of short,
attributed pundit quotes ("What the media said") on the fight detail screen, below the
community rating. Explicitly **NOT a numeric critic score** — the dry run showed MMA
media reacts to narratives (careers, stardom, refunds), not "was this a good fight," so
a sentiment-derived meter would be fabricated precision. Quotes + attribution + link out
is the honest version, and it's the RT fair-use model (short quote, named critic, outlet,
link to the full piece).

Dry-run evidence (one snippet-only search pass, ~5 days post-event): 6-8 attributable
takes on the UFC 329 main event alone — Helwani, Bisping, Sonnen, Din Thomas, CBS Sports
staff, ESPN, RGIII — mostly surfaced via aggregator articles (Bloody Elbow, BJPenn,
MMA Mania) that transcribe podcast/YouTube quotes into text. That laundering is good
news: the quotes arrive as *fetchable article text*, which is what our pipeline already
ingests, and it makes verbatim verification possible (see below).

## Architecture: piggyback on Phase 6 post-fight enrichment

Do NOT build a new discovery job. The Phase 6 recap cron
(`services/aiEnrichment/postFight/`, daily 16:00 UTC, T+5d→T+45d window, cap 25 events)
already: selects completed events needing recaps, fetches promotion recap pages + Brave
editorial in `mode: 'recap'` across the 14-domain allowlist, and makes one Haiku call per
event. This is the same piggyback play as the event-summary field on Phase 1 (see
ai-enrichment.md "Event-level one-liner"): extend the existing extractor output with a
`punditQuotes[]` array per fight, at near-zero marginal cost and grounded in the same
fetched evidence.

Pipeline delta:

1. **Fetch** — reuse the recap articles already fetched. Add ONE extra Brave query per
   event in reaction phrasing (`"<matchup>" reaction | media | "should retire" | column`)
   and raise `topN` for that query, because reaction/aggregator pieces are partially
   disjoint from play-by-play recaps. (+1 Brave query/event ≈ +8-10/week; see budget.)
2. **Extract** — `extractPostFightEnrichment.ts` prompt gains a "Pundit quotes rules"
   section. Output per fight: `punditQuotes: [{ speaker, speakerRole, outlet, quote,
   sourceUrl, confidence }]`. Rules:
   - Quote must be **verbatim from the provided article text**, ≤ ~40 words. No
     paraphrase, no stitching.
   - `speaker` = the person who said/wrote it (Sonnen), NOT the aggregator that
     transcribed it. `outlet` = where we found it. Both are displayed: "— Chael Sonnen,
     via Bloody Elbow".
   - `speakerRole` enum: `journalist | analyst | ex_fighter | broadcaster | other`.
   - **Exclusions:** promotion employees speaking as promoters (Dana White), the fight's
     own participants and their corners (that's what Phase 6 `callouts[]`/aftermath
     already capture), betting-content boilerplate, anonymous "fans reacted" filler.
   - Quote must be ABOUT this fight/its outcome (aboutness check), not the pre-fight
     hype cycle.
3. **Verify (deterministic, the key anti-hallucination guard)** — after parsing, require
   the normalized quote (case/whitespace/smart-quote folded) to appear as a **substring
   of the actually-fetched article text** for its claimed `sourceUrl`. Fail → drop the
   quote, log it. LLMs asked for verbatim quotes will paraphrase under pressure; the
   confidence float alone is not sufficient for content we're publicly attributing to a
   real named person. This is stricter than any existing enrichment gate, deliberately —
   misquoting a journalist is a different failure class than a soft narrative line.
4. **Persist** — new tables (below), additive, in `persistPostFight.ts`'s transaction
   scope but separate from the `aiPostFight*` columns.

## Schema (new tables — NOT JSONB on Fight)

A real table because: per-quote provenance + takedown flags, dedupe across outlets,
cross-fight queryability ("every Helwani quote" → future pundit pages / the media-graph
sale-value asset), and moderation without rewriting a blob.

```prisma
model Pundit {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique          // "chael-sonnen"
  aliases   String[]                  // ["Sonnen", "Chael P. Sonnen"]
  role      String                    // journalist|analyst|ex_fighter|broadcaster|other
  excluded  Boolean  @default(false)  // hard display kill-switch (e.g. promoters)
  createdAt DateTime @default(now())
  quotes    PunditQuote[]
  @@map("pundits")
}

model PunditQuote {
  id           String   @id @default(uuid())
  fightId      String
  punditId     String
  quote        String                 // verbatim, <=40 words enforced at extract
  outlet       String                 // "Bloody Elbow"
  sourceUrl    String
  publishedAt  DateTime?              // article date if extractable, else null
  aiConfidence Float
  verified     Boolean                // passed the substring check (MVP: always true to persist)
  status       String   @default("VISIBLE") // VISIBLE|HIDDEN|TAKEDOWN
  quoteHash    String                 // sha of normalized quote, for dedupe
  createdAt    DateTime @default(now())
  fight        Fight    @relation(fields: [fightId], references: [id], onDelete: Cascade)
  pundit       Pundit   @relation(fields: [punditId], references: [id])
  @@unique([fightId, punditId, quoteHash])   // same quote via 2 aggregators = 1 row
  @@index([fightId, status])
  @@map("pundit_quotes")
}
```

Pundit rows: seed ~25-30 known names with aliases (Helwani, Bisping, Sonnen, Luke
Thomas, Brookhouse, Okamoto, Raimondi, Din Thomas, RGIII…) for normalization; the cron
auto-creates unknowns with the LLM-classified role (consistent with the no-review-inbox
precedent, Decision §4) — spot-check the first ~10 outputs per the QA rule. Dana White
et al. seeded with `excluded: true` as a belt-and-suspenders on top of the prompt rule.

**🚨 Migration protocol:** author the migration against a throwaway LOCAL Postgres, then
`pnpm db:migrate:deploy` to prod. Never `migrate dev`/`db push` (CLAUDE.md rule; the
2026-06-06 outage). Dev backend will 500 on new-column selects until the deploy runs
(known gotcha: `lesson_dev_backend_prod_db_unmerged_migration`).

## Display

- **Mobile** (`CompletedFightDetailScreen.tsx`): "What the media said" card below the
  post-fight recap block. Quote, "— Speaker, via Outlet" attribution, tap → source URL.
  Ships via OTA, no native build.
- **Web** (`FightDetailClient.tsx` fight page): same strip, SSR — each quote is unique
  indexable text and "what did the media say about X vs Y" is a searched phrase (SEO
  upside compounds with the programmatic-SEO workstream).
- **Display gates:**
  - `aiConfidence >= 0.5` (house rule) AND `verified` AND `status = VISIBLE` AND pundit
    not `excluded`.
  - **≥ 2 qualifying quotes or render nothing** — the empty-room gate. Coverage skews
    brutally to big cards; a one-quote strip on an Oktagon prelim looks sadder than no
    strip. Silent skip, never an empty section.
  - **🚨 Spoiler-free mode (mobile):** quotes are outcome content ("blew out his knee on
    the first kick"). Must sit behind the same `isOutcomeRevealed` gate as the
    `aiPostFightSummary` block (CompletedFightDetailScreen ~line 1764) — NOT the
    pre-fight-safe path. Web fight pages are public/SEO and already show results; no
    gate there.

## Fight scoping (which fights get the pass)

MVP: **main event + co-main of every event the Phase 6 cron already processes.** The
dry run says quote density collapses below the top of the card even on a record-gate
PPV. Prelims would burn extract tokens for rows the ≥2-quote gate hides anyway. Knob:
`PUNDIT_QUOTES_MAX_BOUTS_PER_EVENT` (default 2, by `orderOnCard`). Revisit if aggregator
coverage of undercard moments (e.g. the Pimblett co-main) proves richer than expected —
which UFC 329 suggests it might.

Timing note: the T+5d window start is actually FINE for quotes (reaction pieces peak
T+0→3 but remain indexed; Brave freshness is past-month) and postponing to T+5 catches
the full news cycle including "week later" columns. No cadence change needed.

## Cost & budget

- Haiku: ~+300-600 output tokens/event on an existing call — cents/month.
- Brave: +1 query/event ≈ +8-10/mo on the shared 2k/mo free tier (broadcast discovery
  ~200/mo, Phase 1 ~75/mo, start-time discovery, Phase 6). Comfortable, but Brave is
  now FOUR jobs on one key — worth a one-time usage tally before adding a fifth
  consumer, and a log line per run so overage is diagnosable.
- Well inside the <$300/yr ceiling.

## Specific considerations caught during scoping

1. **Verbatim-quote hallucination is the #1 risk** — hence the deterministic substring
   verification gate. Confidence floors are not enough when we attribute words to a real
   person. This also constrains sources to pages we fully fetched (no snippet-only
   extraction), which the piggyback design already satisfies.
2. **Spoiler-free mode** would leak outcomes via quotes if wired to the wrong block.
   Gate = outcome-revealed path.
3. **Speaker ≠ outlet** (aggregator laundering). Both stored, both displayed. Dedupe on
   normalized quote hash because the same Sonnen line appears on 3 sites.
4. **Fair use hygiene:** ≤40-word quotes, always attributed + linked, `TAKEDOWN` status
   honored manually if an outlet ever objects. Never reproduce article bodies.
5. **fast-json-stringify strips unlisted fields** — the fight-detail API response schema
   must add the quotes array explicitly, same as every prior enrichment field.
6. **Participants' own quotes are excluded** — Phase 6 `callouts[]`/`aftermath[]`
   already own fighter mic moments; the media strip is third-party voices only. Keeps
   the two features from rendering duplicate content on the same screen.
7. **Legacy/historic fights:** the 2,022-fight Phase 6.5 historic campaign could later
   backfill quotes (old articles are still fetchable), Claude-Code-as-LLM, zero API
   cost. Out of MVP scope; noted so we don't design it out — the schema supports it as-is.
8. **Allowlist gap:** the outlets that carried the UFC 329 quotes were mostly already on
   the 14-domain allowlist (bloodyelbow, bjpenn, mmamania, cbssports, espn). MiddleEasy
   and The Body Lock are not — optional adds, low priority.
9. **Sale-value framing:** `pundits` + `pundit_quotes` is a media-graph dataset (which
   voices cover which fighters/orgs) with real provenance — an asset with history if it
   accrues from now, per the sale-value doctrine.

## Out of scope (v2+ candidates)

- YouTube/podcast transcript ingestion (aggregators already launder the high-value
  quotes into text; transcripts add cost + attribution risk for marginal gain now).
- AI-written "media consensus" one-liner à la RT consensus (revisit once quote volume
  is observed; needs its own disclosure treatment).
- Pundit profile pages / SEO surfaces ("Every Bisping take") — schema supports it.
- Numeric critic score — rejected on principle, see Product shape.
- Recruiting journalists to rate fights in-app (cold outreach; needs nobody's
  cooperation is the whole point of the pulled-quote design).

## Build order (single session-sized MVP)

1. Migration (local author → `migrate deploy`), seed pundit registry script.
2. Extractor prompt + parser + substring verifier + persist (piggyback in Phase 6).
3. Dry-run CLI against a recent big card (UFC 329 is the perfect fixture) — spot-check
   before enabling in the cron path.
4. API select + response schema on fight detail endpoints.
5. Web strip (SSR) → mobile strip (spoiler-gated) → OTA.
