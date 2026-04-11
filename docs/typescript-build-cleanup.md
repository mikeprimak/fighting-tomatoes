# Backend TypeScript Build Cleanup — Working Notes

> **STATUS: COMPLETED 2026-04-11 (late-night session)** — 81 errors → 0, build script `|| true` removed, `tsconfig.tracker.json` collapsed. See `docs/daily/2026-04-11.md` "Late-night session: backend TypeScript build cleanup" for the actual fix log and current state. See `docs/areas/backend.md` "Build & type-check" for the durable post-cleanup documentation.
>
> **Keep this file as a historical record.** Two of its four pile diagnoses were wrong and only got corrected during the fix:
> - **Pile A1** said "augment `FastifySchema` via module augmentation" but didn't mention that `FastifySchema` lives in `fastify/types/schema`, not the root `fastify` module. Augmenting `declare module 'fastify'` silently no-ops.
> - **Pile A2** called all 35 TS2345 errors a Fastify `reply.send()` generic-inference regression. They're not — every site is `request.log.error(msg, err)`, and the root cause is Pino 9's template-literal `ParseLogFnArgs<TMsg>` typing rest args as `never` when the message has no `%s` placeholders. The idiomatic fix is swapping to `log.error(err, msg)`.
>
> Leaving the original wrong diagnoses visible as a record of why the first hypothesis was wrong.

---

**Written 2026-04-11 for a follow-up session.** Snapshot of the current state of the broken backend type-check and a proposed order of attack. Read this brief in full before touching anything — each of the four piles has nuance.

---

## TL;DR

`packages/backend/package.json`'s `build` script ends with `|| true`, which silently swallows TypeScript errors. As a result, Render has been deploying successfully for months despite a broken `tsc`, and every Claude session has had to dismiss "unrelated TS errors" when helping with work.

Current state: **81 errors across 6 files, under `tsconfig.production.json`**, grouped into four root causes. Nothing is on fire (all errors are type-level, not runtime), but you can't trust the type-checker as a guardrail until this is cleaned up.

