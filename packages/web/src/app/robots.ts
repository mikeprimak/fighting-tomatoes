import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/profile/edit'],
    },
    sitemap: 'https://goodfights.app/sitemap.xml',
  };
}
