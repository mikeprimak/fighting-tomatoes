import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { ORGS } from '@/lib/orgs';
import { SITE_URL } from '@/lib/site';
import { fetchBestFacets, fetchBestYears, indexableBestLists, indexableYears } from '@/lib/bestFights';

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
    // lastModified moves on every regeneration so Google sees the schedule
    // hubs as the living pages they are ("tonight" only works if crawled often).
    { url: `${SITE_URL}/schedule`, changeFrequency: 'daily', priority: 0.9, lastModified: new Date() },
    { url: `${SITE_URL}/schedule/tonight`, changeFrequency: 'hourly', priority: 0.9, lastModified: new Date() },
    { url: `${SITE_URL}/schedule/this-weekend`, changeFrequency: 'daily', priority: 0.9, lastModified: new Date() },
    { url: `${SITE_URL}/events`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/live`, changeFrequency: 'always', priority: 0.9 },
    { url: `${SITE_URL}/events/upcoming`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/past`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/fights/top`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/fighters`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Org hub pages (Own The SERPs front-load #3) — auto-updating schedule +
  // results + ratings per promotion. lastModified moves each regeneration so
  // the "next event" freshness is machine-visible.
  const orgPages: MetadataRoute.Sitemap = ORGS.map((o) => ({
    url: `${SITE_URL}/orgs/${o.slug}`,
    changeFrequency: 'daily' as const,
    priority: 0.8,
    lastModified: new Date(),
  }));

  // Best-of-year hubs — only years that clear the page-worthiness floor
  // (same gate the year pages use for their robots tag). NOTE: this fetch runs
  // at build time too — deploy the backend first or the baked sitemap holds an
  // empty year list until the 1h revalidate.
  const yearPages: MetadataRoute.Sitemap = indexableYears(await fetchBestYears()).map((y) => ({
    url: `${SITE_URL}/fights/best/${y.year}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Best-of facet hubs (front-load #4): all-time / per-org / per-method /
  // per-division lists that clear the same page-worthiness floor.
  const facetPages: MetadataRoute.Sitemap = indexableBestLists(await fetchBestFacets()).map((l) => ({
    url: `${SITE_URL}/fights/best/${l.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const postPages: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...staticPages, ...orgPages, ...yearPages, ...facetPages, ...postPages];
}
