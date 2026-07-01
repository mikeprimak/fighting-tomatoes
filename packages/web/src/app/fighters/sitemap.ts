import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { fetchSitemapEntries } from '@/lib/sitemapData';

// Served at /fighters/sitemap.xml (listed in robots.ts). Only fighters that pass
// the backend SEO index gate appear here — the sitemap is the whitelist.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await fetchSitemapEntries('fighters');
  return entries.map((e) => ({
    url: `${SITE_URL}/fighters/${e.slug}`,
    lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
}
