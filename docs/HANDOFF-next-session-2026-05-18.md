# Handoff — Next session, 2026-05-18

Session 2026-05-17 built the Fan DNA "peek" endpoint to kill the spinner-then-load delay on the reveal modal. **All edits are in working tree, uncommitted, untested.** Mike had to restart his computer before testing.

## What to do first

1. Read this doc.
2. Confirm Mike still wants to push this work (the goal: reveal modal opens with the DNA line already populated — no spinner, no swap-in).
3. Start backend + mobile (commands below), test, then commit + push + OTA-ship.

## What's in the working tree

**Backend (uncommitted)**
- `packages/backend/src/services/fanDNA/engine.ts` — `eventEvaluate` gains optional `peek?: boolean`. Same trait scoring + line picking, but skips every `recordImpression` write when peek=true. New exported helper `recordCommittedDNALine(args)` records the impression for a line that was previously chosen by peek.
- `packages/backend/src/routes/fanDNA.ts` — new route `GET /api/fan-dna/peek?action=X&surface=Y&fightId=Z`. Loops values 1-10 in `Promise.all`, returns `{ lines: Array<DNALine|null> }` of length 10 indexed by `value - 1`.
- `packages/backend/src/routes/fights.ts` — `UpdateUserDataSchema` + `CreatePredictionSchema` gain optional `dnaCommittedLine`. Rate + hype handlers: if `dnaCommittedLine` present → call new `commitPrePeekedDNA` (records impression for peeked line, echoes line back as `fanDNA` in response). If absent → fall through to existing `evaluateFanDNAInline`. Existing flow is preserved as a fallback.

**Mobile (uncommitted)**
- `packages/mobile/services/api.ts` — new exported type `FanDNACommittedLine`. `updateFightUserData` + `createFightPrediction` accept optional `dnaCommittedLine`. New method `getFanDNAPeek({ action, surface, fightId })`.
- `packages/mobile/components/UpcomingFightModal.tsx` — `useQuery` for peek (key `['fanDNAPeek', 'hype', fight.id]`, staleTime 60s) fires on modal open for authenticated users. `handleHypeSelection` reads `peekedDna.lines[level-1]` and `setRevealDnaLine` eagerly; passes the same line to `hypeMutation.mutate({ hypeLevel, dnaCommittedLine })`. `onSuccess` only overwrites `revealDnaLine` from server when no `dnaCommittedLine` was sent (fallback path). `dnaLoading` flips to false once peek loaded.
- `packages/mobile/components/CompletedFightModal.tsx` — mirror of above for rate.

Type-check on every changed file: zero errors.

## Other working-tree state (not part of this session — leave alone)

Still uncommitted, still paused per the 2026-05-16 handoff (phrasing/placement concerns):
- `packages/mobile/components/UpcomingFightModal.tsx` — AI preview short JSX block + `aiPreviewShort` style entry (separate hunk from the peek wiring)
- `packages/mobile/components/fight-cards/UpcomingFightCard.tsx` — `numberOfLines: 1` + padding tweak

When committing the peek work: stage **only the peek-related hunks** in `UpcomingFightModal.tsx` and leave the AI preview hunks unstaged. Same temp-strip pattern Mike's been using all week.

## Test plan

1. Start backend (must restart — new route):
   ```
   cd packages/backend && PORT=3008 pnpm dev
   ```
2. Start mobile:
   ```
   cd packages/mobile && npx expo start --port 8083 --lan
   ```
3. Open a fight on the device. Watch backend logs: a `GET /api/fan-dna/peek` should fire once when the rate/hype modal opens.
4. Pick a value. The reveal modal should open with the DNA line ALREADY rendered, no spinner.
5. Tap a different value (without closing the modal in between). Tap again. The DNA line shown on the next Done should match the latest tapped value.
6. Pick a value where the engine has nothing to say (or a fight in EXIT-quiet). Modal should show no DNA line, no spinner.
7. Confirm there's no visible regression on the existing "Hype submitted!" / "Rating submitted!" reveal animations, distribution chart, comparison line, or Close button.

If anything's broken, fall-through to the old spinner path is the fallback — the dnaLoading prop still gates the spinner on `!peekedDna`, so a failed/slow peek query reverts to current behavior.

## After test passes

1. Commit backend hunks first (single commit): `engine.ts`, `routes/fanDNA.ts`, `routes/fights.ts`.
2. Commit mobile hunks (separate commit): `services/api.ts`, `components/UpcomingFightModal.tsx` peek hunks only, `components/CompletedFightModal.tsx`.
3. `git push` — backend auto-deploys to Render. Wait ~2 min, verify with:
   ```
   curl -i https://fightcrewapp-backend.onrender.com/api/fan-dna/peek?action=rate&surface=rate-reveal-modal&fightId=<some-uuid> -H "Authorization: Bearer <token>"
   ```
   Expect HTTP 200 + `{ lines: [...] }`.
4. Ask Mike for OK to `eas update --branch production` for mobile (channel production, runtime is `appVersion` on iOS and `1.0.0` on Android — current store builds support this OTA).

## Subtle design decisions captured (so future-you doesn't re-litigate)

- **Peek does NOT update the toggle-storm counter.** The engine counts `dNALineImpression` rows in a window; peek doesn't write any, so opening the modal repeatedly without committing doesn't push the user toward META/EXIT. Correct behavior.
- **Commit records the exact peeked lineKey.** Cooldown semantics only work if displayed line == committed line. Re-running `eventEvaluate` on commit would randomly pick a different line from the fresh pool and break this. That's the whole reason `dnaCommittedLine` exists.
- **No `dnaCommittedLine` validation on the server.** Trust the authenticated client. Worst case a malicious user spoofs a lineKey and their own ledger records something fake. Self-harm only, low value.
- **No shared user-context optimization.** Each peek call runs 10 sequential `eventEvaluate` (in `Promise.all`). Worst-case ~80 small indexed queries on Render PG. The user's 3-15 second selection window absorbs this. Optimize only if latency measures show we need it.

## Open follow-ups (not this session's scope)

- The `ActivityIndicator` fallback in `HypeRevealModal` + `RatingRevealModal` is now rarely-hit. Could be deleted entirely once peek reliability is established (a few weeks of prod data).
- Untested commit `91582c9` (the prior session's spinner-placeholder + grey-color + first-rater-fix) is effectively obsoleted by this work. Don't re-test it separately — peek covers the user-visible regression it was trying to fix.
- AI enrichment cron still queued (UFC White House Jun 15 deadline).
- AI preview WIP in `UpcomingFightModal` + `UpcomingFightCard` still paused per prior handoff.

## Files in this session's edits

```
packages/backend/src/services/fanDNA/engine.ts
packages/backend/src/routes/fanDNA.ts
packages/backend/src/routes/fights.ts
packages/mobile/services/api.ts
packages/mobile/components/UpcomingFightModal.tsx
packages/mobile/components/CompletedFightModal.tsx
docs/daily/2026-05-17.md
docs/areas/rewarding-users.md
docs/HANDOFF-next-session-2026-05-18.md  ← this file
```

Memory worth saving after this lands in prod: a `project_fan_dna_peek_shipped.md` entry capturing the architecture (peek-then-commit pattern, why we don't re-evaluate on commit, why the toggle-storm counter intentionally ignores peeks).
