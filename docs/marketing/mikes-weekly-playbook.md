# Mike's Weekly Playbook — The $7M Path

**Purpose:** This is your personal standing to-do list. Pin it. Check it every Sunday. Don't recreate the plan daily — just do this.

**Target:** $7M USD acquisition by April 2027 (~12 months out from 2026-05-09).

**Three things have to be true at the same time:**
1. Lots of people use Good Fights → audience + engagement
2. Nobody else has what you have → dataset + Hype Index niche
3. Multiple buyers know you exist → buyer pipeline

This doc is organized by cadence — what to do **every week**, **every month**, **every quarter**, and **once-only this year**. Plus a small **kill list** of things to ignore so you don't drift.

---

## Every week (~2–3 hours total)

### Sunday — 30 minutes — review and plan
- Open this doc, the metrics dashboard (when it exists), and the marketing plan
- Note: which fight cards are this week and next? What's the one thing you'll do for each?
- Check the buyer pipeline doc — anyone you should follow up with this week?

### Mid-week — 30 min — Twitter Hype Index post
- Tuesday or Wednesday is the slot
- Top 5 most-anticipated fights for the upcoming weekend, by Good Fights hype score
- Or: biggest hype risers, hype-vs-public-betting-odds gaps, hype gap warnings
- 30 minutes. Don't overthink it. Consistency > polish.
- **This is the single most important recurring task on the list.** Never skip during fight weeks.

### Fight night — be present in the app
- Watch your own concurrency numbers (when PostHog is wired up)
- Respond to a few user reviews / posts in the app
- Reply to 2–3 Good Fights mentions on Twitter
- Take a screenshot of peak concurrency for the records

### After fight night — 30 min — record metrics
- Log peak concurrent users, ratings submitted during card, new signups
- File this in the daily log under a Marketing section
- These numbers become the slides in your buyer deck

---

## Every month (~4–6 hours total)

### First week of month — buyer pipeline maintenance
- Add 1 new name to the buyer landscape map (`docs/marketing/buyer-pipeline.md`)
- Find 1 warm-intro path for an existing entry (LinkedIn check, mutual connection, conference attendee, podcast guest, etc.)
- If it's month 4+ of the plan: send 1 informational outreach to a Tier 1 or Tier 2 contact

### Second week of month — content piece
- Write one "data piece" using your 10-year archive
- Examples: "10 most under-rated fights of the decade by fan score" / "How fan hype predicted (or didn't) the last 50 UFC main events" / "Which weight class has the highest average fight rating since 2016"
- Post on Twitter + your blog/landing page if you have one
- These travel further than ratings posts because they're stories, not stats

### Third week of month — pitch one written media outlet
- Bloody Elbow, MMA Fighting, The Athletic MMA, Cageside Press, MMA Junkie
- One short email per month: "I have a quantified pre-fight hype index across all major MMA promotions, plus 10 years of fan rating data. Happy to provide commentary or data for any pieces you're working on."
- This is your low-stakes media path. Written, asynchronous, you control the words.

### Fourth week of month — review and ship one feature
- Look at the metrics — what's the weakest number?
- Ship one feature that moves it. Just one.
- Examples: better onboarding, a sharing flow, a shareable rating card, a notification improvement, predictions tracking
- **Don't ship anything that isn't in service of users-engagement-revenue.** No co-watching chat. No new vertical.

---

## Every quarter (~12 hours total)

### Pitch one MMA podcast
- Heavy Hands, MMA Hour with Helwani, Brian Campbell shows, Luke Thomas, Sportsnet's various MMA shows, plus second-tier indie podcasts
- Frame: "I have data nobody else has — happy to do a 5-minute hype index segment on fight week"
- Start with smaller podcasts (under 50K downloads/episode) to practice
- Stay in your lane: dataset, hype, what fans rate. Not who you think wins fights or hot takes on fighters.
- See the "Podcast Survival Kit" section below

