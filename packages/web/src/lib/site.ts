/**
 * Canonical public origin for the web app (no trailing slash).
 *
 * The blog and all dynamic routes live on the Next.js web app, NOT on the
 * static landing site at goodfights.app (which only rewrites a handful of
 * static pages). The sitemap previously pointed every URL at goodfights.app,
 * so those URLs 404'd. Default to the real web-app origin; override with
 * NEXT_PUBLIC_SITE_URL if the app later moves to a custom domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://web-jet-gamma-12.vercel.app'
).replace(/\/$/, '');
