# 2026-07-26 — DataImpulse traffic audit + OG-image caching fix

Two unrelated threads, both cost-shaped.

## 1. DataImpulse: is it worth the $50 top-up?

**Verdict: yes. The wiring is correct; the account is simply out of GB.**

### It is not misconfigured

The VPS smoke test (`dist/scripts/testTapologyProxy.js`) fails all three orgs with
`net::ERR_PROXY_AUTH_UNSUPPORTED`, which reads like a credentials problem. It isn't.
Chrome just can't render the proxy's real reply. A raw curl through the same proxy
shows what DataImpulse is actually saying:

```
> CONNECT api.ipify.org:443 HTTP/1.1
< HTTP/1.1 407 TRAFFIC_EXHAUSTED
```

`TRAFFIC_EXHAUSTED` is a balance code, not an auth code. Host, port, sticky session
and credentials are all reaching DataImpulse correctly. Nothing to fix before topping
up. **Note for next time: `ERR_PROXY_AUTH_UNSUPPORTED` from the smoke test means
"check the balance", not "the creds rotated".**

### Burn rate: ~4 GB/month

Two independent estimates agree:

- **Measured:** every Tapology page load costs ~1,080 KB (see below), and the VPS
  journal shows ~9 fetches/day idle, 90 on Jul 24 (KC 62), 150 on Jul 25.
- **Historical:** the ~$5 loaded 2026-06-17 lasted until ~Jul 25, i.e. ~5.5 weeks
  ≈ 0.9 GB/week ≈ 3.9 GB/month.

At DataImpulse's residential rate (~$1/GB) **$50 is roughly a year of runway.**

### But 98–99% of every billed byte is Cloudflare, not Tapology

Measured per navigation, broken down by host:

| Bucket | Bytes |
|---|---|
| `challenges.cloudflare.com` + `cdn-cgi/challenge-platform` + turnstile | ~1,070 KB |
| Actual Tapology HTML | ~6 KB |

We pay residential-proxy rates to download Cloudflare's challenge machinery, over and
over. The reason it never amortises: `tapologyLiveScraper.fetchHtmlWithRetry()` calls
`launchTapologyBrowser()` **per fetch** and closes the browser at the end, so the
`cf_clearance` cookie CapSolver just paid to obtain is discarded. The next poll —
150s later — re-challenges from zero. CapSolver's own solve also egresses through the
same proxy, roughly doubling the per-poll cost.

**FIXED same day (`13f0a115`).** `tapologyBrowser` now owns a process-wide browser that
persists across fetches and is shared by concurrent trackers, so one clearance serves them
all. Bounded so a long card can't leak Chrome: recycled after 40min (cf_clearance goes
stale anyway), 250 page opens, on disconnect, or when the last tapology tracker stops. A
recycle costs exactly what every fetch used to cost. The "challenge not cleared" path sheds
the session deliberately — a flagged sticky exit won't clear by being retried — while plain
navigation timeouts keep the browser, so a blip doesn't forfeit the saving. Contract test in
`tapologyBrowser.sharedSession.test.ts` covers reuse, no page leak, real replacement on
recycle, double-close safety, and concurrent callers sharing one launch.

**DEPLOYED TO THE VPS 2026-07-27 00:06 UTC**, mid-card at Mike's call. The saving is
directly visible in the scrape times either side of a browser reuse:

| | Duration |
|---|---|
| Scrape #1 (cold — launch + CapSolver solve) | **81.4s** |
| Scrape #2 (warm — reused browser + cf_clearance) | **24.6s** |

Scrape #2 skipped the challenge entirely. That 3.3× is the ~1 MB of Cloudflare traffic
not being re-downloaded.

### Follow-up shipped same night: idle release + proxy alert (`19d868b9`)

Monitoring after the first deploy showed the cost of keeping Chrome resident on a 2 GB
box. Steady state was fine (~1,300 MB available, load < 1) but a scrape spikes to ~65-78
Chrome processes and briefly leaves **~176 MB available** — and `dmesg` shows Chrome
OOM-killed three times on **2026-07-25**, before any of this, so the margin was already
thin. The shared session was holding ~14 processes of that headroom even when nothing was
polling.

**Idle release:** the browser is now dropped after 4 min with no fetch. That spans the
150s live cadence, so back-to-back polls still reuse the clearance (where the entire
saving is), while the 15-min slow keep-alive and the gaps between cards give the memory
back. Verified post-deploy: 13 Chrome processes held steady across polls, load 0.2-0.6.

