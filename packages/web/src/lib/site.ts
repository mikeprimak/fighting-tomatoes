/**
 * Canonical public origin for the web app (no trailing slash).
 *
 * As of the 2026-05-28 domain migration the Next.js web app IS goodfights.app
 * (the static landing site was retired). Canonical URLs, the sitemap, and
 * layout.tsx's metadataBase all resolve here. Override with NEXT_PUBLIC_SITE_URL
 * only for preview/staging origins.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://goodfights.app'
).replace(/\/$/, '');
