# Ongoing Maintenance Tasks

A living checklist of recurring tasks the app operator (Mike) is responsible for. Organized by cadence. **Any new ongoing/recurring maintenance task discovered in any session must be added here** (rule lives in `CLAUDE.md` Important Rules).

This is NOT a one-off task list — anything that needs to happen on a schedule lives here. One-offs go in daily docs or area docs.

---

## Daily

*(nothing yet — all daily work is automated cron jobs)*

## Weekly

### Fan DNA — Layer 2 (LLM-generated) sample review
- **What:** Pull 50 randomly-sampled Layer 2 outputs from the past week. Check for tonal drift, banned-word leaks, fighter-punch-down, broken sentence structure, hallucinated facts.
- **Why:** LLM generation drifts silently — every output reads fine in isolation, but the system-wide distribution can shift off-brand over weeks.
- **Time:** ~30 min.
- **Output:** Refine the system prompt + banned-words list if needed. Promote best lines to Layer 1 canned pool.
- **Blocked until:** Fan DNA engine ships (Wave 3 in `docs/areas/rewarding-users.md`).

### Marketing — attribution + spend review
- **What:** Read PostHog funnel (install → first-open → first-rating) for the prior week, cross-reference against UTM-tagged channels.
- **Why:** Per the AI Marketing Plan, every spend needs a yes/no answer on whether it produced signal. Required to keep `$100/mo` budget honest.
- **Time:** ~20 min.
- **Output:** Weekly attribution brief; spend decisions for the coming week.
- **Blocked until:** PostHog activates on next EAS production build + attribution spine documented.

### Marketing — Twitter Hype Index post
- **What:** Generate the weekly Hype Index card from `/weekly-hype` tool, post on @GoodFightsApp with UTM-tagged link to `goodfights.app`.
- **Why:** Cadence of the AI Marketing Plan's System 2. Repeatability is the point.
- **Time:** ~45 min including image gen + caption iteration.
- **Output:** One tweet per week, individual `utm_content` per post for per-tweet attribution.

## Monthly

### AI enrichment — cost + coverage audit
- **What:** Check actuals against the `<$300/year` ceiling. Verify coverage on the past month's cards (how many fights got `aiPreviewShort` populated, average confidence, missing-source events).
- **Why:** Cost can creep silently if cron mis-fires or sources change shape. Coverage gaps mean users see empty cards.
- **Time:** ~15 min.
- **Output:** Note in `docs/areas/ai-enrichment.md` Status section if actuals drift.
- **Blocked until:** AI enrichment cron ships.

### Scraper health audit
- **What:** Review the admin health widget for the per-org retroactive-results system. Confirm UFC, Tapology-based scrapers (Zuffa, KC, DBX, PFL, RIZIN, ONE, Matchroom, Oktagon, BKFC) are still completing their daily runs and not throwing structural errors.
- **Why:** Source sites change layout regularly. Silent scraper failures cause stale event data, which cascades into bad live tracking and notification firing.
- **Time:** ~10 min.
- **Output:** GitHub issue or daily doc entry if any scraper has been failing > 3 days.

### Sector Swell Monitor brief
- **What:** Run the (planned) monthly automated briefing on combat sports M&A activity, broadcaster shifts, fighter contract news. Read brief, decide whether to advance the acquisition conversation.
- **Why:** Per `project_sector_swell_monitor.md` memory — sale timing depends on hitting a sector upswell, which requires monitoring.
- **Time:** ~20 min reading.
- **Blocked until:** Swell monitor build ships (~6-8hr build pending).

### App store review / rating sweep
- **What:** Read all new Play Store + App Store reviews. Reply where appropriate. Note recurring complaints.
- **Why:** Reviews are the only direct user-feedback channel; recurring complaints predict churn.
- **Time:** ~15 min.

## Quarterly

### Fan DNA — new trait additions
- **What:** Add 3-5 new traits to the registry. Mix tiers — some Tier 1 (existing signals), some Tier 2/3 once those data sources are live.
- **Why:** The DNA system feels alive only if it grows. Static trait inventory = users hit ceiling and stop being surprised.
- **Time:** ~3-4 hr per quarter.
- **Output:** New trait registry entries + canned copy + humor variants + few-shot examples for Layer 2 prompt.
- **Blocked until:** Fan DNA engine ships.

### Fan DNA — humor pool refresh
- **What:** Audit canned humor pools per trait. Retire lines that performed poorly (low engagement after surfacing) or feel dated. Add 5-10 new lines per trait family.
- **Why:** Even with Layer 2 freshness, canned pools wear out. Quarterly injection keeps the voice from calcifying.
- **Time:** ~2 hr.
- **Blocked until:** Fan DNA engine has ≥ 3 months of engagement data.

### Dependency + security update sweep
- **What:** `pnpm outdated` across all packages, review Dependabot alerts on GitHub, update Expo SDK if a new release exists.
- **Why:** Security patches + Expo SDK alignment with EAS Build versions.
- **Time:** ~2-4 hr including testing.

### EAS Build / store version review
- **What:** Verify Play Store + App Store latest published versions match what's on `main`. Decide if a new production build is needed.
- **Why:** Drift between dev branch and stores creates support confusion and missed analytics activation (PostHog SDK, new native modules).
- **Time:** ~15 min review + ~30 min for a production build if needed.

## As-needed (event-triggered)

### Pre-event marketing prep (per major card)
- **What:** Per the 90-day plan, prep card-specific Reddit posts + Twitter Hype Index card + paid promo (if budgeted). UTM-tag every link.
- **When:** ~7 days before any of the named target cards (UFC PPVs, Netflix events, etc.).
- **Time:** ~2 hr per card.

### Post-event marketing recap
- **What:** Read attribution data for the card (PostHog funnel, install spike vs control week baseline, per-channel breakdown). Log in daily doc.
- **When:** Monday after each major card.
- **Time:** ~30 min.

### Major card live-event monitoring
- **What:** Watch eventLifecycle + live tracker logs during the card. Manually intervene if a scraper falls behind or a fight's status doesn't advance.
- **When:** During every UFC PPV, major Tapology-tracked card, or named target event.
- **Time:** Passive monitoring; ~10 min hands-on if intervention needed.

---

## How to add to this doc

When you discover a new recurring/ongoing maintenance need in any session, add it under the appropriate cadence section with:
- **What** (one sentence)
- **Why** (one sentence — the failure mode if skipped)
- **Time** (rough estimate per occurrence)
- **Blocked until** (only if the task depends on something not yet shipped)

Don't add one-off tasks here — those belong in daily docs or area docs. The bar for this doc is "this thing needs to happen forever, on a schedule, or the system degrades."
