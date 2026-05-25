import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/events/live`, changeFrequency: 'always', priority: 0.9 },
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
  staticPages.push(...postPages);

  // Fetch recent events for dynamic URLs
  try {
    const eventsRes = await fetch(`${API_BASE_URL}/events?limit=50&type=all`, { next: { revalidate: 3600 } });
    if (eventsRes.ok) {
      const { events } = await eventsRes.json();
      const eventUrls = events.map((e: any) => ({
        url: `${SITE_URL}/events/${e.id}`,
        lastModified: new Date(e.updatedAt || e.date),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));
      return [...staticPages, ...eventUrls];
    }
  } catch {
    // Return static pages only
  }

  return staticPages;
}
