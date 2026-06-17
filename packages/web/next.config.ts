import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fightcrewapp-backend.onrender.com',
      },
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'dmxg5wxfqgb4u.cloudfront.net',
      },
      {
        protocol: 'https',
        hostname: '*.ufc.com',
      },
      {
        protocol: 'https',
        hostname: '*.tapology.com',
      },
    ],
  },
  // Legacy static-landing URLs (pre-2026-05-28 migration). Google Play / App
  // Store have these `.html` URLs registered for the privacy policy and account
  // deletion link; 301 them to the Next.js routes so the registered links never 404.
  async redirects() {
    return [
      { source: '/privacy.html', destination: '/privacy', permanent: true },
      { source: '/delete-account.html', destination: '/delete-account', permanent: true },
      // Legacy URL schemes from the old fightingtomatoes.com site (still indexed +
      // backlinked). They 404'd on the new app — ~20% of weekly pageviews (2026-06-16).
      // We can't statically resolve old event/fight slugs to the new UUID routes, so we
      // 308 them to the closest live listing (recovers the visitor + SEO equity).
      // NOTE: `/event/:path*` and `/fight/:path*` do NOT collide with the real
      // `/events/*`, `/fights/*`, `/fighters/*`, or `/fight-of-the-night` routes — the
      // `/` separator after `/event`|`/fight` is required to match (Next.js anchors
      // source patterns to the start). Bare plurals (`/events`, `/fights`) have no index
      // page, so never target them.
      { source: '/event/:path*', destination: '/events/past', permanent: true },
      { source: '/fight/:path*', destination: '/fights/top', permanent: true },
      // Old WooCommerce / WordPress leftovers.
      { source: '/shop/:path*', destination: '/', permanent: true },
      { source: '/Best-Free-UFC-Fights-On-YouTube', destination: '/blog', permanent: true },
    ];
  },
  // The Apple App Site Association file has no extension, so Vercel would serve
  // it as application/octet-stream. iOS requires application/json. (Served from
  // public/.well-known/ — Android's assetlinks.json gets the right type from its
  // extension automatically.)
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default nextConfig;
