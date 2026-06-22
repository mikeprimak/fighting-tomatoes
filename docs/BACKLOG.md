# Good Fights — Master Backlog

**Created:** 2026-06-21 · **Owner:** Mike · **Status:** living doc

This is the single running list of everything queued. Each item has an **effort tag**, a **status** (grounded by a 2026-06-21 codebase audit), and notes. Check items off as they ship and log the work in `docs/daily/`.

**Effort tags:** `S` = under ~1hr · `M` = one session · `L` = multi-session · `XL` = multi-week / big feature
**Status:** `🟢 ready` (scoped, just do it) · `🟡 needs design` (decision/brainstorm first) · `🔵 needs Mike` (external/asset/decision blocker) · `⚪ idea` (not committed)

---

## ⭐ How to approach this (read first)

The list is ~70 items. Don't go top-to-bottom — that thrashes between contexts. Instead work in **themed batches** so you stay in one mental area and one part of the code per session. Recommended order is in **§ Sequencing** at the bottom. The single most leveraged cluster is **Notifications** (a half-built system with an orphaned DB table) — fixing it well moves retention more than anything else here.

Keep the **User-Focused Pivot** work in its own branch/folder (`C:\Users\avoca\fight-mobile-app-pivot`, branch `claude/user-focused-pivot-l8l6mg`) — never mix it into main-branch sessions.

---

## 1. Quick wins (high impact ÷ low effort — do these first)

These are scoped, isolated, and mostly `S`/`M`. Knock them out in one or two sessions to clear noise.

- [x] `S` 🔵 **Admin alert email** → DONE by Mike (Render env var `ADMIN_ALERT_EMAIL` → `contact@goodfights.app`).
- [x] `S` 🟢 **Roundtree Jr. name parse bug** → DONE on branch `backlog/round-1-quick-wins`. Root cause: `scrapeAllUFCData.js:174` built the event title via `.split(' ').pop()` (grabs the "Jr." suffix). Replaced with a suffix-aware surname helper (keeps "Rountree Jr."). `parseFighterName()` was already correct. **Follow-up: one-off DB rename** of the existing "UFC Fight Night Ankalaev vs. Jr." row + audit matchroom/tapology live parsers that use the same `.pop()` for winner-matching.
- [x] `S` 🟢 **Event descriptions too long** → DONE. `extractFightEnrichment.ts` SYSTEM_PROMPT now: exactly ONE sentence (~15-25 words) + hard "never mention venue/city/country" rule (per Mike — stick to fighter style + storylines). New events pick it up; optionally re-run enrichment on recent ones.
- [x] `S` 🟢 **Fighter "About" → collapse behind "see more"** → DONE on mobile (`app/fighter/[id].tsx`, tldr visible + See more/less toggle) and web (`FighterDetailClient.tsx`, native `<details>` so the body stays in the DOM for SEO).
- [x] `S` 🟢 **Home screen copy** → DONE. (a) follow explainer added as the "Most Followed" section subtitle; (b) "Top Comments" → "Comments on recent fights".
- [x] `M` 🟢 **Remove redundant "…" menu** → DONE (2026-06-22, merge `f46c5d25`) together with the §3 rating/hype item. `FightDetailsMenu.tsx` deleted; its fighter/event links + weight-class/date were already on the detail screen.
- [ ] `S` 🟢 **Admin: confirm scraper health** → MVP/Gamebred/Dirty Boxing were fixed 2026-06-17/18 (DataImpulse proxy + CapSolver). Karate Combat, Top Rank, Golden Boy, Gold Star are still on the dead Scrapfly path — verify each ran recently; apply the same 1-line `tapologyBrowser.js` swap if any are failing.

---

## 2. Notifications (the highest-leverage cluster)

**Audit finding:** A `UserNotification` table already exists in the schema (`schema.prisma:1084-1117`) **but is orphaned** — nothing writes to it, no API reads it, no screen shows it. Notifications are pushed via Expo and forgotten. Defaults are all-on. Aggregation is per-event only. Permission-check-on-enable already exists and is well done.

