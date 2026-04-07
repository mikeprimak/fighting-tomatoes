# Documentation System

## Structure

```
docs/
  daily/          <- One file per work day (what you did)
  areas/          <- Living docs per project area (current state of X)
  decisions/      <- Short records of non-obvious choices
```

## How to Use

### Daily Logs (`daily/YYYY-MM-DD.md`)

Create one at the start or end of each work session. Use the template below.
These are append-only — don't edit old ones. They're your history.

**Template:**
```markdown
# YYYY-MM-DD

## What I Worked On
- [ ] Task 1 (area: mobile/backend/web/landing/scrapers/infra)
- [x] Task 2

## Changes Made
### [Area]: Short description
- What changed and why
- Files modified (key ones only)
- Commit: `abc1234`

## Unfinished / Next Time
- What's left to do
- Blockers or open questions

## Notes
- Anything surprising, learned, or worth remembering
```

### Area Docs (`areas/<area>.md`)

These are **living documents** — update them as the area changes. They answer: "What is the current state of X?"

Current areas:
- `mobile.md` — App features, current version, store status, known issues
- `backend.md` — API, database, scrapers, deployment, cron jobs
- `web.md` — Next.js web app status
- `landing.md` — goodfights.app landing page
- `scrapers.md` — All scrapers, what they cover, automation status
- `infra.md` — Render, Vercel, GitHub Actions, EAS, R2

Don't duplicate what's in CLAUDE.md — these go deeper on current state and known issues.

### Decision Records (`decisions/NNNN-short-title.md`)

For choices that aren't obvious from the code. One file per decision.

**Template:**
```markdown
# NNNN: Short Title

**Date:** YYYY-MM-DD
**Area:** mobile / backend / web / infra
**Status:** accepted / superseded by NNNN

## Context
What situation prompted this decision?

## Decision
What did we decide?

## Alternatives Considered
What else was on the table and why didn't we pick it?

## Consequences
What follows from this decision?
```

## Tips

- **Daily logs**: Write them even if short. "Fixed a CSS bug on landing page" is better than nothing.
- **Area docs**: Skim before starting work in an area. Update after finishing.
- **Decisions**: Only write these for things you'd forget the reasoning behind. Most days you won't need one.
- **Don't over-document**: If it's in the code, the commit message, or CLAUDE.md, it doesn't need to be here too.