**Proxy-down alert:** fires on the second consecutive proxy-shaped error, once per hour,
with the cooldown reset on the next success so a fresh outage pages immediately. Detection
keys on `ERR_PROXY_AUTH_UNSUPPORTED` / `407` / `TRAFFIC_EXHAUSTED` / tunnel failures, and
deliberately **ignores navigation timeouts and uncleared challenges** — those are
recoverable and not the proxy being dead. Delivery reuses the endpoint the scraper
workflows already call, because `EmailService` needs SMTP credentials that live on Render
and not on the VPS.

### Two things that will push the burn up

1. **All 9 daily Tapology scrapers are now unshelved.** `/api/promotions/shelved`
   returns `{"shelved":[]}`; the docs still assume most are shelved. Every one of them
   now runs its cron daily and pays at least one full challenge per run.
2. **There is no bandwidth kill-switch.** When a live tracker can't clear Cloudflare it
   retries 4× per poll. At 150s across an 8-hour card that is ~190 polls × 4 attempts
   ≈ **800 MB in a single night** with nothing to stop it.

### Incident: Zuffa Boxing 9 stalled on the exhausted proxy

The exhaustion had live consequences the same evening. Zuffa Boxing 9 (Berlanga vs Butler)
went LIVE with the tracker failing every poll on `ERR_PROXY_AUTH_UNSUPPORTED` — Tapology
showed the opening three bouts finished, the app showed all 8 upcoming. **No code fix was
needed: the tracker self-healed the moment Mike topped the account up.** At 23:17:36 the
next scheduled poll cleared CapSolver, matched all 8 fights and updated 3; #6-8 landed with
winners and methods (Davis UD, Nash MD, Francis UD).

Worth remembering: the failure was silent from the outside. The service stayed `active`, the
event stayed LIVE, and only the journal showed 6 consecutive scrape errors. This is exactly
the case the missing bandwidth kill-switch (below) should alert on.

## 1b. Tapology live trackers now infer the running bout (`ac5f378a`)

Follow-on question from the same session: how does a Tapology tracker know a
fight is live? **It didn't.** Worth writing down properly, because the answer was
"there is no such thing on Tapology."

### What the signal actually is

Tapology publishes **no live marker at any level**. The scraper does look for an
event status (`tapologyLiveScraper.ts:224`) but that selector is a legacy guess
matching nothing on current markup — the header reads `upcoming` four hours into
a card. Verified live during Zuffa Boxing 9:

```
Jul 27 00:33:27  [TAPOLOGY] 8 fights, status: upcoming
Jul 27 00:33:28    DONE Wallin vs Sirenko -> Sirenko by TKO
```

So the one real-time signal is **a result appearing on the page**. On that
transition `tapologyLiveParser` already fired `notifyNextFight()` (the walkout
push), but it never wrote `fightStatus = LIVE` — the parser only ever wrote
COMPLETED, CANCELLED and UPCOMING-resets. Consequence: no Tapology bout had ever
carried LIVE, so the apps fell back to a client-side "Up Next" guess
(`live-events.tsx:367`) and a Tapology card could never show **Live Now**.

### The inference

Walk the card in **descending orderOnCard** (main event is ord 1 and runs last,
the same convention `notifyNextFight` relies on), take the first non-COMPLETED
bout, flip it to LIVE once `LIVE_INFERENCE_DELAY_MS` has passed since the anchor:

- **the most recent result detected on this card**, or
- for the opening bout, **the card's earliest section start time** — and only
  once the lifecycle has already moved the event to LIVE, so a bad start time on
  a future card can't light up a bout days early.

**The delay is 5 minutes, and it is deliberately early.** Measured gaps between
consecutive result detections on Tapology cards are far longer — median **42 min**,
p25 **19 min** across the last 25 events; Zuffa Boxing 9 itself ran 30 min and
45 min between results. So this will usually lead the opening bell. Operator call
(2026-07-27): Tapology lags, our poll adds up to another 150s on top, and being
late means missing the live window altogether, while being early only means the
badge leads the broadcast.

Tune with `TAPOLOGY_LIVE_DELAY_MS`.

### Guards

| Guard | Why |
|---|---|
| Same scrape-health gate as the cancellation sweep | a partial scrape must not move a bout |
| Nothing inferred once the event is COMPLETED | the card is frozen |
| Anchor older than **3h** refused outright | a stalled or finished card can't park a Live Now badge overnight |
| Stray LIVE bouts that aren't current get demoted to UPCOMING | self-healing if the card order shifts; never touches COMPLETED |
| CANCELLED bouts skipped | never the running fight |
| Backfill passes `skipLiveInference` | it runs days later; nothing is in progress |
| Inferred flip does **not** reset the adaptive-poll flatline clock | it comes from a clock, not from new source data |

Decision logic is split into a pure `decideLiveFight()` so the timing rules are
testable with no DB and no network —
`tapologyLiveParser.liveInference.test.ts`, 18 assertions, all passing.

