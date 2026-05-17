# Reddit Post-Fight Verdict Template

Reusable template for posting community ratings data to Reddit after every major card. Drafted 2026-05-01 per Phase 1 Task 6 of the 90-day marketing plan. Rewritten 2026-05-01 against the current schema (predictions/tags removed from the app — only hype + comments remain).

**Goal:** Earn organic Reddit engagement with data-led content. Not promotion.

**Cardinal rule (from plan §"What you do not do"):** No direct promotional content in r/MMA. The post is *data*, not an ad. The link to goodfights.app appears once at the bottom, in source-citation context only.

---

## When to post

- **Within 24 hours of card end.** Earlier = more engagement; news cycle moves fast.
- **Saturday card → post Sunday morning** (peak Reddit MMA traffic).
- **Friday card → post Saturday morning.**

## Where to post

| Card type | Primary | Secondary | Notes |
|---|---|---|---|
| UFC numbered | r/MMA | r/sports (only if mainstream crossover, e.g. White House card) | r/MMA is the home subreddit |
| BKFC | r/MMA, r/bkfc | — | Smaller community but warmer |
| Boxing PPV | r/boxing | r/MMA (only if MMA-crossover fighter, e.g. McGregor) | r/MMA hates uninvited boxing posts |
| Netflix card (e.g. MVP) | r/MMA, r/netflix | — | Netflix audience overlap is real |
| ONE / RIZIN / Karate Combat | r/MMA | sub-specific (r/ONEChampionship etc) | Niche orgs, small reach |

**Settings (every post):**
- "Allow comments" = ON for organic posts (engagement is the point)
- *(opposite of paid ads, where comments stay OFF — see 2026-04-27 daily log)*
- No flair unless the sub requires one
- Don't pin to your profile

---

## Title formula

Plan rule: "Title it around the most interesting data point, not around your app."

**Title patterns that work:**
1. **Hype-vs-reality surprise:** "UFC 328 community verdict: [unexpected fight] was the biggest overperformer, [hyped main event] was the biggest letdown"
2. **Volume flex:** "[N] fans rated UFC 328 — here's how every fight scored"
3. **Single-fight blowout:** "[Name] vs [Name] just became the highest-rated fight of 2026 in our community (X.X / 10 from N raters)"

**Avoid:**
- "GOOD FIGHTS user ratings for UFC 328" (boring, app-led)
- "Check out our app's data!" (promotional, instant downvote)
- "I built an app and..." (self-promo, banned in r/MMA)

---

## Body template

```
**Pre-fight hype** (N users hyped this card before it started):
- Card hype avg: X.X / 10
- Most-hyped fight: [Name] vs. [Name] — X.X / 10 (M users)

**Post-fight ratings** (N users rated after watching):
- Card rating avg: X.X / 10
- Highest-rated: [Name] vs. [Name] — X.X / 10 (M users)
- Lowest-rated: [Name] vs. [Name] — X.X / 10 (M users)

**Hype vs reality:**
- Biggest overperformer: [Name] vs. [Name] (hyped X.X → rated Y.Y, +Δ)
- Biggest underperformer: [Name] vs. [Name] (hyped X.X → rated Y.Y, -Δ)

**Top community take:**
> "[verbatim post-fight comment, top-upvoted on the card]"
> — on [Fight name]

---
*Data from GoodFights.app — N users contributed to this card.*
```

Replace bracketed values from SQL output (queries below).

---

## SQL queries to populate the template

Run from `packages/backend/` against the Render prod DB. Prisma auto-loads `.env` (the URL is in `.env`, not `.env.production` — see `infra_render_db_url_in_env_not_envprod.md`).

The `<eventId>` placeholder is the event UUID. Find it via `/admin.html` or:

```sql
SELECT id, name, date FROM events WHERE name ILIKE '%UFC 328%' ORDER BY date DESC LIMIT 5;
```

### Query 1: Card averages

```sql
-- Pre-fight hype card-wide
SELECT
  ROUND(AVG(p."predictedRating")::numeric, 1) AS card_hype_avg,
  COUNT(DISTINCT p."userId")               AS n_hypers,
  COUNT(p.id)                              AS n_hype_records
FROM fight_predictions p
JOIN fights f ON p."fightId" = f.id
WHERE f."eventId" = '<eventId>'
  AND p."predictedRating" IS NOT NULL;

-- Post-fight ratings card-wide
SELECT
  ROUND(AVG(r.rating)::numeric, 1) AS card_rating_avg,
  COUNT(DISTINCT r."userId")       AS n_raters,
  COUNT(r.id)                      AS n_ratings
FROM fight_ratings r
JOIN fights f ON r."fightId" = f.id
WHERE f."eventId" = '<eventId>';
```

### Query 2: Highest- and lowest-rated fight (post-fight)

```sql
SELECT
  CONCAT(f1."firstName", ' ', f1."lastName", ' vs. ', f2."firstName", ' ', f2."lastName") AS fight,
  ROUND(AVG(r.rating)::numeric, 1) AS avg_rating,
  COUNT(r.id)                      AS n_ratings
FROM fight_ratings r
JOIN fights f    ON r."fightId" = f.id
JOIN fighters f1 ON f."fighter1Id" = f1.id
JOIN fighters f2 ON f."fighter2Id" = f2.id
WHERE f."eventId" = '<eventId>'
GROUP BY f.id, f1."firstName", f1."lastName", f2."firstName", f2."lastName"
HAVING COUNT(r.id) >= 5  -- minimum sample to report
ORDER BY avg_rating DESC;
```

Top row = highest-rated. Bottom row = lowest-rated.

### Query 3: Most-hyped fight pre-event

