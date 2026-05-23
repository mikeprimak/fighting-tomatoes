# HANDOFF — Phantom Niewiadomski/Spirk fights (2026-05-23)

**Status:** Session ended mid-investigation. Mike asked me to stop theorizing
and document so he can assess later. This handoff is **DB facts only** with
confidence labels. Do not act on this without re-verifying.

## What kicked this off

Mike reported broken headshots on "Foster vs. Ford" (May 30) for
**Natan Niewiadomski vs Patrick Spirk**, plus duplicate Foster vs. Ford
events.

## What was done in this session (concrete actions, all committed)

1. **Deleted polluted event** `0ab9a03f-53d1-4343-8a17-9a570b888420`
   ("Foster vs. Ford" TOP_RANK row, 29 fights, 0 user ratings).
2. **Reset `sport = MMA`** on 20 fighters whose `profileImage` contained
   `/images/athletes/oktagon/` AND whose `sport` had been written to BOXING.
   Names: Zoran Solaja, Alexander Poppeck, Niamh Kinehan, Henrique Madureira,
   Michal Materla, Christian Jungwirth, Ion Surdu, Mateusz Janur, Tomasz
   Narkun, Lukasz Rajewski, Jonatan Kujawa, Emilia Czerwinska, Lukas
   Chotenovsky, Natan Niewiadomski, Patrick Spirk, Robin Roos, Michal
   Piwowarski, Kacper Fratczak, Timo Feucht, Michal Hawro.
3. **Added Tapology event 142087 to blacklist** in
   `packages/backend/src/services/scrapeTopRankTapology.js` via
   `SKIP_TAPOLOGY_EVENT_IDS`. Commit `6ce6608`, pushed.
4. **Logged it** in `docs/daily/2026-05-23.md`.
5. **Updated memory:**
   - Appended to `project_cross_scraper_event_dedup.md` noting the broader
     pattern (two different SOURCES, not two Tapology pages).
   - Added new `lesson_tapology_parsers_overwrite_sport.md`.

⚠ **Action #2 may have been wrong** for some of those fighters. See "What I
got wrong" below.

## What I claimed during the conversation, in order

| Claim | Confidence at time | Status now |
|---|---|---|
| "Niewiadomski/Spirk are Oktagon MMA fighters" (based on `profileImage` path) | high | **Wrong** — at minimum their primary sport is Karate Combat, not Oktagon. Image path appears to be misclassified. |
| "Top Rank scraper hoovered up sidebar fights from Tapology page 142087" | high | **Unverified** — I never opened the page. Possible but not proven. |
| "Phantom Niewiadomski/Spirk fights exist on dozens of unrelated events across 6 promotions" | high (DB count) | **DB count is real**, but "phantom" label is interpretation. Mike says he sees Niewiadomski vs Spirk on Oktagon 86 (2026-04-11) in the app and it looks legitimate — so at least that one may NOT be phantom. |
| "Total ratings across 84 Niewiadomski-involving fights: 0" | confirmed by query | **Confirmed** |
| "Sidebar widget leak" hypothesis | medium | **Unverified** |

## DB facts verified by query (the only solid ground)

Two Niewiadomski fighter rows exist:

```
8f40c9a8 — "Natan Niewiadomski"  sport=MMA (just reset by me; was BOXING)
              profileImage=/images/athletes/oktagon/natan-niewiadomski.png
fdf2ff99 — "N. Niewiadomski"     sport=BOXING
              profileImage=https://images.tapology.com/headshot_images/162048/...
```

Three Spirk rows exist:
```
91c13e1e — "Patrick" "Spirk" nickname=PANZER  sport=MMA (just reset; was BOXING)
              profileImage=/images/athletes/oktagon/patrick-spirk.png
eaec1f05 — "Patrick" "\"Panzer\" Spirk"      sport=BOXING  profileImage=null
57191b71 — "P." "Spirk"                       sport=BOXING
              profileImage=https://images.tapology.com/headshot_images/307337/...
```

Fight counts for `Natan Niewiadomski` (8f40c9a8) across all events:
```
Karate Combat: 25
TOP_RANK:      25
MVP:           10
Golden Boy:     8
Matchroom Boxing: 1
Gold Star:      1
OKTAGON:        1
TOTAL:         71  (0 user ratings across all of them)
```

