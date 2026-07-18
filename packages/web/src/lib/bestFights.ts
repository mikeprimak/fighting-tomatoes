import { orgBySlug, orgByPromotion, type OrgInfo } from '@/lib/orgs';
import { divisionEnum, divisionLabel, divisionSlug } from '@/lib/divisions';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

/**
 * A best-of list page is only worth indexing when it has a real ranking behind
 * it — thin list pages at scale are the Helpful-Content risk the plan's
 * indexing gate exists to avoid. Applies to year pages and the org/division/
 * method facets alike.
 */
export const MIN_YEAR_FIGHTS = 10;
export const MIN_LIST_FIGHTS = MIN_YEAR_FIGHTS;

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

// ---- Facet lists (Own The SERPs front-load #4) -----------------------------
// /fights/best/[list] serves one dynamic segment for every list flavor:
// a year ("2026"), "all-time", a method slug ("knockouts"), an org slug
// ("ufc"), or a division slug ("lightweight"). Non-year facets are validated
// against /fights/best-facets so the slug space stays finite.

export type BestMethodKey = 'ko' | 'submission' | 'title';

const METHOD_SLUGS: Record<string, { key: BestMethodKey; label: string; noun: string }> = {
  knockouts: { key: 'ko', label: 'Knockout', noun: 'knockouts' },
  submissions: { key: 'submission', label: 'Submission', noun: 'submissions' },
  'title-fights': { key: 'title', label: 'Title', noun: 'title fights' },
};

export interface BestFacets {
  allTime: number;
  orgs: { promotion: string; count: number }[];
  divisions: { weightClass: string; count: number }[];
  methods: Record<string, number>;
}

export async function fetchBestFacets(revalidate = 3600): Promise<BestFacets | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/fights/best-facets`, { next: { revalidate } });
    if (res.ok) return await res.json();
  } catch {
    // Callers treat null as "no data" and degrade gracefully.
  }
  return null;
}

export type BestList =
  | { kind: 'year'; slug: string; year: number; count: number }
  | { kind: 'all-time'; slug: 'all-time'; count: number }
  | { kind: 'org'; slug: string; org: OrgInfo; count: number }
  | { kind: 'method'; slug: string; method: BestMethodKey; label: string; noun: string; count: number }
  | { kind: 'division'; slug: string; weightClass: string; label: string; count: number };

/**
 * Resolve a /fights/best/<slug> segment to a list descriptor, or null (404).
 * Years resolve without facet data (any plausible year renders, the count
 * gates indexing); every other flavor must exist in the facet counts.
 */
export function resolveBestList(
  slug: string,
  facets: BestFacets | null,
  years: BestYear[],
): BestList | null {
  const s = slug.toLowerCase();

  if (/^\d{4}$/.test(s)) {
    const year = parseInt(s, 10);
    if (year < 1990 || year > new Date().getUTCFullYear()) return null;
    return { kind: 'year', slug: s, year, count: years.find((y) => y.year === year)?.count ?? 0 };
  }

  if (s === 'all-time') return { kind: 'all-time', slug: 'all-time', count: facets?.allTime ?? 0 };

  const method = METHOD_SLUGS[s];
  if (method) {
    return {
      kind: 'method',
      slug: s,
      method: method.key,
      label: method.label,
      noun: method.noun,
      count: facets?.methods?.[method.key] ?? 0,
    };
  }

  const org = orgBySlug(s);
  if (org) {
    const count =
      facets?.orgs.find((o) => o.promotion.toLowerCase() === org.promotion.toLowerCase())?.count ?? 0;
    return { kind: 'org', slug: s, org, count };
  }

  // Division: must round-trip mechanically AND be a division the facet data
  // knows about — otherwise arbitrary slugs would all render as empty pages.
  const wc = divisionEnum(s);
  if (divisionSlug(wc) === s) {
    const row = facets?.divisions.find((d) => d.weightClass === wc);
    if (row) return { kind: 'division', slug: s, weightClass: wc, label: divisionLabel(wc), count: row.count };
  }

  return null;
}

/** Every non-year list that clears the indexing floor — sitemap + chip nav. */
export function indexableBestLists(facets: BestFacets | null): BestList[] {
  if (!facets) return [];
  const slugs: string[] = [
    'all-time',
    ...Object.keys(METHOD_SLUGS),
    // Facet counts include legacy promotions (Pride, WEC, Bellator…) that
    // have no org registry entry and therefore no page — skip them.
    ...facets.orgs.map((o) => orgByPromotion(o.promotion)?.slug).filter((s): s is string => !!s),
    ...facets.divisions.map((d) => divisionSlug(d.weightClass)),
  ];
  return slugs
    .map((s) => resolveBestList(s, facets, []))
    .filter((l): l is BestList => !!l && l.count >= MIN_LIST_FIGHTS);
}

/** Human title fragment: "Best UFC Fights", "Best Fights of 2026", … */
export function bestListTitle(list: BestList): string {
  switch (list.kind) {
    case 'year':
      return `Best Fights of ${list.year}`;
    case 'all-time':
      return 'Best Fights of All Time';
    case 'org':
      return `Best ${list.org.name} Fights`;
    case 'method':
      return list.method === 'title' ? 'Best Title Fights' : `Best ${list.label} Fights`;
    case 'division':
      return `Best ${list.label} Fights`;
  }
}

/** Query-string fragment for /api/fights/best matching the list. */
export function bestListQuery(list: BestList): string {
  switch (list.kind) {
    case 'year':
      return `year=${list.year}`;
    case 'all-time':
      return '';
    case 'org':
      return `org=${encodeURIComponent(list.org.promotion)}`;
    case 'method':
      return `method=${list.method}`;
    case 'division':
      return `division=${list.weightClass}`;
  }
}

export async function fetchBestListFights(list: BestList, revalidate = 3600): Promise<any[]> {
  const query = bestListQuery(list);
  try {
    const res = await fetch(`${API_BASE_URL}/fights/best?${query ? `${query}&` : ''}limit=50`, {
      next: { revalidate },
    });
    if (res.ok) return (await res.json()).fights || [];
  } catch {
    // Same graceful degradation as above.
  }
  return [];
}

/** Back-compat helper for the year pages. */
export async function fetchBestFights(year: number, revalidate = 3600): Promise<any[]> {
  return fetchBestListFights({ kind: 'year', slug: String(year), year, count: 0 }, revalidate);
}

/**
 * Display-only variant for org hubs: lowered rating floor so small-promotion
 * hubs still get a "highest-rated fights" strip. Never used for indexable
 * best-of pages.
 */
export async function fetchTopOrgFights(
  promotion: string,
  limit = 5,
  minRatings = 3,
  revalidate = 3600,
): Promise<any[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/fights/best?org=${encodeURIComponent(promotion)}&minRatings=${minRatings}&limit=${limit}`,
      { next: { revalidate } },
    );
    if (res.ok) return (await res.json()).fights || [];
  } catch {
    // Section simply doesn't render.
  }
  return [];
}