**Goal of the cleanup session:**
1. Fix the four error piles.
2. Remove `|| true` from the build script so future errors are loud.
3. Collapse the `tsconfig.tracker.json` workaround if possible (it exists only because the ONE FC live tracker couldn't build under the broken main tsconfig).

---

## How to reproduce the error list

```bash
cd packages/backend
npx tsc --noEmit -p tsconfig.production.json
```

As of 2026-04-11 17:45 UTC this outputs **81 errors**. Shape:

| Error code | Count | Meaning |
|---|---|---|
| TS2345 | 35 | `Argument of type 'any' is not assignable to parameter of type 'never'` — Fastify `reply.send(...)` narrowing |
| TS2353 | 19 | `'description' does not exist in type 'FastifySchema'` — route-level OpenAPI schemas |
| TS2339 | 14 | `Property '...' does not exist on type 'unknown'` — ONE FC live scraper DOM types |
| TS2304 | 7 | `Cannot find name 'HTMLAnchorElement' / 'HTMLImageElement' / 'Element'` — same file, missing DOM lib |
| TS2584 | 5 | `Cannot find name 'document'. Try changing the 'lib' compiler option to include 'dom'` — same file |
| TS2307 | 1 | `Cannot find module '../utils/prisma'` — `newsScraperService.ts` broken import |

Distribution by file:

| File | Errors | Category |
|---|---|---|
| `src/routes/auth.fastify.ts` | 32 | Pile A (Fastify schemas + reply.send) |
| `src/services/oneFCLiveScraper.ts` | 26 | Pile C (DOM types) |
| `src/routes/index.ts` | 13 | Pile A (reply.send only) |
| `src/routes/news.ts` | 8 | Pile A |
| `src/routes/feedback.ts` | 1 | Pile A |
| `src/services/newsScraperService.ts` | 1 | Pile B (missing import) |

---

## The four piles

### Pile A — Fastify route types (54 errors, 4 files)

Two intertwined TypeScript regressions from Fastify's type system. Both are mechanical to fix but live in a lot of route files.

#### A1: `description` not in `FastifySchema` (19 × TS2353)

```ts
fastify.post('/login', {
  schema: {
    description: 'Log in a user',  // ❌ TS2353
    tags: ['auth'],
    body: { ... },
  },
}, handler);
```

In the current `@fastify/*` version, the top-level `description` field on `FastifySchema` moved or was removed. Two likely fixes:

- **Option 1 (minimal):** delete the `description` field from every route schema. Visible in Swagger/OpenAPI output, but the app doesn't expose one right now, so the loss is cosmetic.
- **Option 2 (correct):** wrap each schema with `as FastifySchema & { description?: string }` or use a module-augmented `FastifySchema` that re-adds `description` + `summary` + `tags` fields (Fastify's convention is to put OpenAPI extensions under a separate namespace, often `@fastify/swagger`'s type).

Before choosing, check whether `@fastify/swagger` is installed and what version — it may provide its own schema-extension types.

Files: `auth.fastify.ts` (12 occurrences), `news.ts` (4), `feedback.ts` (1), plus any others that match (`grep -r "description:" src/routes --include "*.ts"`).

#### A2: `any` is not assignable to `never` on `reply.send()` (35 × TS2345)

```ts
return reply.send({ user, token });  // ❌ TS2345
```

This is a Fastify generic-inference regression. When a route has no `Reply` generic, Fastify is inferring the reply body as `never` (probably because the `schema.response` is missing or not typed to match). Three common fixes:

- **Option 1 (fastest):** give each route a `Reply` generic:
  ```ts
  fastify.post<{ Body: LoginBody; Reply: { user: User; token: string } }>(...)
  ```
- **Option 2 (systemic):** add a typed `response` schema to each route's `schema` object and let Fastify infer. Pairs nicely with A1 cleanup.
- **Option 3 (escape hatch):** `return reply.send({ ... } as any)` — works immediately, ugly.

Given the volume (35 sites), **Option 1 or 3 is likely the fastest path**; Option 2 is the "right" answer but couples to A1 resolution.

Files: `auth.fastify.ts` (20), `index.ts` (13), `news.ts` (4).

### Pile B — `newsScraperService.ts` missing import (1 error)

```
src/services/newsScraperService.ts(5,24): error TS2307: Cannot find module '../utils/prisma' or its corresponding type declarations.
```

Trivial. Check if `src/utils/prisma.ts` exists; if not, either create it (re-exporting a Prisma client) or rewrite the import to point at wherever the Prisma client actually lives in this project (`src/lib/prisma.ts`? inline `new PrismaClient()`?). Grep first:

```bash
grep -rn "import.*PrismaClient" src/services src/utils src/lib src/db 2>/dev/null
```

### Pile C — `oneFCLiveScraper.ts` DOM types (26 errors)

```
src/services/oneFCLiveScraper.ts(306,31): error TS2584: Cannot find name 'document'. ... include 'dom'.
src/services/oneFCLiveScraper.ts(376,17): error TS2339: Property 'closest' does not exist on type 'unknown'.
src/services/oneFCLiveScraper.ts(380,60): error TS2304: Cannot find name 'HTMLAnchorElement'.
```

This file uses Puppeteer's `page.evaluate(() => { document.querySelectorAll(...) })` pattern — the callback runs inside a browser context, so it references DOM globals like `document`, `Element`, `HTMLAnchorElement`. Those types exist in `lib.dom.d.ts` but are **disabled** in the default Node.js tsconfig.

The current workaround (`tsconfig.tracker.json`) explicitly sets `"lib": ["ES2020", "DOM"]` and is already scoped to include this file, so it passes under the tracker config — but under `tsconfig.production.json` (which is what `pnpm build` uses), the DOM lib is not enabled, so the file fails.

**Two approaches:**

- **Approach 1 — add DOM lib to the main tsconfig.** Simplest fix: edit `tsconfig.production.json` (or the base `tsconfig.json` it extends) to include `"lib": ["ES2020", "DOM"]`. Downside: every file gets DOM globals available, increasing the risk of someone accidentally using `document` in a Node-only file.
- **Approach 2 — keep DOM globals out of Node files, type the scraper locally.** Use triple-slash directives or inline types. Something like:
  ```ts
  // at top of oneFCLiveScraper.ts
  /// <reference lib="dom" />
  ```
  Or declare the `page.evaluate` callback's return type explicitly and cast document inside.

**Recommendation: Approach 1.** The ergonomic cost of accidentally using `document` is low (ESLint can catch it, and Puppeteer callbacks are the only legitimate place it should appear in backend code). It also collapses the `tsconfig.tracker.json` workaround into just "the tracker builds the same as everything else," which is net simpler.

If you choose Approach 1, after fixing: try deleting `tsconfig.tracker.json` entirely and pointing the live-tracker workflows back at normal `pnpm build`. Then verify each live-tracker CI pipeline still passes.

### Pile D — (none)

Earlier session notes mentioned `fighterMatcher.ts` dead `FighterAlias` code as a fourth pile, but the current type-check output has **no errors** in that file — it must have already been cleaned up, or it's currently `@ts-nocheck`'d. Worth a grep:

```bash
grep -n "@ts-nocheck" src/utils/fighterMatcher.ts
```

If `@ts-nocheck` is present, consider removing it while you're in the neighborhood so the type-checker regains coverage.

---

## Suggested order of attack

1. **Snapshot** — run `npx tsc --noEmit -p tsconfig.production.json 2>&1 | tee /tmp/ts-before.txt` and save the full error list so you can diff as you go.
2. **Pile B first** (1 error, 5 minutes) — easy win, clears noise before tackling the bigger piles.
3. **Pile C** (26 errors, 15 minutes if Approach 1) — collapses the tracker tsconfig workaround, removes clutter from the error list, and proves the DOM lib approach works. After this, retry the tracker build via `pnpm build` and verify.
4. **Pile A2** (35 errors, 30–60 minutes) — the `reply.send` fixes are mechanical once you pick an approach. Do one file end-to-end first to validate the approach before fanning out.
5. **Pile A1** (19 errors, 15 minutes) — likely resolvable with a single module augmentation or a find-and-delete.
6. **Remove `|| true`** from `package.json:8`:
   ```json
   "build": "prisma generate && tsc --project tsconfig.production.json"
   ```
   Also drop `--noEmitOnError false` — the default (`true`) is what you want now that the errors are real.
7. **Final snapshot** — rerun the type-check, confirm zero errors, commit.
8. **Deploy check** — push to main and watch Render's build log. If the build now fails on something you missed, `|| true` would have silenced it; don't add it back, fix the new error.

---

## Constraints & gotchas

- **`noEmitOnError false` in the current build script** means TypeScript was emitting `dist/` output even when type-checking failed. That's how Render has been running for months. After removing `|| true`, decide whether you also want `noEmitOnError` back to `true` (fail the build) or leave it `false` (keep deploying on type errors but at least the CI step fails loudly). Recommendation: `true` — make it loud.
- **Tracker tsconfig's `exclude` list** (in `tsconfig.production.json`) references files like `src/routes/auth.ts`, `src/routes/events.routes.ts`, etc. These may or may not still exist — some might be ghosts from a past refactor. Grep for each `exclude` entry to confirm it's real; delete stale entries once verified.
- **`cp src/services/*.js dist/services/`** in the build script is load-bearing — it copies the `.js` scrapers (scrapeTopRankTapology.js, etc.) into `dist/` where GH Actions workflows run them. Don't break this while cleaning up the build script.
- **`strict: false`** is set in `tsconfig.production.json`. Fixing these errors gets the build to 0 errors under **non-strict** mode. Turning on strict mode is a much bigger lift (hundreds more errors) and is not part of this cleanup — resist scope creep.
- **Do NOT `@ts-ignore` your way through this.** The whole point is making the type-checker trustworthy again. If a specific line genuinely needs a suppression, use `@ts-expect-error` with a comment explaining why, so it self-documents and fails if the underlying error disappears.

---

## Current build script for reference

```json
"build": "prisma generate && tsc --project tsconfig.production.json --noEmitOnError false || true && cp src/services/*.js dist/services/ 2>/dev/null || true",
```

Target state:

```json
"build": "prisma generate && tsc --project tsconfig.production.json && cp src/services/*.js dist/services/",
```

(The `2>/dev/null || true` on the `cp` is a Windows/bash compat thing — the glob may or may not match anything. If dropping it causes CI failures on empty matches, keep it. But decide deliberately, don't carry cargo-cult.)

---

## Files changed or created by this cleanup (estimate)

- `packages/backend/src/routes/auth.fastify.ts` — many small edits (Pile A)
- `packages/backend/src/routes/index.ts` — many small edits (Pile A2)
- `packages/backend/src/routes/news.ts` — many small edits (Pile A)
- `packages/backend/src/routes/feedback.ts` — 1 edit (Pile A1)
- `packages/backend/src/services/newsScraperService.ts` — 1 edit (Pile B)
- `packages/backend/src/services/oneFCLiveScraper.ts` — 0 code edits if Approach 1 for Pile C; the fix is in tsconfig
- `packages/backend/tsconfig.production.json` OR `packages/backend/tsconfig.json` — add `"lib": ["ES2020", "DOM"]` (Pile C)
- `packages/backend/tsconfig.tracker.json` — possibly delete after Pile C resolves
- `packages/backend/package.json` — remove `|| true` from build script
- `.github/workflows/*live-tracker*.yml` — if you delete `tsconfig.tracker.json`, update these to `pnpm build` instead of the tracker-specific tsc invocation

---

## What was NOT fixed in the 2026-04-11 banner-image session

The banner contamination fix (commit `da141dd`) touched only `.js` scraper files under `src/services/scrape*Tapology.js`. Those are not typechecked (they're JavaScript, and the build script just `cp`s them into `dist/`). They don't contribute to the error count and don't need to be touched in this cleanup.

---

## Quick smoke-test after cleanup

```bash
cd packages/backend

# 1. Zero type errors
npx tsc --noEmit -p tsconfig.production.json
echo "Exit: $?"   # should be 0

# 2. Full build succeeds
pnpm build
echo "Exit: $?"   # should be 0

# 3. Dev server still starts
PORT=3008 pnpm dev
# Ctrl+C after you see "server listening on 3008"

# 4. One live tracker still builds (if tsconfig.tracker.json was deleted)
node dist/scripts/runOneFCLiveTracker.js --help 2>&1 | head -5
```