### Refresh dataset numbers everywhere
- Pull canonical numbers (total ratings, oldest rating, unique fights, coverage breadth)
- Update: landing page, App Store description, one-pager, Twitter bio, every place these appear
- This is how the dataset story stays loud — keep updating the numbers in public

### Review the playbook itself
- This doc is not sacred. Read it. What worked? What didn't? Adjust.
- Track: did I do the weekly Twitter post 12/13 weeks? Did I add 3 buyers to the pipeline? Did I ship one feature/month? Be honest with yourself.

---

## Once-only this year (the big bets)

### MAY/JUNE 2026 — Stand up the metrics infrastructure
- Admin acquisition-metrics dashboard (TASK 2 in handoff doc)
- PostHog instrumentation (TASK 3 in handoff doc)
- Get baseline numbers captured before UFC White House (June 15)
- These exist so you can prove the story. Without them, every conversation is hand-wave.

### JUNE 2026 — Wire affiliate IDs into broadcast deeplinks
- You've built broadcast deeplinks (DAZN, Sportsnet+, Paramount+, etc.). Most have affiliate programs.
- Apply for affiliate accounts, wire the IDs into the deeplinks. ~1 week of work.
- Realistic revenue: $500–1,500/month at 50K MAU. Pure pass-through, no user friction.

### AUGUST/SEPTEMBER 2026 — Pitch first Hype Index sponsor
- After 8+ weeks of weekly Hype Index posts, you'll have engagement data (impressions, retweets, replies)
- Target sponsors: PrizePicks, Underdog Fantasy, Stake.us, Bet365, DraftKings, MMA gear brands (Onnit, Hayabusa, Venum)
- Pitch: "Weekly Good Fights Hype Index, presented by [brand]"
- Realistic: $500–1,500 per sponsored post × 4 posts/month = $2,000–6,000/month
- **This is the revenue path that hits the $5K MRR target.** See "Revenue stack" below.

### AUGUST 2026 — Build the buyer one-pager
- Single PDF, 1 page, that captures: dataset facts, audience, growth, Hype Index, founder story, contact
- This is what you send when someone says "tell me about Good Fights" and you have 30 seconds
- Iterate it monthly after that

### SEPTEMBER 2026 — Land your first written press piece
- Bloody Elbow, MMA Fighting, or Cageside Press
- Pitch them a piece using your hype data
- One press hit signals to buyers that "Good Fights is a thing"
- This is also Twitter content for the next 6 months

### OCTOBER/NOVEMBER 2026 — First buyer informational meetings
- Aim for 3 informational calls with corp-dev / strategy people at Tier 1 or Tier 2 buyers
- DAZN, FloSports, PrizePicks, DraftKings, Stats Perform
- No pitching. "I'd love to learn how you think about fan-engagement products in MMA."
- These are *relationships*. They mature over months.

### JANUARY 2027 — Decide on M&A advisor
- By month 9 you should have data on whether you're running this yourself or engaging a boutique
- If 2+ buyers are warm and you're not getting traction yourself, hire an advisor
- 5–8% fee on a $7M deal is $350–560K. Worth it if they bring real relationships.

### MARCH/APRIL 2027 — Run a process
- If you have 2–3 warm buyers, kick off a quiet competitive process
- 100K MAU + $5K MRR + dataset story + Hype Index brand = $7M target on the table

---

## The Revenue Stack — How $5K MRR actually happens

**Original premise was wrong:** A $4.99/mo Pro tier doesn't fit the audience. MMA fans are already paying for ESPN+ ($11), UFC Fight Pass ($10), DAZN ($25), PPVs ($80+), Paramount+ ($8). They're maxed out on combat-sports subs. Asking for another monthly fee is a bad ask.

**Buyers don't care if revenue comes from users or businesses.** $5K MRR from sponsorship looks identical to $5K MRR from subscriptions on a cap table — and arguably *better*, because B2B revenue signals partner relationships that strategic buyers value.

### Primary revenue line: Sponsored Hype Index posts

The Twitter Hype Index posts will become content. Content gets sponsored. The MMA-adjacent betting and gear space is desperate to reach hardcore fans.