### Verified in production, mid-card

Deployed to the VPS 00:44 UTC while Zuffa Boxing 9 was still running. It fired on
the very first poll and was idempotent on the second:

```
00:44:38   LIVE Derevyanchenko vs Hackett (inferred, 11m after previous result)
00:44:38 [TAPOLOGY] Matched: 8, updated: 0, live: Derevyanchenko vs Hackett
00:47:16 [TAPOLOGY] Matched: 8, updated: 0
```

DB confirms exactly one LIVE row on the card, with the shadow field in step:

```
ord= 4 Wallin vs Sirenko          | COMPLETED | tracker=COMPLETED | TKO
ord= 3 Derevyanchenko vs Hackett  | LIVE      | tracker=LIVE      |
ord= 2 Hitchins vs Salas          | UPCOMING  | tracker=-         |
```

No UI change was needed: mobile's `isUpNext` switches off as soon as a real LIVE
bout exists, and web's `LiveFightCard` already picks "Live Now" over "Up Next" off
`fightStatus`.

## 2. Vercel alerts: fight OG images were never cached (`e595f3bf`)

Both alerts — the `/fights/[id]/opengraph-image` error spike and the Function CPU
Duration spike — are the same root cause, and PerplexityBot was the trigger, not the
problem.

The route shipped `Cache-Control: public, max-age=0, must-revalidate`. Verified in
prod: `X-Vercel-Cache: MISS` on back-to-back requests for the same fight. So every
single hit paid a full ~270ms render (API fetch + 2 headshot fetches + base64 + Satori
+ PNG encode), and the CDN never held a copy. That made it the largest CPU line on the
project: 20m/day, more than the entire `/fights/[id]` page at 12.6m.

PerplexityBot then crawled ~4,800 fight pages (the sitemap carries 4,009), taking the
baseline from <30 req/hr to 1000+ per 20min — a 40× spike, every request a cache miss.

**Fixed:** 1h browser / 24h CDN TTL + a week of stale-while-revalidate. Repeat crawls
and repeat social unfurls are now free. The API-failure fallback card gets a 60s TTL
only, so a transient backend blip can't pin a logo-only card in front of a real fight
for a day.

Verified against a local production build that `ImageResponse`'s `headers` win over the
`max-age=0` that Next.js stamps on dynamic metadata routes. `export const revalidate`
is set as well in case that ordering ever changes.

**Also fixed:** both upstream fetches were unbounded. That is the likely source of the
paired `Task timed out after 300 seconds` / `failed to pipe response` errors in the
logs — one hung Render dyno or R2 object rode the function to Vercel's 300s ceiling.
Now 6s (fight API) and 4s (headshots), degrading to the placeholder circle.

**Deliberately not done:** blocking PerplexityBot in `robots.ts`. It is absent from
`BLOCKED_BOTS`, but unlike the AI-training and SEO-tool crawlers on that list it is a
discovery crawler that feeds Perplexity citations — the same reason `OAI-SearchBot` and
`Perplexity-User` are allowed. With caching in place the crawl is cheap, so blocking it
would trade citations for nothing. Revisit only if it starts crawling far beyond the
sitemap.

## Commits

| SHA | What |
|---|---|
| `e595f3bf` | OG image caching + bounded upstream fetches |
| `13f0a115` | Shared Tapology browser (one Cloudflare clearance per session) |
| `19d868b9` | Idle browser release + proxy-down alert |
| `ac5f378a` | Tapology running-bout inference |

## Follow-ups

Nothing blocking. In rough priority order:

1. **Watch the 5-min live delay across two or three full cards.** It is knowingly early
   (see §1b) and the right value is an empirical question, not a design one. If bouts are
   showing Live Now conspicuously before the ring walk, raise `TAPOLOGY_LIVE_DELAY_MS` —
   but only after watching, and don't "correct" it on principle.
2. **No bandwidth kill-switch on the proxy.** A tracker that can't clear Cloudflare
   retries 4× per poll: ~800 MB in one 8-hour night, with nothing to stop it. The new
   proxy-down alert covers the *dead* case, not the *burning* case.
3. **VPS memory headroom.** 2 GB, and a scrape still spikes to ~65 Chrome processes
   leaving ~176 MB free. Three OOM kills on 2026-07-25 pre-date all of this work, so the
   margin was already thin. Worth a look on a busy multi-card night.
4. **The same inference would suit RAF.** Its official page is result-only in exactly the
   same way — see the area doc.
5. **`docs/areas/live-trackers.md` coverage matrix still says "May 2026"** and predates
   several changes. Not wrong for the Tapology rows, just stale in general.
