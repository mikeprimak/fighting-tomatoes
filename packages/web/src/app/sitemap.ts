import type { MetadataRoute } from 'next';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: 'https://goodfights.app', changeFrequency: 'daily', priority: 1 },
    { url: 'https://goodfights.app/events/live', changeFrequency: 'always', priority: 0.9 },
    { url: 'https://goodfights.app/events/past', changeFrequency: 'daily', priority: 0.8 },
    { url: 'https://goodfights.app/fights/top', changeFrequency: 'daily', priority: 0.8 },
    { url: 'https://goodfights.app/privacy', changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Fetch recent events for dynamic URLs
  try {
    const eventsRes = await fetch(`${API_BASE_URL}/events?limit=50&type=all`, { next: { revalidate: 3600 } });
    if (eventsRes.ok) {
      const { events } = await eventsRes.json();
      const eventUrls = events.map((e: any) => ({
        url: `https://goodfights.app/events/${e.id}`,
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