**Target sponsors:**
- PrizePicks — DFS, MMA is a focus vertical
- Underdog Fantasy — same
- Stake.us — sweepstakes betting, heavy MMA spend
- Bet365 / DraftKings / FanDuel sportsbooks
- Combat-sports gear brands — Onnit, Hayabusa, Venum (smaller money but easier yes)

**Pitch frame:** *"Weekly Good Fights Hype Index, presented by [brand]. Top 5 most-anticipated UFC X fights, ranked by quantified fan hype."* You include their logo + a CTA in the post.

**Pricing:** $500–1,500 per sponsored post. 4 posts/month = $2,000–6,000/month.

**When to pitch:** After 8+ weeks of consistent Hype Index posts have built an engagement track record. Targeting **August/September 2026** for first sponsor.

**Single largest revenue line. Hits the $5K target alone.**

### Secondary revenue line: Affiliate broadcast revenue

You've already built broadcast deeplinks (DAZN, Sportsnet+, Paramount+, ESPN+, etc.). Most of these have affiliate programs.

- Apply for affiliate accounts
- Wire the affiliate IDs into the existing deeplink URLs
- Every "Watch on DAZN" tap that converts pays you a commission

**Build estimate:** 1 week.
**Realistic revenue at 50K MAU:** $500–1,500/month.
**User friction:** zero — they were going to click the link anyway.

### Tertiary revenue line (optional): Supporter tier — $9.99/year

If you want a consumer revenue line at all, make it tiny, annual, and Patreon-style. Not Pro. Not unlock-features. Just *support the dev*.

- **$9.99/year** (~$0.83/mo)
- Framed as "support Good Fights" — a gesture, not a product
- What they get: a "Supporter" badge on their profile, custom themes, maybe early access to new features
- Not designed to compete with streaming subs because it isn't comparable

**Realistic numbers:** 50K MAU × 7% conversion × $10 / 12 months = ~$290/month MRR. Tiny dollars. The value is *consumer ARR exists on the cap table* — buyers like seeing both B2B and consumer revenue lines.

**Build estimate:** 1 week (RevenueCat for mobile + Stripe for web + a profile badge).

**Optional.** If it feels off-brand, skip it — sponsorship + affiliate alone is enough.

### Future revenue line (Year 2): Hype Index API licensing

The Hype Index isn't valuable to consumers (they have it free). It's valuable to **media and broadcasters** who want a "Good Fights Hype Score: 8.4/10" graphic on their fight previews.

**Targets:**
- MMA Fighting / Bloody Elbow / The Athletic — license for fight preview articles
- DAZN / ESPN+ broadcast graphics — pre-fight coverage overlay
- Betting platforms' content arms — quote Hype Index in their picks content

**Pricing:** $200–500/month per outlet. Five outlets = $1–2.5K/month.

This is a Year 2 build (need a public API + a sales motion). But it's also a hell of a brand-building lever — every "Good Fights Hype Score" badge on a third-party site is a free advertisement and a buyer-pipeline signal.

### Year 1 revenue stack — the math

| Source | Realistic monthly | Effort |
|---|---|---|
| Sponsored Hype Index posts | $2,000–6,000 | Twitter posts + 1 sponsor pitch |
| Affiliate broadcast revenue | $500–1,500 | 1 week wiring |
| Supporter tier ($9.99/yr) — optional | $200–500 | 1 week build |
| **Total** | **$2,700–8,000/mo** | |

This hits $5K MRR comfortably without asking users to pay another monthly fee. And the work to get there is mostly stuff you're already doing (Hype Index posts) — you're just monetizing it once it has traction.

---

## The Podcast Survival Kit

You're scared. That's fine. Most founders are. Here's the de-risked path.

**Months 1–6: Don't do podcasts. Do written media instead.**
- Pitch Bloody Elbow / MMA Fighting / Cageside Press / MMA Junkie via email
- They send questions, you reply at your pace, you control your words
- Same brand reach as podcasts, zero performance pressure
- Also lets you **see your own writing** and refine your talking points before saying them out loud

