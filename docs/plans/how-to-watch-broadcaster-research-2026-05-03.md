# 2026 Broadcaster Research — How-to-Watch Feature

**Researched:** 2026-05-03 (live web search). Use for the initial seed of `EventBroadcast` + `PromotionBroadcastDefault` rows. Re-verify before each major card.

The original design doc (`docs/plans/how-to-watch.md` §9) had several outdated hypotheses. Confirmed below.

---

## UFC — MAJOR CHANGE

The Paramount/TKO deal closed in Aug 2025; **PPV model is dead**, effective 2026.

| Region | 2026 broadcaster | Tier | Notes |
|--------|------------------|------|-------|
| **US** | Paramount+ (all events) + CBS (free OTA simulcast of select numbered cards) | SUBSCRIPTION + FREE | 7-yr / $7.7B deal. 13 numbered + 30 Fight Nights. |
| **UK** | Paramount (replacing TNT Sports starting 2026) | SUBSCRIPTION | TNT contract expires; Paramount has multi-territory deal |
| **Australia** | Paramount+ (multi-territory expansion) | SUBSCRIPTION | Confirmed via Paramount/TKO press release |
| **Latin America** | Paramount+ | SUBSCRIPTION | Same multi-territory expansion |
| **Canada** | **UNCLEAR** — Sportsnet currently holds rights; Paramount has first-dibs but a 2026 contract status unconfirmed in press | SUBSCRIPTION | Treat as Sportsnet for now, flag for re-verify before each card |
| **NZ** | Sky Sport (historical) — no public confirmation of a 2026 Paramount NZ deal | SUBSCRIPTION | Re-verify per card |
| **EU** | Likely DAZN in some markets, Paramount expanding | mixed | Per-market — leave to user reports for v1 |

**For UFC 328 (May 9, 2026):** Stream on Paramount+ (US). Select prelims free on CBS. Start times: early prelims 5pm ET, prelims 7pm ET, main 9pm ET.

---

## Zuffa Boxing — Major change

- **US, Canada, Latin America:** Paramount+ exclusive starting Jan 2026 (12+ events/yr).
- Originally the design doc said "manual entry per event"; we now have a true global default for these 3 regions.
- Some events may simulcast on CBS.

---

## Boxing — DAZN consolidation

| Promotion | Broadcaster (global default) | Notes |
|-----------|------------------------------|-------|
| **Matchroom** | DAZN globally + Foxtel in AU | 5-yr extension to 2031, 30+ shows/yr. Foxtel 8-show deal for 2026. |
| **Golden Boy** | DAZN exclusive (multi-yr extension Mar 2026) | Long-term deal restored after brief gap end of 2025 |
| **Top Rank** | **DAZN** (NOT ESPN — major change) | ESPN deal expired July 2025. New DAZN deal: 8–10 dates/yr. |
| **The Ring / Riyadh Season** | DAZN (no longer PPV; included in subscription as of Nov 2025) | Major change — was PPV pre-Nov 2025 |
| **MVP (Most Valuable Promotions)** | **Per-event** — Netflix for marquee cards (e.g. Rousey vs Carano May 16), DAZN for development cards, Sky Sports UK | Manual entry required per card |
| **BKFC** | DAZN (3-yr deal, Oct 2024 → 2027) globally | 24 events/yr |

**MVP Netflix card May 16, 2026** (Ronda Rousey vs Gina Carano): exclusively on Netflix globally.

---

## ONE Championship

- **US + Canada:** Prime Video (multi-year deal, 2026 schedule announced Dec 2025)
- All Fight Nights branded "ONE on Prime Video"
- 12 events on Prime + numbered events (ONE 174 Apr 3, ONE 175 Apr 29 Tokyo)

---

## PFL

| Region | Broadcaster | Notes |
|--------|-------------|-------|
| US | ESPN+ (deal expiring 2026 — flag) | PFL CEO actively shopping new US deal |
| UK / Ireland / Spain / + 53 markets | DAZN | Exclusive |
| DACH (Germany, AT, CH, LI, LU) | DAZN DACH | Extended |
| New Zealand | Sky NZ | New 2026 deal — all 16 PFL Global events |

---

## Karate Combat

- Free worldwide: YouTube + karate.com (primary)
- Also on: CBS Sports, Eurosport, UFC Fight Pass, FITE, Pluto TV, Roku
- Default: `youtube` channel, FREE tier, all regions

---

## RAF (Real American Freestyle Wrestling) — CORRECTION

- **NOT YouTube as design doc assumed.**
- **Fox Nation** (subscription) — exclusive broadcast rights, extended Jan 2026
- Tier: SUBSCRIPTION (Fox Nation paid)

---

## Dirty Boxing Championship — CORRECTION

- **NOT DAZN as design doc assumed.**
- **YouTube** (free) — DBX YouTube channel, confirmed for DBX6 Apr 10, 2026
- Tier: FREE

---

## RIZIN

