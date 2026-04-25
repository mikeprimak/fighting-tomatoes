# 0002: Google OAuth split across two GCP projects (Android = old, iOS = new)

**Date:** 2026-04-25
**Area:** mobile / infra
**Status:** accepted

## Context

We have two Google Cloud projects that have accumulated OAuth clients for this app over time:

- **`fight-app-ba5cd`** (project number `1082468109842`) — the original project. Hosts FCM push notifications. Has an Android OAuth client correctly registered with the Play Store **app signing key** SHA-1 (`D8:FA:1B:B6:EA:EA:64:0D:53:2A:C6:64:89:C0:77:AD:10:FC:DE:59`).
- **`good-fights-app`** (project number `499367908516`) — created later, now hosts the iOS OAuth client + the iOS URL scheme baked into the shipped iOS binary. Also has an Android OAuth client, but it was registered with the **upload key** SHA-1 instead of the app signing key, so Android sign-in fails against it with `DEVELOPER_ERROR`.

On 2026-04-18 we tried to consolidate everything onto `good-fights-app`. iOS sign-in started working, but Android broke (silently, because the chain of refresh tokens kept users logged in for ~5 days). Bug surfaced on 2026-04-25 when refresh tokens started expiring.

Path A (fix it on the GCP side) was blocked: Google enforces `(package_name, SHA-1)` uniqueness **globally across all GCP projects**. The Android app's package + app-signing-SHA-1 combo is already registered to the OAuth client in `fight-app-ba5cd`. To put it on `good-fights-app` we'd have to delete the old registration first. Doing so would break sign-in for anyone still on a pre-versionCode-36 app version (small but non-zero population).

## Decision

Split the OAuth clients across the two projects:

- Android (`webClientId` in `hooks/useGoogleAuth.ts`) → `1082468109842-pehb...` from **fight-app-ba5cd**
- iOS (`iosClientId` in `hooks/useGoogleAuth.ts`) → `499367908516-j03p...` from **good-fights-app**
- Backend `GOOGLE_CLIENT_ID` env on Render lists both audiences as a comma-separated list, parsed by `getGoogleAudiences()`.

This is intentional and not a temporary state.

## Alternatives Considered

1. **Consolidate on the new project (`good-fights-app`).** Blocked by GCP's global SHA-1 uniqueness constraint. Workable only by deleting the old project's Android OAuth client first, which has user-facing risk.
2. **Consolidate on the old project (`fight-app-ba5cd`).** Would require regenerating the iOS URL scheme and pushing a new iOS binary through Apple review. High effort, no real benefit over the current split.
3. **Stay all-new-project (the broken 4/18 state).** Rejected because Android sign-in is broken.

## Consequences

- **Two GCP projects are both load-bearing for production sign-in** — neither can be deleted or have its Android/iOS OAuth client touched without breaking real users.
- **Render env `GOOGLE_CLIENT_ID` must keep both audiences.** If a future cleanup pass tries to "simplify" by dropping the older `1082468109842-pehb...` value, it will silently break ALL Android sign-ins. There is a stale memory file from 2026-04-20 saying to drop it on 2026-05-10 — that is no longer correct.
- **`google-services.json`** still references the old project (`project_number: 1082468109842`). This is consistent with FCM also being on the old project. Don't regenerate.
- **Future option** (low priority): delete the old project's Android OAuth client, register the app signing SHA-1 on the new project's Android OAuth client, OTA back to all-new-project. Only worth doing if we ever want to retire the old GCP project entirely (which also requires migrating FCM).

## Related

- `docs/daily/2026-04-25.md` — incident timeline + fix
- `docs/daily/2026-04-18.md` — the 4/18 OAuth cleanup that introduced the latent bug
- `docs/areas/mobile.md` § "Google Sign-In OAuth clients"
