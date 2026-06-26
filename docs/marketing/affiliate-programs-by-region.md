# Affiliate Programs for "How to Watch" Links — by Region

**Purpose:** Monetize the broadcaster links in the app's How-to-Watch cards. Every broadcaster link already routes through our click tracker (`/api/r/b`) and out to whatever URL is set on that channel. Set a channel's **Affiliate URL** in the admin panel (Broadcasts tab → Broadcast Channels → Edit) and every tap for that channel starts earning. No affiliate URL = falls back to the homepage (un-monetized, but still tracked).

Last researched: **2026-06-26.** Programs and rates change — **verify current terms when you apply.**

---

## TL;DR — what to do, in order

1. **Join [Impact.com](https://impact.com/) first.** It's the single biggest unlock — Fubo, Kayo (AU), and many US streamers run their programs there. One account, many brands.
2. **Join [Awin](https://www.awin.com/).** Covers Sky (UK) and most European broadcasters. Awin now also owns Commission Factory (AU), so it doubles as AU reach.
3. **Apply to [DAZN direct](https://affiliate.dazn.com/)** (also on [Partnerize](https://dazn.partnerize.com/signup/en) and FlexOffers). DAZN is the highest-value combat-sports channel globally (boxing + some MMA), live in US/UK/CA/AU/DE/IT/ES.
4. **Apply to [Fubo](https://www.fubo.tv/stream/affiliate/)** (via Impact) — best documented payout for a US live-TV service that carries fight cards.
5. **[Amazon Associates](https://affiliate-program.amazon.com/)** — for any Prime Video event (PFL has been on Prime). Easy to get, low payout, but instant links.
6. Add the affiliate URLs to the matching channels in the admin panel as approvals land.

**Reality check:** the *official* rights-holders for the marquee promotions — **ESPN+ (UFC US PPV), TNT Sports (UFC UK), UFC Fight Pass** — do **not** run open affiliate programs we could find (2026-06). So the monetizable surface is mostly the **aggregator / live-TV bundlers** (Fubo, Sling, Kayo, Sky) and **DAZN**, not the promotion's first-party platform. Set realistic expectations: this is supplemental revenue, not a primary line, at current scale.

---

## The networks (where you actually sign up)

| Network | Sign-up | Covers | Notes |
|---|---|---|---|
| **Impact.com** | impact.com | Fubo, Kayo (AU), DAZN (some geos), many US streamers | The priority join. Links + assets live in the Impact dashboard once approved. |
| **Awin** | awin.com | Sky (UK), European broadcasters; owns Commission Factory (AU) | €/£ payouts; small refundable deposit to join. |
| **Partnerize** | partnerize.com | DAZN (PHG) | DAZN routes some geos here. |
| **Amazon Associates** | affiliate-program.amazon.com | Prime Video | Instant approval-ish; cookie only 24h; low rate. |
| **FlexOffers / Rakuten / CJ / Skimlinks** | various | Aggregators that resell DAZN, Fubo, Sling, etc. | Fallback if a brand's direct program rejects you; usually lower split. |

---

## By region

### 🇺🇸 United States
| Broadcaster (channel slug) | Program | Where | Notes |
|---|---|---|---|
| **DAZN** | DAZN Affiliates | affiliate.dazn.com / Partnerize / FlexOffers | Boxing + some MMA. 30-day cookie. Commission on valid subs. |
| **Fubo** | Fubo Partner Program | Impact | ~$30/confirmed sub, up to ~$24 tiered, 4% of PPV. Trials excluded, 30-day cookie. partners@fubo.tv |
| **Sling TV** | Sling affiliate | Impact / CJ | Carries some combat sports via add-ons. |
| **DirecTV Stream** | affiliate | Impact / CJ | PPV carrier. |
| **Prime Video** | Amazon Associates | Amazon | For PFL-on-Prime style events. |
| **ESPN+** | ❌ no open program found | — | UFC US PPV home; first-party only. Re-check periodically. |
| **UFC Fight Pass** | ❌ no open program found | — | Owned by TKO; ESPN closing in on acquiring on-demand rights. Re-check. |
| **TrillerTV / FITE** | FITE/TrillerTV affiliate | direct | Historically had an affiliate program; carries smaller MMA/boxing/kickboxing promotions — good fit for our long-tail orgs. Verify it's still live. |
| **Paramount+** | Paramount+ affiliate | Impact / CJ | Carried Bellator (Showtime legacy); some PFL. |

### 🇬🇧 United Kingdom
| Broadcaster | Program | Where | Notes |
|---|---|---|---|
| **DAZN** | DAZN UK | affiliate.dazn.com / Partnerize | Major boxing home in UK. |
| **Sky Sports** | Sky affiliate | Awin | Europe's leading entertainment co.; carries boxing/PPV. |
| **TNT Sports** | ❌ limited/none found | — | UFC UK home (ex-BT Sport). Re-check via Awin/Discovery. |

### 🇨🇦 Canada
| Broadcaster | Program | Where | Notes |
|---|---|---|---|
| **DAZN Canada** | DAZN | affiliate.dazn.com / Partnerize | DAZN is a major combat-sports carrier in CA. |
| **TSN / RDS (Bell)** | check Bell/Awin | — | UFC has aired on TSN; affiliate availability unclear. |

### 🇦🇺 Australia / 🇳🇿 New Zealand
| Broadcaster | Program | Where | Notes |
|---|---|---|---|
| **Kayo Sports** (Foxtel) | KAYO | Impact (~10%) | Main AU sports streamer; carries Main Event PPV. |
| **DAZN AU** | DAZN | affiliate.dazn.com | Growing AU presence. |
| **Main Event** (PPV) | via Kayo/Foxtel | Impact | PPV combat events. |

### 🇪🇺 Europe
| Broadcaster | Program | Where | Notes |
|---|---|---|---|
| **DAZN** (DE/IT/ES) | DAZN | affiliate.dazn.com / Partnerize | Dominant combat-sports carrier across DACH + IT + ES. |
| Country-specific nets | various | Awin | Use Awin's European merchant directory per country. |

---

## Compliance — don't skip this

- **FTC / ASA disclosure:** affiliate links must be disclosed. Add a short "Some 'How to Watch' links are affiliate links — we may earn a commission" line near the How-to-Watch UI and/or in a help/legal page. (Follow-up: add this disclosure to web + mobile.)
- **App Store / Play:** affiliate links to external subscriptions are fine as outbound web links (we already open the system browser). Don't build in-app purchase flows around them.
- **Cookie windows are short** (24h Amazon, 30d most others) — our value is the *click at decision time* (user is literally about to watch), which is the best possible intent signal. Lean into that.

---

## How it's wired (for future-me)

- Channel field `BroadcastChannel.affiliateUrl` holds the tracked link. Precedence at click time: event-specific `eventDeepLink` → `affiliateUrl` → `homepageUrl`.
- Clients never carry the destination URL; the redirect endpoint `/api/r/b?c=<channelId>&...` re-resolves it server-side (no open-redirect, always uses the latest affiliate URL).
- Every click writes a `BroadcastClick` row (channel, event, region, card section, tier, platform, affiliate-vs-homepage). See admin **Broadcasts → How-to-Watch Click Revenue**.
- See `docs/daily/2026-06-26.md` for the build, and the in-admin reference card (Broadcasts tab) for the operator-facing version of this doc.

## Sources
- [DAZN Affiliates](https://affiliate.dazn.com/) · [DAZN via Partnerize](https://dazn.partnerize.com/signup/en) · [DAZN on FlexOffers](https://www.flexoffers.com/affiliate-programs/dazn-global-affiliate-program/)
- [Fubo Affiliate Program](https://www.fubo.tv/stream/affiliate/) · [Fubo + Impact case study](https://impact.com/partnerships/learn-how-fubotv-efficiently-nurtures-partnerships-with-impact/)
- [Kayo via Impact](https://www.commissionfactory.com/) · [Sky via Awin](https://ui.awin.com/merchant-profile/11005) · [Awin acquires Commission Factory](https://www.awin.com/gb/news-and-events/awin-news/full-acquisition-of-commission-factory)
- [Impact.com](https://impact.com/) · [Amazon Associates](https://affiliate-program.amazon.com/)
