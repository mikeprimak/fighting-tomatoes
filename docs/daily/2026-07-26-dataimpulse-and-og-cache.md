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

**⚠️ NOT YET DEPLOYED TO THE VPS.** Deploying restarts `scraper-service`, which would drop
live tracking mid-card, and Zuffa Boxing 9 was live when this shipped. Once no card is
running: `bash /opt/scraper-service/packages/backend/vps-update.sh`, then
`node dist/scripts/testTapologyProxy.js` to confirm. Until then the VPS still pays the old
per-poll cost.

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
