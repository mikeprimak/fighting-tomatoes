# HANDOFF — Web QA evening session, 2026-05-22

## TL;DR

Eight commits shipped on 2026-05-22 evening — modal/cache parity sweep
across the web app. **None tested live yet.** Both deploys (Vercel for
web, Render for backend) were pushing when Mike stopped for the night.
Pick this up by running the test plan below once both are green.

## Pre-flight before testing

1. Verify backend deploy is up:
   `curl https://fightcrewapp-backend.onrender.com/api/health`
   → expect `{ "status": "healthy" }`. The DELETE prediction endpoint
   from `d056bf0` only works once Render redeploys.
2. Hard reload the web app (Ctrl/Cmd+Shift+R on
   <https://web-jet-gamma-12.vercel.app>) to bust any stale SW cache.

## Test plan

Each step has the path that was changed in parentheses for triage if
something fails.

### 1. Nullify hype on fighter detail (`d056bf0`)

- Open a fighter with an upcoming fight you've previously hyped
  (avocadomike@hotmail.com has plenty of data).
- Tap the card → modal shows your existing hype (e.g. 5).
- Tap the same flame again → wheel rolls to blank → Done.
- ✅ Card flame should disappear immediately.
- Reload → flame should still be empty (DB confirmed).

### 2. Nullify rating on fighter detail (`d056bf0`)

- Open a fighter with a completed fight you've rated.
- Tap the card → modal shows your existing star rating.
- Tap the same star to clear → Done.
- ✅ "MY RATING" cell goes blank immediately.
- Reload → still blank. Also verify any review/comment on that fight
  is gone (DELETE rating cascades to reviews + tags by design).

### 3. Search page — "my rating" persists across reload (`d056bf0`)

- Search a fighter you've rated fights for (e.g. "Jones", "Pereira").
- ✅ Completed fights should show your star rating in the MY RATING
  cell immediately on page load (not just after editing).
- Rate a fight from the search results → reload → still shows.

### 4. Search page — immediate UI update (`421f6bd`)

- From a search result card, tap to open modal, change your
  hype/rating, Done.
- ✅ Card updates without a page reload.

### 5. Event detail screen — layout (`d056bf0`)

- Click any event from the home page.
- ✅ Fights should now render as a vertical card stack with thin
  dividers inside a rounded border (same look as home page) — NOT a
  3-column grid like before.

### 6. Event detail screen — fights actually load (`ad3308c`)

- Open several events (upcoming, past, live if any). Try a few orgs.
- ✅ Every event with fights in the DB should display them. Used to
  show "No fights announced yet" on every event because the page was
  hitting a non-existent endpoint.

### 7. Event detail screen — modals work

- Tap an upcoming fight → HypeFightModal opens, tap a flame → Done →
  card updates inline.
- Tap a completed fight (e.g. on a past event) → RateFightModal opens,
  rate it → Done → card updates.
- Tap a live fight (if a UFC card is live) → opens rating modal.

### 8. Regression: positive hype/rating still works everywhere

- Home page upcoming card → hype works.
- Past event detail → rate a fight → works.
- These were already working before the evening's changes; just
  confirm no regression.

## Commits shipped this session

- `cea7c39` — RateFightModal + LiveFightCard wire-up
- `8a32eb7` — Good Fights "All Time" period filter alignment
- `dbb0ee2` — hand logo in navbar
- `dba33f3` — lazy-load Upcoming/Past via IntersectionObserver
- `0e59bb4` — fighter detail uses UpcomingFightCard / CompletedFightCard
- `421f6bd` — modal cache invalidation now includes fighterFights + search
- `ad3308c` — event detail loads fights via `/fights?eventId=`
- `d056bf0` — DELETE prediction endpoint + nullify rating/hype +
  search auth race + event detail list layout

## What's NOT done

- **Live verification.** Everything above. The plan exists; the
  tester is you.
- **Cleanup of unused `getEventFights` helper** in `packages/web/src/lib/api.ts`
  (the old broken path). Left in place to avoid scope creep.
- **Block 1 of the web QA walk** is still partial — past tab, top
  fights tab, and the deeper fight-detail interactions weren't
  re-walked after these changes shipped. The original web QA handoff
  at `docs/HANDOFF-web-qa-2026-05-14.md` is still the source of truth
  for the full checklist.

## If something fails

Look up the failing test step's commit in the list above and start
there. The DELETE endpoint is the one that requires the Render
deploy specifically — if step 1 or 2 fails with a 404 or 405, the
backend hasn't redeployed yet.

The earlier handoffs in this area still apply:
- `docs/HANDOFF-web-qa-2026-05-14.md` — original web QA walk handoff
  (Blocks 2-7 untouched)
- `docs/HANDOFF-broadcast-discovery-2026-05-12.md`
- `docs/HANDOFF-follow-fighter-notifications-test-2026-05-20.md`