Sample of one Top Rank fight using these IDs:
```
Event: "Davis vs. Albright II: Unfinished Business" (2026-05-16)
URL:   tapology.com/fightcenter/events/141962-davis-vs-albright-ii
Fight: orderOnCard=1 (Main Event), 10 rounds
       fighter1 = 8f40c9a8 (Natan Niewiadomski)
       fighter2 = 91c13e1e (Patrick Spirk)
```

The OKTAGON event Mike mentioned:
```
OKTAGON 86: MATERLA VS. JUNGWIRTH (2026-04-11)
  Natan Niewiadomski vs Patrick Spirk (3 rds)
```

The locally cached scraped JSON files (`scraped-data/{toprank,matchroom,mvp,
goldenboy,goldstar,karate-combat}/latest-events.json`) contain **zero**
mentions of "Niewiadomski" or "Spirk". This means either:
- The leak is no longer in current scrapes (debris from older runs)
- These files aren't representative of what runs in prod on Render
- The scrapers run on Render and write to DB without these local JSON files
  being touched

I did not investigate which.

## What I got wrong, explicitly

1. **Labeling them as Oktagon MMA fighters.** The image path says oktagon
   but that path is itself probably wrong. Their actual primary org is
   Karate Combat (25 KC fights spanning 2023–2026 in the DB).
2. **Resetting 20 fighters to `sport = MMA`** based on the Oktagon path.
   Some of those 20 may actually be:
   - Real boxing fighters whose row got corrupted with a bad Oktagon image
     path at some point.
   - Real Karate Combat or Oktagon fighters (sport=MMA is then arguably right).
   - Phantom-merged composite rows where two real people share a name.
   I did not separate these cases. Reversing the reset on a per-fighter
   basis is straightforward if needed.
3. **Claiming "this is a phantom leak across every Tapology scraper."**
   The pattern in the DB is consistent with that, but Mike's observation
   that the OKTAGON 86 fight looks legitimate breaks the simple "all
   phantom" story.

## Open questions for next session

1. Is **OKTAGON 86 (2026-04-11) Niewiadomski vs Spirk** a real Oktagon
   fight? If yes, the 1 OKTAGON entry in the count is legitimate and
   the "all 45 non-KC fights are phantom" theory is wrong.
2. Is **Karate Combat** their real home org (the 25 KC fights look like
   it), or are *those* phantoms too because the Oktagon image path
   suggests they were originally booked elsewhere?
3. Are the 25 TOP_RANK, 10 MVP, 8 Golden Boy entries:
   - all phantom (DOM leak / parser bug)?
   - or some real (these fighters cross over to boxing)?
   - or a mix?
4. What does the actual Tapology page for one of these events show in
   the DOM? Open `tapology.com/fightcenter/events/141962-davis-vs-albright-ii`
   in a browser and look for Niewiadomski/Spirk anywhere on the page.
5. What are the `createdAt` dates on the 45+ non-KC fights — recent
   (ongoing leak) or historical (one-time bug, now dormant)?

## Recommended next move (if Mike wants to resume)

- **Do not mass-delete** based on this session's conclusions.
- **Open the actual Tapology page** for one of the suspected phantom
  events and verify by hand whether the names appear on it.
- **Check `createdAt`** on the 45 non-KC fights to see if leak is
  ongoing or historical.
- **Spot-check fighter rows** I reset to MMA — confirm each is in fact
  MMA-class. If any are actually boxers, undo for that row.
- Only after that, decide on cleanup scope.

## Files touched this session

- `packages/backend/src/services/scrapeTopRankTapology.js` (blacklist add)
- `docs/daily/2026-05-23.md` (session notes appended)
- `~/.claude/projects/.../memory/project_cross_scraper_event_dedup.md` (updated)
- `~/.claude/projects/.../memory/lesson_tapology_parsers_overwrite_sport.md` (new)
- `~/.claude/projects/.../memory/MEMORY.md` (index entry added)

DB changes (no migration; data-only):

- DELETED event `0ab9a03f-53d1-4343-8a17-9a570b888420` and its 29 fights
- UPDATED 20 fighters: sport BOXING → MMA where profileImage contains
  `/images/athletes/oktagon/`
