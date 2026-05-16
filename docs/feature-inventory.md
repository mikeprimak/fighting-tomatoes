# Feature Inventory — Source of Truth

**Purpose:** Single canonical list of every feature that exists, partially exists, was built and abandoned, or was discussed and dropped — across mobile, web, and backend.

**Started:** 2026-05-15
**Maintainer:** updated during walkthroughs and at the end of any session that ships or kills a feature.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Shipped, active, matches spec |
| 🟡 | Partial / WIP / known gaps |
| ❌ | Not built on this surface |
| 🗑️ | Built then abandoned (code/schema may remain but UI gone or disabled) |
| ➖ | Decided out for this surface (won't build) |
| ❓ | Status unknown — needs walkthrough confirmation |

Mobile / Web columns are independent. Backend column is "is the API ready?" — relevant for features that can't ship on a surface without it.

---

## Auth

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Email/password register | ✅ | ❓ | ✅ | `/register` |
| Email/password login | ✅ | ❓ | ✅ | `/login` |
| Logout | ✅ | ❓ | ✅ | |
| Email verification | ✅ | ❓ | ✅ | `/verify-email` |
| Forgot password → reset | ✅ | ❓ | ✅ | `/forgot-password`, `/reset-password` |
| Google Sign-In | ✅ | ✅ | ✅ | Web tested 2026-05-14. Split GCP project setup — see `docs/decisions/0002`. |
| Apple Sign-In | ✅ | ✅ | ✅ | Web tested 2026-05-14 (Hide My Email path). Services ID `app.goodfights.web`. |
| Continue as guest / anon browse | ✅ | ❓ | n/a | |
| Claim legacy account | ✅ | ❓ | ✅ | `/claim-account` |
| Delete account | ✅ | ❓ | ✅ | `/delete-account` |

---

## Browse — Events

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Upcoming events list | ✅ | 🟡 | ✅ | Web: visual layout done 2026-05-14, interactions untested |
| Live events list (auto-refresh) | ✅ | ❓ | ✅ | Web: card structure rebuilt but Live tab not visually QA'd (no fights live at session time) |
| Past events list | ✅ | ❓ | ✅ | |
| Event detail (card sections, fights grouped) | ✅ | ❓ | ✅ | |
| Event banner image | ✅ | ✅ | ✅ | Web aspect-ratio dropped 2026-05-14 |
| Org filter pills (UFC/ONE/PFL/etc.) | ✅ | ✅ | ✅ | Web wraps instead of horizontal scroll |
| Section-aware broadcasts on event | ✅ | ❌ | ✅ | "How to Watch" widget not ported to web |

---

## Browse — Fights

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Top Fights (ranked, time-period filter) | ✅ | ❓ | ✅ | `/fights/top` exists on web |
| Good Fights ranking | ✅ | ❓ | ✅ | What's the URL on web? appears bundled into home or top fights |
| Fight of the Night | ❓ | ❓ | ✅ | Route `/fight-of-the-night` exists on web — confirm purpose |
| Fight detail — upcoming | ✅ | ❓ | ✅ | `/fights/[id]` (web) |
| Fight detail — completed | ✅ | ❓ | ✅ | Same route |
| Fight detail — live (in progress) | ✅ | ❓ | ✅ | Same route, in-progress state |

---

## Browse — Fighters

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Fighter detail page (bio, history) | ✅ | ❓ | ✅ | `/fighters/[id]` |
| Fighter follow button on detail page | ✅ | ❓ | ✅ | Follow workstream is rebuilding the button — see `docs/areas/follow-fighter.md` |
| Fighter history list (past fights) | ✅ | ❓ | ✅ | |
| Fighter image | ✅ | ❓ | ✅ | |

---

## Engagement — Upcoming Fights

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Hype score (1-10 flame) | ✅ | ❓ | ✅ | `HypeFightModal` on web |
| Hype distribution chart | ✅ | ❓ | ✅ | Mobile: shipped. Web: present? |
| Hype community modal (post-vote reveal) | 🟡 | ❌ | ✅ | Mobile: coded on `feat/hype-community-modal`, NOT MERGED — width bug unresolved (see daily 2026-05-15) |
| Pre-fight comments | ✅ | ❓ | ✅ | |
| Comment upvotes | ✅ | ❓ | ✅ | |
| Predict winner | 🗑️ | 🗑️ | ✅ (schema only) | Removed from UI; schema retained. Memory: `project_predictions_tags_removed.md` |
| Predict method | 🗑️ | 🗑️ | ✅ (schema only) | Same — removed from UI |
| Predicted rating (hype) | ✅ | ❓ | ✅ | This IS the hype score — the only "prediction" still active |

---

## Engagement — Completed Fights

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Rate fight (1-10 stars) | ✅ | ❓ | ✅ | `RateFightModal` on web |
| Review text | ✅ | ❓ | ✅ | |
| Tags on rating | 🗑️ | 🗑️ | ✅ (schema only) | Removed from UI 2026 |
| Review upvotes | ✅ | ❓ | ✅ | |
| User pick check/× indicator | ✅ | ✅ | ✅ | Web shipped 2026-05-14 with CompletedFightCard rebuild |
| Spoiler-free awareness on cards | ✅ | ✅ | n/a | Web: card supports it; UI toggle to enable it on web is missing |

---

## Discovery

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Search (fighters, fights, events) | ✅ | ❓ | ✅ | `/search` |
| Search by org filter | ❓ | ❓ | ❓ | |
| "Fighting this weekend you don't follow" carousel | ❌ | ❌ | ❌ | Planned in follow-fighter Wave 2 |
| Top-followed fighters discovery | ✅ | ❌ | ✅ | Mobile shipped 2026-05-01 |

---

## Follow Fighters

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Follow button — fighter detail page | ✅ | ❓ | ✅ | Active everywhere on mobile |
| Follow button — hype modal "+" | ✅ | ❌ | ✅ | Mobile only; web hype modal lacks the + |
| Follow button — rating/completed modal "+" | ✅ | ❌ | ✅ | Mobile only |
| Followed fighters list page | ✅ | ❓ | ✅ | `/followed-fighters` |
| "Following" entry on Profile | ✅ | ❓ | ✅ | Mobile shipped 2026-05-01 |
| Onboarding follow picker | ❌ | ❌ | ✅ | Planned, Wave 2 first ship — awaiting design Q1-Q6 answers |
| Post-rating "follow the winner?" prompt | ❌ | ❌ | ✅ | Planned, Wave 2 |
| Universal `FollowButton` component | ❌ | ❌ | n/a | Foundation work for Wave 2; replaces ad-hoc "+" buttons |
| Engagement tracking on follows | 🟡 | ❌ | 🟡 | `FollowSource` field + `FollowNotificationEvent` table — schema pending |

---

## Profile / Activity

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Profile page (stats) | ✅ | ❓ | ✅ | |
| Edit profile (display name) | ✅ | ❓ | ✅ | |
| Avatar upload | ✅ | ❓ | ✅ | |
| Activity hub (ratings, reviews, hypes) | ✅ | ❓ | ✅ | `/activity` |
| Activity filters (all / reviewed / tagged / etc.) | ✅ | ❓ | ✅ | Mobile has filter chips |
| Activity sort | ✅ | ❓ | ✅ | |
| Spoiler-Free mode toggle | ✅ | ❌ | n/a | Web: `SpoilerFreeContext` exists, no UI on Edit Profile, no persistence |
| Settings page | ✅ | ❌ | n/a | Mobile has `/settings` + `/advanced-settings` — no equivalent on web |

---

## How to Watch

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| "How to Watch" widget on event page | ✅ | ❌ | ✅ | Backend `/api/broadcasts` ready |
| "How to Watch" widget on fight page | ✅ | ❌ | ✅ | |
| Section-aware (main card vs prelims) | ✅ | ❌ | ✅ | Shipped 2026-05-11 on mobile |
| Per-country defaults | ✅ | ❌ | ✅ | |
| Auto-generated "How to Watch X in Y" SEO pages | n/a | ❌ | ✅ | ~194-page content engine planned for web. Depends on custom domain. |
| Country-specific EU broadcasters (beyond DACH default) | ❌ | ❌ | ❌ | Deferred future project (`project_eu_country_broadcasters.md`) |

---

## Notifications

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Push notifications infra (FCM/APNs) | ✅ | ➖ | ✅ | Web push decided out 2026-05-14 |
| Walkout warning (~10 min pre-fight) | ✅ | ➖ | ✅ | Shipped, currently the only active push lane for followed fighters |
| Section-start fallback (non-tracker cards) | ✅ | ➖ | ✅ | Shipped 2026-05-02 |
| Morning digest | ❌ | ➖ | ❌ | v2 plan, lane 1 — locked 2026-05-01, not built |
| Booked / scratched notifications | 🟡 | ➖ | 🟡 | v2 plan, lane 3 — sync side shipped, SEND side not built |
| Next-day rate prompt | ❌ | ➖ | ❌ | v2 plan, lane 4 |
| Per-fight result | 🗑️ | ➖ | 🗑️ | Lane DROPPED — spoilers risk too high |
| In-app notification feed | ❓ | ❓ | ❓ | Unsure if mobile has an inbox screen |
| Notification preferences UI | ❓ | ❓ | ❓ | Confirm where user toggles lanes |

---

## Rewarding Users (closure / payoff / identity)

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Hype Community Modal (post-vote reveal) | 🟡 | ❌ | ✅ | See Engagement — width bug holding the branch |
| Hype accuracy stats (community-minus-self) | ❌ | ❌ | ❌ | Closure loop, Wave 2 — depends on AI enrichment Phase 1 |
| Fan DNA personality engine | ❌ | ❌ | ❌ | Future, depends on `aiTags` (AI enrichment Phase 1). Renamed from "Hype DNA" 2026-05-16. |
| "Past actions paying off" surfacing | ❌ | ❌ | ❌ | Wave 2 |
| Private user stats / Letterboxd-style identity | ❌ | ❌ | ❌ | Wave 2+ |
| Four-favorite fighters | ❌ | ❌ | ❌ | Wave 2+ |
| Calendar export (iCal) | ❌ | ❌ | ❌ | Backlog |

---

## AI Enrichment

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Broadcast discovery (Brave + Haiku) | n/a | n/a | ✅ | Shipped 2026-05-11 (section-aware) |
| Fight preview enrichment (Phase 1) | ❌ | ❌ | ❌ | Decision pending — pipeline before or after closure loop? |
| `aiTags` on fights | ❌ | ❌ | ❌ | Phase 1 deliverable |
| Fan DNA inputs | n/a | n/a | ❌ | Depends on Phase 1 |

---

## Marketing / Acquisition Infra (background to product)

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| PostHog product analytics | 🟡 | ❌ | n/a | Wired 2026-05-14, activates next EAS build. Web SDK ~June |
| Sentry error tracking | ✅ | ❓ | n/a | |
| UTM landing → install referrer forwarding | n/a | ✅ | n/a | `packages/landing/attribution.js` 2026-05-14 |
| Legacy redirect UTM tagging | n/a | ✅ | n/a | fightingtomatoes.com → goodfights.app shipped 2026-05-14 |

---

## Footer / Legal / Support

| Feature | Mobile | Web | Backend | Notes |
|---|---|---|---|---|
| Privacy page | ✅ | ❓ | n/a | `/privacy` |
| Delete account page | ✅ | ❓ | n/a | `/delete-account` |
| Send feedback | ✅ | ❓ | ✅ | `/feedback` |
| Resend verification | ✅ | ❓ | ✅ | mobile route present; web equivalent? |
| Legacy account claim | ✅ | ❓ | ✅ | `/claim-account` on web |

---

## Abandoned / Removed

These were built or partially built and explicitly retired. Keep listed so we don't accidentally revive them or forget code is dead.

| Feature | Status | Notes |
|---|---|---|
| Crews | 🗑️ | Mobile screen `app/crew` exists; not in user flow. Decided out on web. |
| News tab | 🗑️ | Mobile screen `(tabs)/news.tsx` exists; not in user flow. |
| Community tab | 🗑️ | Mobile screen `(tabs)/community.tsx` exists; not in user flow. |
| Public predictions community | 🗑️ | Predicted winner / method removed from UI. Schema retained. |
| Tags on completed fights | 🗑️ | Removed from UI. Schema retained. |
| Hype seeding bots | 🗑️ | Bot predictions disabled 2026-03-30. Data still in DB. |
| `Event.totalRatings` aggregate field | 🗑️ | Never written. Dead field. Don't query for metrics. |
| Web push notifications | ➖ | Decided out 2026-05-14. |
| Per-fight result push lane | ➖ | Dropped from notification v2 plan 2026-05-01. |

---

## Dev / Marketing Tools (not user-facing)

| Tool | Surface | Notes |
|---|---|---|
| Admin panel | `<backend>/admin.html` | Fight controls, set-status, publish |
| Weekly Hype generator | Web `/weekly-hype` | Generates branded data graphic for social posts |
| Seed Admin tool | Web `/seed-admin` | Confirm purpose during walkthrough |

---

## Walkthrough log

Track which screens have been walked and confirmed. Replace ❓ in the tables above with ✅/🟡/❌ as we go.

| Screen | Date walked | Outcome |
|---|---|---|
| _(start here)_ | | |