| Region | Broadcaster | Tier |
|--------|-------------|------|
| US | FITE by Triller (PPV) | PPV |
| Global PPV | Rizin.tv | PPV |
| Japan | RIZIN Confession + WOWOW | mixed |

---

## Oktagon MMA

- Worldwide: Oktagon.TV
- DAZN added in many markets (UK, US, EU) for select cards (started Mar 2024 with Oktagon 40)
- DAZN does NOT cover: Czech Republic, Slovakia, DACH (those stay on local broadcasters + Oktagon.TV)

---

## Channels to add to seed

Need to add these to `seed-broadcast-channels.ts`:

| slug | name | reason |
|------|------|--------|
| `fox-nation` | Fox Nation | RAF |
| `sportsnet` | Sportsnet | UFC Canada (current) |
| `tva-sports` | TVA Sports | UFC Canada French |
| `foxtel` | Foxtel | Matchroom Australia |
| `fite-triller` | FITE by Triller | RIZIN US PPV |
| `rizin-tv` | RIZIN.TV | RIZIN PPV global |
| `sky-sports` | Sky Sports (UK) | MVP UK |
| `wowow` | WOWOW | RIZIN Japan |
| `sky-sport-nz` | Sky Sport (NZ) | already added — PFL NZ + UFC NZ |
| `tsn-plus` | TSN+ | already added but Sportsnet now has UFC Canada — TSN+ may be unused for UFC |
| `cbs` | CBS | UFC + Zuffa Boxing free OTA simulcasts |
| `dazn-dach` | DAZN DACH | PFL Germany region |

Removable / lower priority: `tnt-sports` (UFC UK losing it to Paramount), `tnt-sports-box-office` (PPV model dying), `main-event` (UFC AU losing it to Paramount).

---

## Sources

- [Paramount/TKO UFC 7-yr $7.7B deal](https://www.paramount.com/press/paramount-and-tko-announce-historic-ufc-media-rights-agreement)
- [Paramount expands UFC to LatAm + Australia](https://www.cbssports.com/ufc/news/paramount-expands-ufc-broadcast-deal-with-multi-territory-expansion-into-latin-america-and-australia/)
- [Paramount+ UFC schedule 2026](https://www.paramountplus.com/sneak-peak/ufc-schedule-2026/)
- [UFC 328 viewing guide](https://www.antennaland.com/how-to-watch-ufc-without-cable/)
- [UFC UK Paramount takeover](https://britbrief.co.uk/sports/football/ufc-signs-paramount-as-new-uk-broadcaster-from-2026.html)
- [UFC Canada uncertain](https://dailyhive.com/vancouver/ufc-fans-in-canada-no-longer-ppv)
- [Zuffa Boxing Paramount US/CA/LatAm](https://www.paramount.com/press/paramount-announces-landmark-media-rights-agreement-with-zuffa-boxing)
- [ONE on Prime Video 2026 schedule](https://cagesidepress.com/2025/12/10/one-championship-announces-full-prime-video-2026-schedule-additional-events/)
- [PFL DAZN Europe + Sky NZ](https://dazngroup.com/press-room/pfl-and-dazn-announce-historic-media-rights-partnership-for-europe/)
- [BKFC DAZN multi-yr deal](https://www.bkfc.com/news/bkfc-dazn-announce-groundbreaking-broadcast-partnership:c4046951-b013-4db0-a25f-bf4490e9cdf0)
- [Top Rank → DAZN 2026](https://fightnews.com/top-rank-dazn-reach-broadcast-deal/184276)
- [Matchroom DAZN to 2031](https://sports.yahoo.com/boxing/article/eddie-hearns-matchroom-inks-5-year-extension-to-media-rights-deal-with-dazn-175729242.html)
- [Golden Boy DAZN extension Mar 2026](https://www.badlefthook.com/boxing-news/113910/golden-boy-extends-broadcasting-deal-with-dazn-boxing-news-2026)
- [The Ring/Riyadh on DAZN no PPV](https://www.ringmagazine.com/news/turki-alalshikh-announces-riyadh-season-the-ring-shows-no-longer-on-ppv--available-to-dazn-subscribers-2PpiKuxVS3cOYD16VJnd2Z)
- [MVP Rousey/Carano Netflix May 16](https://www.mostvaluablepromotions.com/most-valuable-promotions-brings-professional-mma-to-netflix-with-ronda-rousey-vs-gina-carano-on-saturday-may-16-2026/)
- [Oktagon DAZN deal](https://www.dazn.com/en-US/news/mma/oktagon-mma-sign-broadcasting-deal-with-global-platform-dazn/gesmb7iefcu1nv1icgv33fbz)
- [RAF Fox Nation extended](https://press.foxnews.com/2026/01/fox-nation-extends-partnership-with-real-american-freestyle-in-new-long-term-deal)
- [Dirty Boxing on YouTube free](https://fightnews.com/dirty-boxing-championship-virtual-press-conference/185449)
- [RIZIN US on FITE/Triller](https://flavor365.com/rizin-live-stream-ppv-your-ultimate-viewing-guide/)
