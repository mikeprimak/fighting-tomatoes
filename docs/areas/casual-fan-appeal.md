# Casual Fan Appeal

**Status:** Brainstorm / not yet built (captured 2026-06-11)

## The problem

Most fight fans are casuals: they only care about ~3-4 big UFC events a year. The app
today caters to hardcores — it covers every promotion and every event, and the home
experience treats all events as equal-weight. That breadth is a hardcore mental model.

## The reframe

Casuals don't want *less coverage* — they want the firehose **hidden**. Breadth is a
backend asset, not a front-page feature. The fix is to make the app *behave* like a
casual-only app by default, with hardcore depth still available underneath. Don't cover
fewer events; make the big events feel huge and let everything else recede.

## Ideas (highest-leverage first)

### 1. Casual-first default home
Between events, a casual should open the app and see **one thing**: the next big card
(UFC PPV / marquee boxing) with a countdown, and little else loud. Everything else
collapses into a "more events" drawer. Big events feel huge; the Tuesday DWCS card
barely registers. *(Top build priority.)*

### 2. "Is this card worth my Saturday?" score
Casuals only watch 3-4 events because they don't know which ones are good — answering
that IS the killer feature. Surface a pre-event "stacked-ness" signal (hype + star
power) and a post-event community score. The filtering — *should I order this PPV / clear
my night?* — is the value. *(Top build priority.)*

### 3. Follow fighters, not promotions
Casuals think in stars (Jon Jones, Conor, O'Malley, Paul), not promotions
("Matchroom", "Oktagon"). Onboarding that lets them tap 3-4 names turns the app into a
personal, quiet feed: *"we'll ping you when your guys fight + when the big cards drop."*
Also feeds the follow-fighter acquisition dataset — aligned, not a detour.

### 4. Notification discipline as a feature
Over-notifying is the #1 casual churn driver. Offer an explicit **"big events only"**
tier — numbered UFC PPVs + a couple marquee nights a year, nothing else. Sell the
restraint: *"we won't blow up your phone."*

### 5. Post-event payoff loop
The complete casual loop needs no breadth: *watch the big PPV → rate it → see if everyone
agreed → read the hot takes.* A satisfying closed loop around 4 events a year.
Spoiler-free mode (already built) matters here since casuals delay/DVR.

### 6. "Did you miss anything?" warm-up
Casuals go dark between big events. A monthly one-card recap — *the one fight that went
viral, the next PPV to circle* — keeps them from uninstalling in the gaps.

## Tension to watch

Casuals inflate MAU but engage less than hardcores, which slightly dilutes the
"deeply-engaged dataset" sale narrative. Reconciliation: casuals still produce **ratings**
around big events, and rating volume on marquee cards is itself a strong signal. Casual
acquisition and the dataset thesis aren't in conflict *as long as we capture the rating,
not just the install.*
