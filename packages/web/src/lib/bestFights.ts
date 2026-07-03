const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

/**
 * A year page is only worth indexing when the year has a real ranking behind
 * it — thin year pages at scale are the Helpful-Content risk the plan's
 * indexing gate exists to avoid.
 */
export const MIN_YEAR_FIGHTS = 10;

export interface BestYear {
  year: number;
  count: number;
}

/** Years that have qualifying fights (already floor-gated per fight server-side). */
export async function fetchBestYears(revalidate = 3600): Promise<BestYear[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/fights/best-years`, { next: { revalidate } });
    if (res.ok) return (await res.json()).years || [];
  } catch {
    // Callers treat an empty list as "no data" and degrade gracefully.
  }
  return [];
}

/** Years that clear the page-worthiness floor — the sitemap/indexing whitelist. */
export function indexableYears(years: BestYear[]): BestYear[] {
  return years.filter((y) => y.count >= MIN_YEAR_FIGHTS);
}

export async function fetchBestFights(year: number, revalidate = 3600): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/fights/best?year=${year}&limit=50`, { next: { revalidate } });
    if (res.ok) return (await res.json()).fights || [];
  } catch {
    // Same graceful degradation as above.
  }
  return [];
}
