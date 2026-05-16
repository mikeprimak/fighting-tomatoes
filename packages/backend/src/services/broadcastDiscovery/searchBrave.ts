/**
 * Brave Search API wrapper.
 * Free tier: 2,000 queries/month. We expect <50/run weekly.
 *
 * Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 * Set BRAVE_API_KEY in env.
 */

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export interface BraveResult {
  title: string;
  url: string;
  description: string; // raw HTML — strip with regex on consumer side
}

/** Brave freshness filter: pd (past day), pw (past week), pm (past month), py (past year). */
export type BraveFreshness = 'pd' | 'pw' | 'pm' | 'py';

export async function braveSearch(
  query: string,
  count = 5,
  opts: { freshness?: BraveFreshness } = {},
): Promise<BraveResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn('[discovery] BRAVE_API_KEY missing — returning empty results');
    return [];
  }
  const params = new URLSearchParams({
    q: query,
    count: String(count),
    safesearch: 'off',
    text_decorations: 'false',
    spellcheck: '0',
  });
  if (opts.freshness) params.set('freshness', opts.freshness);
  const res = await fetch(`${BRAVE_ENDPOINT}?${params}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brave search failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const results: BraveResult[] = (json?.web?.results ?? []).map((r: any) => ({
    title: stripHtml(r.title ?? ''),
    url: r.url ?? '',
    description: stripHtml(r.description ?? ''),
  }));
  return results;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