- [x] `L` 🟢 **Notification Center (in-app history)** → DONE on branch `backlog/round-2-notifications`. (1) `sendPushNotifications` persists a `UserNotification` row per recipient when `payload.persist` is set; opted in at follow-fighter lanes (booked/3-day/morning), walkout, section-start. (2) `GET /api/notifications` (last 7d + unreadCount), `GET /unread-count`, `POST /mark-read`. (3) `app/notifications.tsx` screen + envelope icon w/ unread badge in `TabBar` (between search + profile) + a Profile row.
- [x] `M` 🟢 **Reduce default notifications; default = walkouts only** → DONE. `schema.prisma` defaults for booked/3-day/morning flipped to `false` (walkout stays `true`) via `ALTER COLUMN SET DEFAULT` migration — new signups only, existing users untouched.
- [ ] `M` 🟡 **Cross-event weekend aggregation** → **DEFERRED (needs design).** Today each event sends its own "N fighters fighting this weekend" (so UFC + RAF = two pushes — *by design*, in `followFighterNotifications.ts:472`). Add a cross-event weekend digest that rolls all of a user's followed fighters across the weekend into ONE message. Needs a small design decision (digest cadence vs per-event fallback — see `followup_notif_double_fire_suppression`).
- [ ] `M` 🟢 **"Casual / Big Events Only" tier** → **DEFERRED.** No tier exists today. Add a preset that maps to rule conditions (e.g. only numbered/PPV events, higher hype floor). Surface in settings. (Left for a follow-up — larger rule-condition work, lower urgency than the anchor.)
- [x] `M` 🟢 **Silence for 8 hours** → DONE. New `users.notificationsSnoozedUntil` column; `sendPushNotifications` excludes future-snoozed users centrally; `POST /api/notifications/snooze {hours}` (0 clears); snooze bar on the Notifications screen.
- [x] `S` 🟢 **Permission-off warning when enabling a fight notif** → VERIFIED, no change needed. The only ACTIVE enable surfaces (live-fight follow in `LiveFightCard`, fighter follow in `FollowFighterButton`) both call `ensurePushPermissionAfterAction`. The upcoming-fight bell is a disabled indicator and the `FightDetailsMenu` notify toggle is `false &&`-gated, so there's no uncovered surface.
- [x] `S` 🟢 **Remove the hidden toggles** → DONE. Deleted `notifyHypedFights` + `notifyPreEventReport` from the preferences schema/API + `manageHypedFightsRule` helper + mobile `settings.tsx` dead state. Pre-event-report send path + rules left intact; no prod data mutated.

## 3. Mobile app polish

