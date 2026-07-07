import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Enumerates every sitemap so Google discovers the programmatic-SEO corpus. The
 * deep fighter/event/fight pages live in per-type child sitemaps, not the root
 * one; multiple `Sitemap:` lines are the standard discovery mechanism (no
 * sitemap-index file needed). See docs/plans/programmatic-seo-2026-07-01.md.
 */
/**
 * Bulk crawlers banned outright: AI-training scrapers and SEO-tool bots blew
 * through the Vercel free tier within days of the SEO corpus going live
 * (July 2 2026 usage spike — 5.5k pages × relentless recrawls). A matching
 * deny rule ("Block bulk crawlers") lives in the Vercel firewall for the ones
 * that ignore robots.txt. Search engines and user-triggered AI retrieval
 * agents (OAI-SearchBot, Perplexity-User, ChatGPT-User) remain allowed —
 * those drive discovery and citations; these drive only bandwidth.
 */
const BLOCKED_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'PetalBot',
  'Bytespider',
  'meta-externalagent',
  'FacebookBot',
  'SemrushBot',
  'AhrefsBot',
  'MJ12bot',
  'DotBot',
  'BLEXBot',
  'DataForSeoBot',
  'ZoominfoBot',
  'ImagesiftBot',
  'Diffbot',
  'Timpibot',
  'serpstatbot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/profile/edit'],
      },
      {
        userAgent: BLOCKED_BOTS,
        disallow: '/',
      },
    ],
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/fighters/sitemap.xml`,
      `${SITE_URL}/events/sitemap.xml`,
      `${SITE_URL}/fights/sitemap.xml`,
    ],
    host: SITE_URL,
  };
}
