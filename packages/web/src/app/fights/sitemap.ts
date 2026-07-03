import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { fetchSitemapEntries } from '@/lib/sitemapData';

// Served at /fights/sitemap.xml (listed in robots.ts). Only fights that pass the
// backend SEO index gate appear here — the sitemap is the whitelist. These are the
// pages carrying our unique fan-rating AggregateRating, so priority is highest.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await fetchSitemapEntries('fights');
  return entries.map((e) => ({
    url: `${SITE_URL}/fights/${e.slug}`,
    lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));
}
