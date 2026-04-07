# Landing Page (goodfights.app)

## Overview
Static HTML/CSS site deployed on Vercel. No framework — just `index.html` and assets.

**Package:** `packages/landing/`
**URL:** https://goodfights.app
**Deploys:** Auto-deploy on push to `main` via Vercel

## Current State (Apr 6, 2026)
Full marketing landing page with:
- Hero section with vertical logo (hand + wordmark), headline, App Store + Google Play buttons
- 3 phone mockup screenshots (upcoming events, fight rating, live tracking)
- Stats bar (14+ promotions, 13,000+ fights, 66,000+ ratings, 1,400+ events)
- "What is Good Fights?" intro section with event detail screenshot
- 6-card feature grid (hype, rate, comment, notifications, live tracking, spoiler-free)
- 3 feature deep-dive sections with screenshots (hype, rating, live)
- 14 promotion logos grid (real images in `promos/`)
- How it works (3 steps)
- Community section
- Final CTA with download buttons
- Floating download button (bottom-right, full-width on mobile)
- Footer with privacy, delete account, contact links

## Key Files
| File | Purpose |
|------|---------|
| `index.html` | The entire landing page (self-contained HTML/CSS) |
| `promos/` | 16 promotion logo PNGs |
| `GOOD-FIGHTS-FULL-LOGO-VERTICAL-ALPHA.png` | Main hero logo |
| `screenshot-*.png`, `*-screenshot.png` | 7 app screenshots |
| `logo-full.png` | Horizontal wordmark (not currently used) |
| `icon.png` | Hand icon only (not currently used) |
| `privacy.html` | Privacy policy |
| `delete-account.html` | Account deletion instructions |
| `verify-email.html` | Email verification landing |
| `reset-password.html` | Password reset landing |
| `vercel.json` | Clean URL rewrites |

## Known Issues / TODO
- Hero background image (`hero-bg.jpg`) not yet added — currently just gradient
- No web app links (intentionally removed — not launching web app yet)
- Stats are hardcoded — update periodically as DB grows
