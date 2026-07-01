/**
 * Fetch the indexable-slug whitelist for one entity type from the backend
 * (`/api/sitemap/:type`), which applies the shared SEO index gate. Used by the
 * per-type child sitemaps. See docs/plans/programmatic-seo-2026-07-01.md (step 3).
 */
const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

// Google's hard ceiling is 50,000 URLs per sitemap file. Each type is well under
// this today; if the backend reports more we page through and log a warning
// (converting that segment to generateSitemaps is the follow-up).
const PAGE_SIZE = 50000;

export type SitemapEntry = { slug: string; lastModified: string | null };

export async function fetchSitemapEntries(
  type: 'fighters' | 'events' | 'fights',
): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = [];
  let page = 1;
  // Revalidate hourly — the corpus changes slowly and this is cached at the edge.
  for (;;) {
    const res = await fetch(
      `${API_BASE_URL}/sitemap/${type}?page=${page}&limit=${PAGE_SIZE}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) break;
    const data = (await res.json()) as {
      entries: SitemapEntry[];
      totalPages: number;
    };
    out.push(...(data.entries || []));
    if (!data.totalPages || page >= data.totalPages) break;
    page += 1;
  }
  return out;
}
