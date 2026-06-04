# HANDOFF — Vercel web auto-deploy stopped firing (2026-06-04)

**Status:** RESOLVED — misdiagnosis. Auto-deploy was never broken. Do NOT
reconnect the Git integration; it is intact and working.

## RESOLUTION (2026-06-04, fresh investigation)

Verified live: the push of `29afb04` (a real `packages/web` change) at 08:21:00
triggered a production build at 08:21:06 that went Ready and aliased to
**goodfights.app** carrying the alias
`https://web-git-main-michael-primaks-projects.vercel.app`. That `web-git-main-…`
branch alias is assigned **only** to Git-push-triggered deployments — a manual CLI
deploy never gets it. So the GitHub→Vercel webhook and Git link are demonstrably
live.

**Why the original diagnosis was wrong.** The "three commits, none auto-deployed"
list mixed two kinds of commit:

- `25909d8` (`docs(video):…`) and `6b78b5c` (`docs: log daily…`) **do not touch
  `packages/web`.** The project's `ignoreCommand` (`packages/web/vercel.json`):
  `git diff HEAD^ HEAD --quiet ./` runs from the root dir `packages/web` and
  **correctly skips** any commit that didn't change web files → those are the
  expected ~14s **"Canceled"** rows (Ignored Build Step working as designed).
- Only `a7a5ede` was a real web commit. It was manually deployed before the auto
  build was confirmed, and the expected Canceled docs-commit rows were
  misread as "webhook didn't fire." There was never any evidence the Git link
  was disconnected (the `/v9/projects` `link` check in the original handoff could
  not be completed — the cached CLI API token was expired, so any "link: null"
  reading from raw curl is a stale-token error, not a real disconnection).

**Action required: none.** The manual CLI deploy in the original session was
harmless but unnecessary. Pushes to `main` that touch `packages/web` auto-deploy
to goodfights.app within seconds; pushes that don't touch web are intentionally
Canceled by the Ignored Build Step.

---

## ORIGINAL (incorrect) diagnosis below — kept for the record

**Status:** Open. Needs someone to reconnect / repair the GitHub→Vercel
integration on the `web` project. Not fixed in this session (worked around with a
manual CLI deploy).

## Symptom

Pushes to `main` no longer trigger a Vercel production build for `packages/web`
(prod = **goodfights.app**, project `michael-primaks-projects/web`). The dashboard
showed **no "Building" row appear** after a push, and the newest deployment was
~14h stale.

## Evidence captured

- Tip of `main` at the time: `a7a5ede` (the new web Home screen).
- Commits `25909d8` and `6b78b5c` sat between the last auto-deployed commit and
  `a7a5ede` — **three commits, none auto-deployed.**
- `vercel ls --prod` showed the newest production deploy was `281b4b4`, ~14h old.
  Many recent rows were ~14s **"Canceled"** (that's the Ignored-Build-Step killing
  non-web commits — expected). The problem is different: for the *web* commits
  above, **no deployment row was ever created**, i.e. the webhook didn't fire.

This matches two prior known failure modes (see memory / past handoffs):
- Webhook silently drops a web commit.
- Project Git integration is disconnected, so pushes never reach Vercel.

## What to check (root cause)

1. **Git link status (read-only):** `GET https://api.vercel.com/v9/projects/<projectId>`
   and look for a populated `link` object. A missing/empty `link` means the repo
   is disconnected → reconnect GitHub in the project's **Settings → Git**.
   (Precedent: the `web` project was silently unlinked for 33 days once before.)
2. If linked, check the **GitHub App** install (repo `mikeprimak/fighting-tomatoes`)
   still grants Vercel access, and the webhook deliveries in GitHub repo settings
   are succeeding (not 4xx/5xx).
3. After reconnecting, push a trivial web change and confirm a build starts within
   seconds.

## Workaround used this session (to get `a7a5ede` live)

Manual CLI deploy from `packages/web`. Notes for whoever retries:
- `vercel --prod --yes --archive=tgz` first attempt failed with a Vercel files-API
  **500** (`Unexpected token 'I', "Internal S"...`) and was bundling a **910MB**
  upload — `--archive=tgz` appears to tar the local `.next` (583M) despite it being
  gitignored. Deleting `packages/web/.next` first cuts the bulk.
- The CLI then printed repeated `Error: Upload aborted` retries, but a deployment of
  `a7a5ede` **did complete server-side** and promoted to Production (Ready, ~1m).
  Verify in the dashboard rather than trusting the CLI exit code.

## Related memory / history

- "Vercel 'stuck' can mean no Git repo connected" — check `/v9/projects/{id}` `link`.
- "Two reasons a web deploy won't fire" — IBS cancels non-web commits vs webhook
  drops a web commit; recover with a real web change.
- "Vercel 'Redeploy' rebuilds the original commit" — don't rely on dashboard
  Redeploy to ship new code; use a CLI deploy or fix the webhook.
- "Never run `vercel` from the monorepo root" — always `cd packages/web` first.
