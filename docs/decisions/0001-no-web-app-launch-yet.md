# 0001: Don't link web app from landing page yet

**Date:** 2026-04-06
**Area:** web / landing
**Status:** accepted

## Context
The Next.js web app at web-jet-gamma-12.vercel.app is functional (29 routes, SSR, dark theme) but has a generic Vercel URL and hasn't been reviewed for public launch.

## Decision
Don't link to the web app from the goodfights.app landing page. Focus landing page purely on mobile app downloads.

## Alternatives Considered
- Link to web app as a secondary option — rejected because it would split attention from app downloads and the web URL isn't branded yet.

## Consequences
- Landing page is simpler and focused on conversions (app downloads)
- Web app continues to exist but isn't discoverable unless you know the URL
- When ready to launch web, will need to: set up custom domain, add link to landing page, possibly rethink landing page as web app homepage
