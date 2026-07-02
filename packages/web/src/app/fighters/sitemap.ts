import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { fetchSitemapEntries } from '@/lib/sitemapData';
import { divisionSlug, MIN_DIVISION_COUNT } from '@/lib/divisions';
import { fetchDivisions } from '@/components/fighters/FighterHubList';

// Served at /fighters/sitemap.xml (listed in robots.ts). Only fighters that pass
// the backend SEO index gate appear here — the sitemap is the whitelist. Division
// hub pages (non-thin ones) ride along since they share the same discovery need.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [entries, divisions] = await Promise.all([
    fetchSitemapEntries('fighters'),
    fetchDivisions(),
  ]);

  const divisionUrls: MetadataRoute.Sitemap = divisions
    .filter((d) => d.count >= MIN_DIVISION_COUNT)
    .map((d) => ({
      url: `${SITE_URL}/fighters/division/${divisionSlug(d.weightClass)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

  const fighterUrls: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${SITE_URL}/fighters/${e.slug}`,
    lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...divisionUrls, ...fighterUrls];
}