```sql
SELECT
  CONCAT(f1."firstName", ' ', f1."lastName", ' vs. ', f2."firstName", ' ', f2."lastName") AS fight,
  ROUND(AVG(p."predictedRating")::numeric, 1) AS avg_hype,
  COUNT(p.id)                                 AS n_hyped
FROM fight_predictions p
JOIN fights f    ON p."fightId" = f.id
JOIN fighters f1 ON f."fighter1Id" = f1.id
JOIN fighters f2 ON f."fighter2Id" = f2.id
WHERE f."eventId" = '<eventId>'
  AND p."predictedRating" IS NOT NULL
GROUP BY f.id, f1."firstName", f1."lastName", f2."firstName", f2."lastName"
HAVING COUNT(p.id) >= 5
ORDER BY avg_hype DESC
LIMIT 1;
```

### Query 4: Hype vs reality (over/underperformer)

```sql
SELECT
  CONCAT(f1."firstName", ' ', f1."lastName", ' vs. ', f2."firstName", ' ', f2."lastName") AS fight,
  ROUND(hype_avg::numeric,   1) AS hype,
  ROUND(rating_avg::numeric, 1) AS rating,
  ROUND((rating_avg - hype_avg)::numeric, 1) AS delta,
  n_hyped, n_rated
FROM (
  SELECT
    f.id AS fight_id,
    f."fighter1Id", f."fighter2Id",
    AVG(DISTINCT p."predictedRating") AS hype_avg,
    AVG(DISTINCT r.rating)            AS rating_avg,
    COUNT(DISTINCT p.id)              AS n_hyped,
    COUNT(DISTINCT r.id)              AS n_rated
  FROM fights f
  LEFT JOIN fight_predictions p ON p."fightId" = f.id AND p."predictedRating" IS NOT NULL
  LEFT JOIN fight_ratings     r ON r."fightId" = f.id
  WHERE f."eventId" = '<eventId>'
  GROUP BY f.id
  HAVING COUNT(DISTINCT p.id) >= 3 AND COUNT(DISTINCT r.id) >= 5
) sub
JOIN fights f    ON sub.fight_id = f.id
JOIN fighters f1 ON sub."fighter1Id" = f1.id
JOIN fighters f2 ON sub."fighter2Id" = f2.id
ORDER BY delta DESC;
```

Top row = biggest overperformer. Bottom row = biggest underperformer.

> ⚠️ The DISTINCT in the AVG above is a quick safety against join-multiplied rows. If results look off, replace the subquery with two separate per-fight aggregates joined by fight_id.

### Query 5: Top post-fight community comment

Pick one quotable, non-toxic comment for the body. Pull top 5, eyeball, choose:

```sql
SELECT
  fr.content,
  fr.upvotes,
  fr.rating,
  CONCAT(f1."firstName", ' ', f1."lastName", ' vs. ', f2."firstName", ' ', f2."lastName") AS fight
FROM fight_reviews fr
JOIN fights   f  ON fr."fightId" = f.id
JOIN fighters f1 ON f."fighter1Id" = f1.id
JOIN fighters f2 ON f."fighter2Id" = f2.id
WHERE f."eventId" = '<eventId>'
  AND fr."isHidden" = false
  AND fr."parentReviewId" IS NULL          -- top-level only, no replies
  AND LENGTH(fr.content) BETWEEN 30 AND 280  -- Reddit-quotable length
ORDER BY fr.upvotes DESC
LIMIT 5;
```

> Editorial check: Even highest-upvoted comments can be slurs, off-topic, or low-effort. Read all 5; pick the one you'd be proud to attribute to the community. If none are usable, drop the "Top community take" section entirely.

### Query 6 (optional): Top pre-fight take

If pre-fight comments are notably engaged, you can lead with one. Same shape:

```sql
SELECT
  pfc.content,
  pfc.upvotes,
  CONCAT(f1."firstName", ' ', f1."lastName", ' vs. ', f2."firstName", ' ', f2."lastName") AS fight
FROM pre_fight_comments pfc
JOIN fights   f  ON pfc."fightId" = f.id
JOIN fighters f1 ON f."fighter1Id" = f1.id
JOIN fighters f2 ON f."fighter2Id" = f2.id
WHERE f."eventId" = '<eventId>'
  AND pfc."parentCommentId" IS NULL
  AND LENGTH(pfc.content) BETWEEN 30 AND 280
ORDER BY pfc.upvotes DESC
LIMIT 5;
```

---

## Title-writing workflow (post-card morning)

1. Run Queries 1–5.
2. Look at the data. **What's the most surprising single number?** That goes in the title.
   - Big positive delta on a fight nobody hyped → title pattern #1 ("biggest overperformer was…")
   - High volume across the card → title pattern #2 ("[N] fans rated…")
   - One fight scored absurdly high → title pattern #3 ("[fight] just became the highest-rated of 2026")
3. Body fills in supporting data.
4. Read the post out loud. Cut anything that sounds like marketing copy.

---

## Don't post if

- **Sample size is tiny** (< 50 unique raters total across the card). Data isn't credible enough — wait for next card.
- **The card was a snoozer** with no data hook. Skip rather than force a post; you have multiple cards to choose from over 90 days.
- **Mod has rejected previous attempts.** Move on to a different sub.

---

## Tracking what works

After each post, log to `docs/daily/YYYY-MM-DD.md`:

- Subreddit posted to
- Exact title used
- Upvotes 24h after posting
- Comment count
- App Store traffic spike (or lack thereof) the next day from App Store Connect → Analytics
- Play Console acquisition spike

This builds the dataset for which titles / subs / data points generate attention. Plan the next card's post based on what worked, not what felt right.
