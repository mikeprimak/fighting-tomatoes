# Playbook: SEO Fight-Preview Content Cluster

**Purpose:** Build the web's best resource for a specific upcoming fight, structured to win
long-tail search traffic, and promote it correctly. This is the repeatable process behind the
McGregor vs Holloway 2 / UFC 329 cluster shipped 2026-05-30.

**When to run:** As soon as a notable fight is announced. Earlier is always better (see Timing).

**First reference example:** UFC 329 (McGregor vs Holloway 2), three interlinked posts +
weekly refresh routine. Use those files as templates.

---

## 1. Philosophy (read this before anything else)

- **Pick the winnable battle.** A young domain will NOT outrank ESPN, UFC.com, or Wikipedia on
  the head term ("McGregor vs Holloway 2"). We do not try. We win the **long-tail question
  queries** ("how to watch X in Ireland", "did they fight before", "what time does X start")
  where the giants are thin, by being the single most complete page on the web.
- **Format is the weapon.** Each section is titled with a real search query (a question), one or
  two paragraphs long. Every H2 is a snippet/PAA candidate. One URL ranks for dozens of queries.
- **Early publishing is the advantage, not a problem.** Ranking takes weeks. The big sites publish
  their "how to watch" pages in the final week. We publish the day it is announced so Google gets
  weeks to crawl, index, and age the page. We then keep it fresh so it peaks right as volume does.
- **Honesty over optimism.** Real records, real odds, honest predictions, honest fighter histories
  (including rough patches). Trust is the ranking and conversion asset. Never dress up a weak angle.
- **Cluster beats a single page.** One hub + 2 supporting articles, all interlinked, makes Google
  see topical authority and lifts all three. This is the single highest-leverage free move.
- **Light touch on the app.** One CTA near the top, one at the bottom. Never aggressive. The CTA is
  "rate how hyped you are for this fight" framing, not a hard sell.

---

## 2. The asset we build