- [x] `S` 🟢 **Android notification tray icon** → DONE (2026-06-22, `f112c5c1`). **Root cause of the "switched back" mystery:** the bare `android/` dir ships committed `drawable-*/notification_icon.png` that override `app.json`'s `expo-notifications` icon (prebuild only regenerates them; a bare-`android` eas build skips prebuild). Old drawables + managed asset were a 227KB full raster → Android masks it to a white blob. Regenerated all 5 density drawables **and** the 96px managed asset from Mike's `THICKER-GOOD-FIGHTS-LOGO-WHITE-ALPHA.png` (trimmed + ~86% fill) via sharp, so both the committed-drawable and prebuild paths now yield the white glove. **Needs a new Android build to reach users** (native drawables aren't OTA-able).
- [x] `M` 🟢 **Profile image on mobile = MISSING** → DONE (2026-06-22, merge `d478af67`). Added avatar picker UI to `app/edit-profile.tsx` (expo-image-picker, already in the native build → OTA-safe), upload → `updateProfile({avatar})` → refresh. **Also fixed the root cause for web:** `/upload/profile-image` was writing to Render's ephemeral disk + returning a RELATIVE url (resolved against goodfights.app → 404) — now uploads to R2 and returns an absolute url.
- [x] `M` 🟢 **Put rating/hype/prediction on the fight detail screen** → DONE (2026-06-22, merge `f46c5d25`). Mike was right — `handleHypeSelection` existed but was wired to no UI, so the detail screen showed only crowd stats. Added a **"Your Hype"** card (Upcoming) / **"Your Rating"** card (Completed) showing the user's value (or a prompt), tapping opens `UpcomingFightModal`/`CompletedFightModal` in place (invalidates `['fight', id]` on close to refresh). Hid the modals' "See Comments" link when opened from the detail screen (`hideSeeComments` prop) so it doesn't stack another copy. **Removed the redundant "…" `FightDetailsMenu`** (header trigger + both render sites + deleted the 399-line component; fighter/event/weight-class/date are all already on-screen). Mobile-only OTA; not device-tested yet.
- [ ] `S` 🟢 **Test biometric login** → shipped 2026-06-01 but never device-tested. Needs a real device + the native build.

## 4. Web app

- [x] `M` 🟢 **Profile image broken on web "Edit Profile"** → DONE (2026-06-22, merge `d478af67`). Root cause exactly as suspected: the endpoint returned a relative `/uploads/...` URL that resolved against goodfights.app (404), AND the page never persisted the avatar (only in-memory `setUser`). Fixed at the backend (R2 + absolute URL) + web now persists via `updateProfile({avatar})` + uploading spinner.
- [x] `M` 🟢 **Live tab auto-update (web)** → DONE (2026-06-22). `events/live/page.tsx` polled `['events','live']` at a flat 60s. Made `refetchInterval` a function: **15s while any event is live** (matches event-detail's live cadence so results/up-next refresh without reload), **60s otherwise** (no backend hammering when nothing's on). Cards re-render automatically — `EventCard`/`FightSectionList` render from the polled `data.events` props.

## 5. Search

- [ ] `M` 🟢 **Typeahead / predictive search** → both platforms are search-on-submit, no debounce, no suggestions. Add a debounced typeahead dropdown (fighters/events/fights) on web `Navbar.tsx` + mobile `SearchBar.tsx`, reusing the existing `/search` endpoint (may need a lightweight `limit`-capped suggest mode).
- [ ] `S` 🟢 **General search QA** → people actually use search; do a pass on relevance/ranking on both platforms.

## 6. Scrapers & data

- [ ] `M` 🟡 **Scrapers should capture odds** → `fighter1Odds`/`fighter2Odds` fields exist on `Fight` (`schema.prisma:540`) but no daily scraper populates them. A blog-only odds system exists (`scripts/odds/` + The Odds API). Decide: wire The Odds API consensus into daily ingestion to populate fight odds app-wide. (Feeds the "scrapers get odds" + future odds-on-card UI.)
- [ ] `M` 🟢 **Broadcast: not all MVP events are Netflix** → MVP has per-event seeds (`seed-mvp-broadcasts.ts`) but no region defaults; some events wrongly read Netflix. Add correct per-event / `PromotionBroadcastDefault` rows.
- [ ] `S` 🟢 **RAF broadcast channel** → add `PromotionBroadcastDefault`: YouTube (CA) + Fox Nation (US). Channels already seeded.
- [ ] `M` 🟡 **Broadcast discovery: auto-accept, no manual review** → **Mike: kill the manual-review step.** Today `broadcastDiscovery/run.ts` surfaces NEW/CHANGED findings for admin triage. Redesign so high-confidence findings (above a tuned confidence threshold) are written directly to `PromotionBroadcastDefault` with no human in the loop; only low-confidence ones (if any) queue for review. Pick the threshold conservatively to avoid bad auto-writes.
- [ ] `M` 🟡 **Harden the other 12 unguarded importers** → DBC fixed 2026-06-21 (false-alarm ENOENT page when a promotion has no events). Same unguarded `fs.readFile(eventsFilePath)` exists in bkfc/mvp/gamebred/matchroom/oneFC/pfl/oktagon/goldenBoy/goldStar/rizin/topRank/ufc. karateCombat/raf/zuffa are already guarded. **Design nuance:** small Tapology promos going empty = benign (skip), but a MAJOR (UFC) suddenly scraping zero events arguably SHOULD page — so this isn't a blanket "silently skip" sweep; decide per-tier.
- [ ] `S` 🟢 **Confirm start-time AI system is live** → `startTimeDiscovery/run.ts` runs inside the daily scraper cycle (not a separate cron). Verify recent events got real first-bell times with provenance.
- [ ] `M` 🟢 **Fighter image auto-refresh on belt/status changes** → **Mike: headshots are NOT updating automatically.** After UFC Freedom 250 (Ilia & Pereira lost belts; Gaethje & Gane gained them), ufc.com now serves updated headshots, but the app still shows the old ones. Build an automated refresh that re-pulls a fighter's headshot from source within a few days of them fighting (not the quarterly backfill). Likely: on fight-completion, queue a headshot re-fetch for both fighters.

## 7. Ratings, hype & events-as-a-whole

- [ ] `L` 🟡 **Event-level hype & rating (better algo)** — Mike wants help designing this. `Event.averageRating`/`totalRatings` fields exist but the legacy avg-of-all-ratings is crude (one hot fight skews a card). **Needs a design session** — see `§ Decisions` for algo options to react to.
- [ ] `M` 🟡 **Comment section improvements:**
  - Link on a post-fight comment → user's pre-fight comment (no pre/post link exists today; `PreFightComment` and `FightReview` are separate tables).
  - New comments start self-upvoted (1, not 0) — *audit says this already happens for top-level comments* (`UpcomingFightDetailScreen.tsx:619`); verify + extend to replies if wanted.
  - Allow deleting pre-fight comments after the fight (delete logic exists; confirm it's reachable post-completion).
- [ ] `M` 🟢 **Comment edit/delete bug** → deleting on the details screen still shows in the modal; "Done" doesn't resave; re-editing opens an empty textarea. Modal vs details-screen state diverge — reproduce and fix the shared state in `UpcomingFightDetailScreen.tsx` / `CompletedFightDetailScreen.tsx`.

## 8. Back catalog / legacy data

- [ ] `L` 🟢 **Legacy event order (~hundreds)** → main-event-shows-as-first-prelim. Inversion script exists (`legacy-migration/.../sync-fight-order.js`) but it's NOT uniform (some legacy events are already correct — don't blanket-flip). Build a read-only audit first to find genuinely-inverted events, then fix only those. See `lesson_legacy_event_order_inversion`.
- [ ] `M` 🟢 **Missing UFC banner images on historic events** → audit which legacy events lack a banner, backfill from a source.

## 9. Editorial / articles / marketing content

- [ ] `M` 🔵 **Conor "Fights Rated" article** → polish, embed images properly, fix existing images, add spoiler warning.
- [ ] `L` 🔵 **Ruleset comparison infographic** → continue refinement (many `ruleset-comparison-v*` versions exist in `docs/marketing/infographics/`).
- [ ] `M` 🔵 **Conor infographic** → complete.
- [ ] `M` ⚪ **"What makes a good fight?" infographic** → finish + publish as a blog post.
- [ ] `S` ⚪ **Gaethje/Rogan article** → Mike noted "do nothing?" — likely already done. Confirm + close.
- [ ] `S` ⚪ **Article idea:** Conor's best insults of every fighter.
- [ ] `S` ⚪ **Poll idea:** favorite MMA YouTube channels.
- [ ] `L` 🟢 **Weekly Monday email recap** → community scores from the weekend, top-rated moments, biggest upsets vs pre-fight hype, week-ahead preview. Mostly auto-generated from existing data via Resend Broadcasts. High-leverage retention/marketing artifact.

## 10. Voice of the app

- [ ] `M` 🔵 **Apply voice guide** → there's a VOICE chat + a voice-guide doc on Mike's Desktop. **Mike must share both** before this can start. Then update post-rating + post-hype modals, and error/empty states.

## 11. User-Focused Pivot ⚠️ (separate branch/folder)

> Work ONLY in `C:\Users\avoca\fight-mobile-app-pivot`, branch `claude/user-focused-pivot-l8l6mg`. Dev user: `testdev+onb0612@goodfights.app` / `Testpass1!`. Never fold into main.

- [ ] `XL` 🟡 **Finish onboarding**, then surface insights/cards/home-screen.
- [ ] ⚪ Data capture: flag if a user rated **live** (within 4hr of event end).
- [ ] ⚪ Sharable card — one clear message; define user *as* a fighter type ("Grappler", not "Grappler watcher").
- [ ] ⚪ Onboarding quiz ("first fight you remember caring about?", fav fighter then/now…).
- [ ] ⚪ "Is there a fight this weekend I might like?" pattern-matching.
- [ ] ⚪ Specific fight recommendations post-onboarding ("you might like Rockhold vs Bisping because…").
- [ ] ⚪ "Watch later" list feature.

## 12. Winner prediction / "Who do you support?"

- [ ] `L` 🟡 **"WHO DO YOU SUPPORT?" feature set** → already reframed from predictions to *allegiance* (`project_rooting_for_pivot`). Work continues on branch `winner-predictions`. Comms must defuse the trained predict-reflex.

## 13. Infrastructure & technical debt

- [ ] `L` 🔵 **Offsite backup redundancy** → codebase + DB + assets (R2). Needs a plan: where (provider), cadence, restore test. Codebase is on GitHub already; DB + R2 are the real gap.
- [ ] `M` 🟢 **Remove all seed-data code** → fully delete seed data + remnants.
- [ ] `M` 🟡 **Baseline typecheck errors** → decide policy. Current gate is "0 NEW errors" over an 84-error baseline (`feedback_multi_window_release_coordination`). Worth a cleanup pass but not urgent.
- [ ] `M` 🟢 **Scheduled fighter enrichment must not overwrite good profiles** → `aiProfileSource` provenance exists (`project_fighter_profile_provenance`); ensure the cron respects it and never clobbers hand-authored/Opus bios.

## 14. Security

- [ ] `L` 🟡 **CAPTCHA / abuse prevention** → on signup + comment/rating write paths. (Vercel BotID is an option for web; mobile needs its own approach.)
- [ ] `L` 🔵 **General security audit** → scope it: auth/token handling, rate limiting, input validation, R2 bucket perms, admin-panel access. Can run the `/security-review` skill on key surfaces.

## 15. Monetization

- [ ] `M` ⚪ **Affiliate links on "How to Watch" buttons** + click tracking.

## 16. Admin panel

- [ ] `M` 🟡 **Admin deep-dive** → audit the app + admin panel, propose new controls (emergency handling, manual overrides, ops levers Mike will want at scale).

## 17. Brand / legal

- [ ] `XL` 🔵 **Canadian IP lawyer** → trademark/IP protection. External, Mike-driven.
- [ ] `M` 🔵 **App Store preview video** → ASC rejected it (wrong phone size). Re-record on a borrowed modern iPhone.

---

## Decisions needed from Mike (unblock these)

1. **Event score algo** (§7) — react to the options below.
2. **Voice guide** (§10) — share the Desktop doc + VOICE chat.
3. **Backup plan** (§13) — pick a provider/budget for offsite DB + R2.
4. **App Store video** (§17) — borrow an iPhone.
5. **IP lawyer** (§17) — external engagement.
6. **Odds in app** (§6) — confirm we want fight odds app-wide (cost: The Odds API tier), not just blog graphics.

### Event-score algo — options to react to (for §7)

The legacy "average of all fight ratings" over-weights one hot fight on an otherwise dead card. Better candidates:
- **Confidence-weighted mean** (Bayesian shrinkage): pull a card's average toward the global mean until it has enough ratings, so a 1-rating card can't top the charts.
- **Depth-aware score**: reward cards where *multiple* fights cleared a "good fight" bar (e.g. count of fights rated ≥ X), not just the single peak — captures "stacked card" feel.
- **Peak + floor blend**: `α·(best fight) + β·(median fight)` so both the headliner banger and overall quality matter.
- **Upset/surprise bonus** (past events): reward cards where results diverged from pre-fight hype.
- For **upcoming events**, "will it be good?" = aggregate *hype* with the same shrinkage, plus a stylistic-matchup signal from AI enrichment.

---

## Recommended sequencing

1. **Sprint 1 — Quick wins (§1).** One or two sessions. Clears 7 isolated items, several user-visible.
2. **Sprint 2 — Notifications (§2).** The Notification Center + default reduction + snooze. Biggest retention lever; one coherent code area.
3. **Sprint 3 — Scrapers/data correctness (§6) + back catalog audit (§8).** Batch all data-layer work together while in that headspace.
4. **Sprint 4 — Mobile/web parity polish (§3, §4, §5).** Profile image (mobile), web home live-update, typeahead.
5. **Sprint 5 — Comments + fight-detail (§7 comment items).** One UI area.
6. **Parallel track — Editorial/marketing (§9).** Interleave on fight weeks; the weekly email is the standout.
7. **Separate track — User-Focused Pivot (§11).** Its own branch/folder, never mixed in.
8. **Design-first, schedule when Mike's ready** — event-score algo (§7), voice (§10), backup (§13), security (§14), admin (§16).

Async/external (don't block dev): IP lawyer, App Store video, biometric device test.
