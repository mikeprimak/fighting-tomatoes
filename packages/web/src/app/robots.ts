import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Enumerates every sitemap so Google discovers the programmatic-SEO corpus. The
 * deep fighter/event/fight pages live in per-type child sitemaps, not the root
 * one; multiple `Sitemap:` lines are the standard discovery mechanism (no
 * sitemap-index file needed). See docs/plans/programmatic-seo-2026-07-01.md.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/profile/edit'],
    },
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/fighters/sitemap.xml`,
      `${SITE_URL}/events/sitemap.xml`,
      `${SITE_URL}/fights/sitemap.xml`,
    ],
    host: SITE_URL,
  };
}