1. **Main hub article** — 25 to 30 question-headed H2 sections covering every major query cluster.
2. **2+ supporting cluster articles** — usually one per fighter (career arc / backstory / "why
   they've been out"), each targeting that fighter's own query set.
3. **All three bidirectionally interlinked** (hub links to supporters, supporters link to hub and
   to each other, hub has a "Related reading" block).

### Query clusters to cover in the hub (brainstorm all, then trim to the 25-30 strongest)

- **Logistics / how to watch** (highest volume): what channel, PPV cost, free options, by-country,
  start times by timezone, streaming devices.
- **When & where:** date, venue, city, tickets.
- **The card:** full card, co-main, undercard highlights, number of fights.
- **Stakes & storylines:** title/belt status, weight class/catchweight, why fighting, what each
  needs, retirement angle.
- **First fight / head-to-head** (evergreen gold): did they fight before, who won, what happened,
  how they've changed.
- **Tale of the tape:** records, age, height, reach, stance.
- **Odds & predictions:** betting odds, favorite, who wins, props, expert pick.
- **Pre-fight narrative:** trash talk, press conference, layoff, how it was announced.
- **Deep cuts:** styles matchup, keys to victory, trilogy potential.

---

## 3. Step-by-step process

### A. Query research
- Brainstorm the full query list across the clusters above. Present to Mike, get input, trim to
  the 25-30 strongest. He decides depth and CTA aggressiveness.

### B. Fact-gathering (verify everything)
- Web-search the official announcement (UFC.com), card, odds (2-3 sportsbooks), and the
  first-fight history. **Confirm:** exact date, venue, weight class, title/belt status,
  broadcaster, co-main, current odds, and the head-to-head result.
- **Broadcast research is per-country and changes constantly.** Reconcile against
  `packages/backend/prisma/seed-broadcast-channels.ts` and
  `docs/plans/how-to-watch-broadcaster-research-2026-05-03.md`, but trust current live search over
  the stale internal doc (the UK/Australia Paramount hypothesis in that doc was wrong). US =
  Paramount+ (no separate PPV). Canada = Sportsnet+ (still PPV). UK/Ireland = TNT Sports +
  discovery+. Australia = Main Event PPV (Kayo/Foxtel), prelims on Paramount+/Network 10. Europe =
  DAZN in most markets (DE/AT/IT/ES/PT), Fight Pass fallback.
- Mike fact-checks before publish, but get it right via search first.

### C. Write the hub article
- House style (NON-NEGOTIABLE): **never use em dashes.** Use commas, colons, or hyphens. Sweep
  before commit. (See memory `feedback_blog_no_ai_tells`.)
- Honest, conversational voice. Bold key dates. Each section 1-2 short paragraphs.
- Add an in-page scroll anchor for the international section: the blog renders markdown with
  `marked`, which does NOT auto-slug headings, so use an explicit `<a id="..."></a>` (it passes
  through because the page uses `dangerouslySetInnerHTML` with no sanitizer).
- One CTA in the intro ("rate how hyped you are for this fight"), one at the bottom with the
  slogan "Never miss a Good Fight." Link to https://goodfights.app.

### D. Hero image
- Landscape (near 16:9) banner is ideal; the hero renders in a 16:9 `object-cover` frame so
  portrait images center-crop. Self-host in `packages/web/public/blog/` (NEVER hotlink reddit
  `preview.redd.it` or similar, signed URLs expire and hosts block hotlinks). The hero is also the
  OG/Twitter share image, so a branded banner doubles as the social card.

### E. Publish
- File location: `packages/web/src/content/posts/YYYY-MM-DD-<slug>.md` (this is the single
  canonical source; backend copy is generated by `syncBlogPosts.js`, never edit it).
- Frontmatter: `title, slug, date, author: "Good Fights", excerpt, tags, image, draft`.
  Set `featured: true` on the hub to pin it to the homepage EditorialHero (strong internal link).
  Add the `event:` block (see Technical Reference) for SportsEvent schema.
- Ship `draft: true` first for Mike's fact-check, then flip to `draft: false`.
- Commit + push to `main`. Vercel auto-deploys `packages/web` from `main`. The local working
  branch is usually even with `origin/main`; commit only the post files and
  `git push origin HEAD:main`. The Ignored Build Step skips deploys for commits that do not touch
  `packages/web`.
- Live at https://goodfights.app/blog/<slug>.

### F. Technical SEO (already built, just reuse, see section 5)
- FAQPage + BlogPosting + BreadcrumbList JSON-LD is automatic on every post.
- SportsEvent JSON-LD fires when the post has an `event:` frontmatter block.
- Canonical, sitemap inclusion, robots, homepage pin: all automatic.
- After deploy, validate at search.google.com/test/rich-results.

### G. Submit to search engines (one-time per article)
- **Google Search Console** (goodfights.app is verified via a meta tag in `layout.tsx`):
  Sitemaps already submitted. URL Inspection -> paste the article URL -> **Request Indexing**.
  (Limited per day, do it once for the hub.)
- **Bing Webmaster Tools** (imported from GSC): URL Inspection -> **Request indexing**. More
  generous than Google.

### H. Social distribution
- **Twitter/X now:** post with the branded banner attached natively + UTM-tagged link. Draft a
  straight version and a funny/self-deprecating version (Mike picks humor, see memory
  `feedback_marketing_humor`). X throttles external links, so optionally put the link in the first
  reply. UTM convention: `?utm_source=twitter&utm_medium=social&utm_campaign=<fight-slug>`
  (see memory `feedback_marketing_utm_convention`, always UTM-tag goodfights.app links).
- **Reddit = fight week only.** r/MMA slaughters self-promo. Do NOT drop links early. During fight
  week, leave a genuinely helpful comment in an existing discussion thread, link only if it adds
  value. Reddit links are nofollow but Reddit threads rank in Google and drive referral. Paid
  Reddit Ads are the clean alternative (see memory `project_reddit_promo_500_match`).
- **Owned channels:** Facebook page, Instagram (story + link in bio), email list. Free and safe.
  Skip Threads (login-flagging risk, see memory `lesson_threads_meta_ads_gotcha`).

### I. Build the cluster
- Write 2 supporting articles (fighter backstories / angles), each interlinked with the hub and
  each other. Reuse the banner as the hero or crop per fighter. Fact-check via web search.

### J. Schedule freshness refreshes
- Freshness is a ranking signal for event queries. Create a weekly remote routine (via `/schedule`)
  that web-searches updated odds + card/news and makes small accurate edits to the cluster, then
  commits and pushes. The routine prompt must: check the date and no-op after the fight, forbid
  fabrication, enforce no em dashes, and push to `main`. Mike disables it after the fight at
  https://claude.ai/code/routines (routines cannot be deleted via API).

---

## 4. Conventions / house rules (quick reference)

| Rule | Detail |
|---|---|
| No em dashes | Blog + marketing copy. Commas/colons/hyphens only. Sweep before commit. |
| Canonical domain | https://goodfights.app (NOT web-jet-gamma-12.vercel.app, that is dead dev). |
| CTA | One top ("rate how hyped you are"), one bottom (+ "Never miss a Good Fight."). Light. |
| UTM | Every outbound goodfights.app link in marketing gets a UTM string. |
| Images | Self-host in `public/blog/`. Landscape ~16:9. Never hotlink. |
| Source of truth | Edit posts only in `packages/web/src/content/posts/`. |
| Publish flow | `draft: true` -> Mike fact-checks -> `draft: false` -> push to main. |
| Honesty | Real numbers, honest predictions, honest fighter histories. |

---

## 5. Technical reference (what is already implemented)

All of this is reusable infrastructure, no code changes needed per fight unless extending it.

- **`packages/web/src/lib/posts.ts`**
  - `extractFaqs()` auto-builds Q&A pairs from any `## ` heading containing `?` (question = text
    up to and including the first `?`). Powers FAQPage schema. So: write H2s as questions.
  - `PostEvent` type + `event` field parsed from frontmatter.
- **`packages/web/src/app/blog/[slug]/page.tsx`**
  - Emits JSON-LD: `BlogPosting` + `BreadcrumbList` + `FAQPage` (if any FAQs) + `SportsEvent`
    (if `event:` block present). Also sets `alternates.canonical`.
- **`event:` frontmatter block** (add to fight hub posts):
  ```yaml
  event:
    name: "UFC 329: McGregor vs Holloway 2"
    startDate: "2026-07-11T21:00:00-04:00"   # main card start, ET offset
    venue: "T-Mobile Arena"
    city: "Las Vegas"
    region: "NV"
    country: "US"
    performers:
      - "Conor McGregor"
      - "Max Holloway"
  ```
- **`packages/web/src/app/sitemap.ts`** auto-includes every post. **`robots.ts`** allows crawl.
- **`packages/web/src/app/layout.tsx`** holds the Google site-verification meta tag and
  `metadataBase`.
- **`featured: true`** pins to the homepage hero. Only one post should be featured at a time.

---

## 6. Timing guidance

- Publish the hub the day the fight is announced. The runway IS the strategy.
- If the fight is close (under ~2 weeks out), compress: publish hub + submit to GSC/Bing + Twitter
  same day, write the cluster within a day or two, and set the refresh cadence to twice a week
  instead of weekly.
- Always do Reddit during fight week, never before.

---

## 7. Copy-paste checklist for the next fight

```
[ ] Brainstorm full query list, trim to 25-30 with Mike
[ ] Web-search + verify: date, venue, weight, title status, card, co-main, odds, first fight
[ ] Per-country broadcast research (reconcile vs seed-broadcast-channels.ts, trust live search)
[ ] Write hub article (question H2s, no em dashes, 1-2 para each, anchor for intl section)
[ ] Light CTA top + bottom; goodfights.app links
[ ] Self-host landscape banner in public/blog/ (doubles as OG image)
[ ] Frontmatter incl. event: block; featured: true; draft: true
[ ] Push to main; Mike fact-checks live; flip draft: false; push
[ ] Validate rich results (search.google.com/test/rich-results)
[ ] GSC: Request Indexing on hub URL
[ ] Bing: Request indexing on hub URL
[ ] Twitter: banner + UTM link (straight + funny variants)
[ ] Write 2 cluster articles, bidirectionally interlinked with hub
[ ] Add "Related reading" to hub
[ ] Push cluster to main
[ ] /schedule weekly (or 2x/week if <2wk out) freshness refresh routine; stop after fight
[ ] Fight week: Reddit helpful-comment in a real thread + owned social
[ ] After fight: disable the refresh routine
```

---

## 8. Next planned application

**Ilia Topuria vs Justin Gaethje, UFC Freedom 250, June 14 2026.** Do NOT start until Mike says go.
Note: only ~2 weeks out as of this writing, so use the compressed timing path in section 6.
