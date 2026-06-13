# HANDOFF — Onboarding iteration session, 5 rounds done (2026-06-12 evening → 06-13 early)

**Branch:** `claude/user-focused-pivot-l8l6mg` (Phase 1 integration branch —
**NO main merges either direction; no OTA; no prod publish; no migrations**).
Read `docs/playbooks/onboarding-iteration.md` for the loop mechanics and
`docs/daily/2026-06-12.md` for full per-round detail. This supersedes
`docs/HANDOFF-onboarding-iteration-2026-06-12.md` (whose "next task", the
50-cap, shipped in a parallel window as `e35ea434`).

## Session state: 5 iteration rounds shipped from Mike's device walks

Commits (all pushed): `8df8ef70` (round 1), `0b2c7b4b` (round 2),
`0e8a0887` (round 3), `ef2be309` (round 4), `2450a2ad` (round 5).
Rounds 4-5 detail is in `docs/daily/2026-06-12.md` (see the "round 4" and
"round 5" sections); summary below.

**Round 4 (`ef2be309`):** welcome beat reorder (recs before diary); rate
stars + RateFightModal now use the hype heatmap (`getHypeHeatmapColor`);
skips no longer consume the 10-rating target (fetch 30, count ratings,
"Skip this" escape after 5 skips); follow-suggestions blends most-followed
with most-historically-rated fighters (headshot + active-or-fought-within-3y);
ALL taste sublines de-numbered to colloquial language; new `era-lean` insight
("You're an old-school fan", 2015 split); weight-class lean via a `rates-high`
headline variant (org lean deliberately skipped — everyone here is a UFC fan).

**Round 5 (`2450a2ad`):** profile My-Hype "Upcoming Events" link fixed
(`/(tabs)` home → `/(tabs)/events`); `follow-fighters` grid now lazy-loads
(backend `limit`/`offset` + `hasMore`, `onEndReached` appends, stable sort);
rate-classics counter 0-indexed ("0 of 10", counts ratings done).
NOTE: RateFightModal is legacy/unimported — the live rating modal is
`CompletedFightModal` (untouched, already had heatmap).

**Flow as it stands** (mandatory, no skips anywhere until the end):
`welcome` (logo + 5 beats: rate / follow / pays-it-back / fight diary /
recommendations) → `rate-classics` (10-fight stack, RateFightModal's star
wheel: tap → big number scrolls → lands → auto-advances) →
`follow-fighters` (grid + search, awaited follows with a 2.5s cap, button =
"Continue" when nothing selected) → `your-profile` (payoff, fetches
`taste-profile?fresh=true`, "Get into the fights" → tabs + marks complete).

**Taste engine** (`services/fanDNA/tasteProfile/`) — heavily reworked across
rounds 1-3, all from Mike's reactions:
- Hierarchy REVERSED from the 2026-06-11 design: self-relative insights are
  primary; you-vs-the-crowd is hard-capped at ONE card per direction
  (`capCommunityKinds`), `COMMUNITY_KIND_BOOST` 1.15 → 0.9.
- Global grading-bias card (`rating-bias-high/low`) owns the "you rate
  harder/kinder than the crowd" idea; `GLOBAL_CMP_FLOOR` 30 → 8 so per-token
  community deltas are bias-adjusted at onboarding scale.
- New kinds: `prefers` ("You take striking battles over ground-control
  fights", PAIR_MIN_N 5/gap 1.2, vibe+letdowns excluded), `rates-high`
  (plain "Late-surge fights score big with you"), `fighter-love` ("A Nate
  Diaz fight never misses for you"), `fighter-rec` (untouched champ/ranked
  fighters matched on loved tokens; loader has the rec-pool query).
- Kind-diversity quota: max 2 per kind group in the final list
  (`MAX_PER_KIND`, `pickDiverse` in index.ts), fighter-axis kinds share one
  bucket, community kinds another. No backfill.
- Harness (`tasteProfile.test.ts`, run via `npx tsx`) updated to all of the
  above and passing. Pilot runner output vs avocadomike approved-ish: 2
  prefers / 2 fighter-love / 2 rates-high / 2 fighter-axis / 1 cold / 1
  community.
- Fan DNA surfaces seeded: `activity/fan-dna` shows taste insights as
  "EARLY READ" when trait cards are empty; Profile row shows
  "Early read: <top headline>" when no personality type yet.

## NOT yet verified on device (start of next session = walk these)

**Rounds 4-5 changes are unwalked** (Mike reported the issues; fixes shipped
after). Walk and confirm:
- **Heatmap stars** on rate-classics (row climbs grey→gold→red, big wheel
  star takes the score color) feel right.
- **Skip behavior**: skips don't advance the "X of 10" counter; counter
  starts at "0 of 10"; "Skip this" appears below Continue after 5 skips.
- **Follow-fighters lazy load**: scrolling the grid pulls more fighters (24
  per page); footer spinner shows; search still works.
- **Profile → My Hype → "Upcoming Events"** link lands on the upcoming events
  tab, not home. (Link is in the *no-hype* empty state — verify on an account
  with 0 hype, or check the wording matches what Mike meant.)
- **Insight mix on the real fresh tester**: `testdev+onb0612` now has 10
  ratings (Mike's last walk landed there). With ~10 ratings + follows expect
  the bias card, maybe 1 prefers pair, era-lean if the stack spans 2015,
  fighter-axis/rec cards. Verify de-numbered sublines read human and nothing
  comes up empty. The old "57 fights" subline was from rating on a
  history-heavy account, NOT the tester — confirm a true-new-user n is small.

## Open items / round-4 candidates

- **Upcoming-fight recommendations** (Mike's ask, deferred as a bigger
  build): "you might like Pereira vs Gane, expected to be a striking
  battle" — needs pre-fight enrichment matching + spoiler-safe payload;
  belongs on the Home rail as much as onboarding. Decision pending from
  Mike: build as a shared card type next session?
- Prune `prefers` headline variants once Mike reacts to them in the wild
  ("Your heart picks X, not Y" vs "Given the choice: X").
- Brainstorm bench (offered, not built): hype-honesty card, era lean,
  org/weight-class lean, perfect-10s recap card, taste-twin (needs scale).
- Earlier batch, still parked: rematch dim (derivable, no flag) and
  American-fighters dim (NO nationality column — needs schema work at
  release time).

## Session setup (unchanged, see playbook)

Backend `PORT=3008 pnpm dev` from packages/backend (nodemon, auto-restarts);
Expo `npx expo start --port 8083 --lan` from packages/mobile; device calls
`10.0.0.51:3008` (`services/api.ts`). Port-orphan gotcha: if a change
"didn't take", `npx --yes kill-port 3008`, confirm `/health` dead, restart.
Tester: `testdev+onb0612@goodfights.app` / `Testpass1!`; reset with
`npx tsx src/scripts/reset-onboarding-tester.ts --email <tester>` (now also
unwinds hype predictions). Dev replay: Profile → "Replay Onboarding (dev)".

## Standing guardrails

- NO `prisma migrate dev`/`db push`/`diff`/`reset` — ever. No migrations on
  this branch.
- NO `new PrismaClient()` — use the `lib/prisma` singleton, scripts too.
- No leaderboards/gamification; silence > filler (the new kinds all carry
  floors — don't relax them to fill a short list); spoiler-safe everywhere;
  never derive `followedAt`.
- `GOOD FIGHTS - APP*.txt` in repo root = plaintext credentials, untracked —
  never commit.