**Months 7–9: Small podcasts only.**
- Indie/regional MMA shows, grappling podcasts, smaller fight shows
- Audience under 50K downloads/episode
- These are practice reps. Mistakes here cost nothing.
- Goal: 2–3 small podcast appearances before going on anything bigger.

**Months 10–12: Bigger podcasts, but only edited ones.**
- Heavy Hands, MMA Hour, similar formats that record-and-edit
- Avoid live formats (live radio, livestreams). One bad take = forever.
- Pitch *segments*, not full interviews — "5-minute hype index for fight week"

**Five rules for any podcast:**
1. **Stay in your lane.** Dataset. Hype. App features. What fans rate. Outside this, deflect: *"I just track what fans think — here's what they're saying about that fight."*
2. **Five prepared talking points.** Write them down. Hit them. Don't improvise.
3. **No fighter takes, no UFC management opinions, no political stuff.** Doesn't matter what they ask. Stay in the lane.
4. **Practice once with a friend on Zoom** before any podcast. Record it. Watch yourself back. Adjust.
5. **Podcasts are not the only path.** If after 3 small ones you genuinely hate it, hire a brand ambassador for $500/month and let them be the voice. Don't be a martyr.

**On the lisp:** the first 30 seconds of any audio of yourself will feel awful. Past minute 2 nobody will care. Tyson has a lisp. Joe Rogan has one. It's a non-issue once people are listening to your *content*. Hard to believe in advance, true in practice.

**On being unkempt:** podcasts are audio. The few that do video, you wear one shirt and brush your hair for 60 minutes. That's it.

**On saying inflammatory things:** the lane rule fixes this. If you ever feel a take rising, say *"I'd have to look at the data on that"* — buys you 5 seconds, lets you redirect to a number, makes you look thoughtful.

---

## The Kill List — what to ignore for the next year

If you're tempted to do any of these, stop:

- ❌ Co-watching chat feature (shelved through 2026-07-13, revisit later)
- ❌ New sport verticals (boxing-only, martial arts-only, etc.)
- ❌ Marketplace / e-commerce features
- ❌ General-purpose social network expansion (timelines, follows-of-follows)
- ❌ Display ads (poor fit for niche apps at your scale)
- ❌ Paid acquisition campaigns above $200/month (don't move the needle, save the money)
- ❌ Live formats (radio, livestream podcasts) until you've done 3+ edited podcasts
- ❌ Hot takes on fighters / UFC management / inflammatory content (the lane rule)
- ❌ Major redesigns of the core app (it's good enough — don't fix what isn't broken)
- ❌ Adding more team members beyond an ambassador if needed (solo lean is part of the founder story)

---

## When you feel overwhelmed

You won't do all of this perfectly. Nobody does.

The minimum viable version of this entire year is:

1. **Twitter Hype Index, every fight week. Never skip.**
2. **Land your first Hype Index sponsor by September.** ($2K+/month from one yes.)
3. **Add one buyer to your relationship map every month.**

If you do nothing else from this doc for an entire year except those three things, you'll still hit the $7M target band — maybe at the lower end ($5–6M), but in range. Those are your three irreducible commitments. Everything else multiplies them.

Print them. Tape them somewhere. They are the year.

---

## When in doubt, ask yourself:

- **Does this make Good Fights more visible to MMA fans?** → do it
- **Does this quantify or broadcast the dataset?** → do it
- **Does this put me in front of a potential buyer?** → do it
- **Does this generate revenue?** → do it
- **None of the above?** → don't do it

That's the whole filter.

---

## Pointers

- This playbook: `docs/marketing/mikes-weekly-playbook.md`
- 90-day marketing plan: `GOOD_FIGHTS_90_Day_Marketing_Plan.md`
- Buyer pipeline doc: `docs/marketing/buyer-pipeline.md`
- AI-side handoff (for Claude sessions): `docs/HANDOFF-acquisition-narrative-and-metrics-2026-05-09.md`
- Daily logs: `docs/daily/`
