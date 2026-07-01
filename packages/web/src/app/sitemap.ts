import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { SITE_URL } from '@/lib/site';

/**
 * Root sitemap: static pages, hub/index pages, and blog posts only. The deep
 * programmatic-SEO corpus (fighters / events / fights) lives in per-type child
 * sitemaps (`/{type}/sitemap.xml`), all enumerated in robots.ts — that's how the
 * ~5.5k gated entity pages get discovered. The old capped `?limit=50` events
 * fetch here is retired (events/sitemap.ts covers every indexable event now).
 * See docs/plans/programmatic-seo-2026-07-01.md (step 3).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/events/live`, changeFrequency: 'always', priority: 0.9 },
    { url: `${SITE_URL}/events/upcoming`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/past`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/fights/top`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const postPages: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...staticPages, ...postPages];
}
