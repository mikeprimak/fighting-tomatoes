# Handoff — Next session, 2026-05-17

Session 2026-05-16 (continued from earlier same-day session) iterated on Fan DNA Phase 1 in production. End-of-session state: backend fully deployed, mobile changes pushed to `main` but **not OTA-shipped** and the most recent commit **was not tested by Mike** before he asked for this handoff.

When picking this up: read this doc, summarize the open items, **confirm with Mike whether the untested commit (91582c9) works on his device** before doing anything else. If it broke something he'll want a fix; if it's fine he'll want to OTA-ship.

## Ranked plan for next session

**1. Test commit `91582c9` (untested by Mike at end of session)** — ~10 min
Hot-reload Expo and verify:
- Hyping an upcoming fight: spinner appears in the DNA slot while the mutation is in flight, swaps to the line when it arrives. No second fade of the whole modal.
- Rating a completed fight: same.
- DNA line + comparison line render in `colors.textSecondary` (proper grey), not white.
- First-rater scenario: rate a fight where you're the only rater, close, reopen, change rating → distribution chart shows ONLY the new rating, not both old + new.

If anything fails, see "Risks below" for diagnostics.

**2. OTA-ship the mobile Fan DNA stack (`eas update --branch production`)** — ~5 min, requires Mike's OK
Once #1 passes. Channel `production`, branch `production`, runtime is `appVersion` on iOS and `1.0.0` on Android. The currently-installed production binary supports this OTA (no native code changes since the last build).

**3. AI preview WIP — still paused per 2026-05-16 earlier handoff**
The WIP hunks in `packages/mobile/components/UpcomingFightModal.tsx` (full-text aiPreviewShort under fighter row + `aiPreviewShort` style) and `packages/mobile/components/fight-cards/UpcomingFightCard.tsx` (`numberOfLines: 1` + padding tweaks) are still uncommitted in working tree. Don't ship without revisiting per the prior handoff's phrasing / placement concerns. Leave them in the working tree.

**4. AI enrichment cron (still queued from prior handoff)** — ~3-4 hr
Untouched this session. UFC White House Jun 15 is the deadline.

## What shipped this session (all in production on Render + on `main`)

| Commit | What |
|---|---|
| `44143fe` | trailblazer trait + first-rater comparison text + reveal-modal silent-close bug + parent-modal-hides-on-reveal + org-affinity copy with "fights {verb}" |
| `ea7093c` | Split reveal modal useEffect so DNA arriving async doesn't re-fade the whole modal (the "modal opens twice" bug from Adriano Moraes vs Phumi Nkuta test) |
| `9745a70` | Comparison + DNA line both at `opacity: 0.7` for title-grey (turned out to be the wrong fix — see 91582c9) |
| `91582c9` | **UNTESTED.** ActivityIndicator placeholder for in-flight DNA line. DNA color switched to `colors.textSecondary` (animated opacity was overriding stylesheet opacity once the fade completed → text rendered full-white). First-rater stale-snapshot fix via `wasVisibleRef` so `previousRatingRef` resets on every modal open, not just fight.id changes. |

Backend has all 4 Fan DNA traits registered: `hype-accuracy`, `org-affinity`, `rating-bias`, `trailblazer`. Verify via `GET https://fightcrewapp-backend.onrender.com/api/fan-dna/health`.

## Working tree state

Uncommitted (intentional — do NOT commit until item #3 above is decided):
- `packages/mobile/components/UpcomingFightModal.tsx` — AI preview short JSX block + `aiPreviewShort` style entry
- `packages/mobile/components/fight-cards/UpcomingFightCard.tsx` — `numberOfLines: 1` + padding tweak

These were temp-stripped, committed-around, and restored each time a Fan DNA commit went out today. The pattern: edit to remove WIP → stage → commit → push → edit to restore WIP. Repeat for next commit. Mike has not pushed back on this approach.

## Risks / things that might bite

- **Spinner edge case I didn't validate:** if the mutation onSuccess fires *before* `revealVisible` is set to true (very fast network), the dnaLine state is set but the modal hasn't opened yet. The `dnaLoading` prop computes `mutation.isPending && !revealDnaLine`. If both are false at open, no spinner — correct behaviour. Worth confirming with a hard-tap-Done sequence.
- **wasVisibleRef edge case:** the `else if (!visible)` branch only fires when visible is explicitly false. If `fight` becomes null while `visible` stays true (e.g. parent passes `fight={null}`), wasVisibleRef stays true. Probably impossible in practice (CompletedFightModal returns `null` if `!fight`), but watch for it.
- **ActivityIndicator height:** I sized `dnaLoading` to `height: 19, marginTop: 14` to roughly match a single line of dnaLine. If the modal still reflows when the line lands, increase the height or wrap in a fixed-height View.
- **Comparison line `opacity: 0.7`:** still in the stylesheet from commit `9745a70`. Not currently overridden by an animated opacity (comparison is a plain Text), so `0.7` is applied. If Mike wants comparison closer to textSecondary, switch its color too.

## Memory worth saving after this session resolves

Pending Mike's verification of `91582c9`:
- New memory: "Fan DNA Phase 1 surfaces in reveal modals (rate + hype). Loading spinner placeholder pattern; DNA color uses textSecondary, not opacity. Stale-snapshot bug fixed via wasVisibleRef on CompletedFightModal."
- Update `project_ai_enrichment_phase1_shipped.md` if appropriate — or open a new `project_fan_dna_phase1_shipped.md` since Fan DNA is its own workstream distinct from AI enrichment (per prior handoff's consolidation note).

## Open follow-ups (deferred — no work pending)

- Tier 2 LLM-generated DNA copy (Phase 2) — design in prior 2026-05-16 handoff, gated on Phase 1 settling.
- Profile Fan DNA full-screen section (Phase 3) — same.
- Brand voice doc at `docs/brand/voice.md` — still not written. Worms-tone rules live only in the prior handoff doc and in copy.ts files.
- Post-fight scrape architecture (Tier 3 enabler) — prior handoff item, untouched.
