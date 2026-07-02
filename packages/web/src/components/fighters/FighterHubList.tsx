/**
 * Server-rendered fighter list shared by the /fighters hub and the
 * /fighters/division/[division] facet hubs (programmatic-SEO step 4). These
 * pages are the internal-link crawl graph that rescues the ~950 deep fighter
 * pages from orphan status — every row is a real <a href> to /fighters/<slug>.
 * Ordered most-rated-first so the strongest pages get the strongest links.
 */
import Link from 'next/link';
import { FighterAvatar } from '@/components/FighterAvatar';
import { formatRecord } from '@/lib/record';
import { divisionLabel } from '@/lib/divisions';

export const HUB_PAGE_SIZE = 48;

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export type HubFighter = {
  id: string;
  slug: string | null;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  wins?: number;
  losses?: number;
  draws?: number;
  weightClass?: string | null;
  isChampion?: boolean;
  championshipTitle?: string | null;
  averageRating?: number;
  totalRatings?: number;
  profileImage?: string | null;
};

export async function fetchHubFighters(opts: {
  page: number;
  weightClass?: string;
}): Promise<{ fighters: HubFighter[]; total: number; totalPages: number }> {
  const params = new URLSearchParams({
    indexable: 'true',
    sort: 'ratings',
    limit: String(HUB_PAGE_SIZE),
    page: String(opts.page),
  });
  if (opts.weightClass) params.set('weightClass', opts.weightClass);
  try {
    const res = await fetch(`${API_BASE_URL}/fighters?${params}`, { next: { revalidate: 3600 } });
    if (!res.ok) return { fighters: [], total: 0, totalPages: 0 };
    const data = await res.json();
    return {
      fighters: data.fighters || [],
      total: data.pagination?.total ?? 0,
      totalPages: data.pagination?.totalPages ?? 0,
    };
  } catch {
    return { fighters: [], total: 0, totalPages: 0 };
  }
}

export async function fetchDivisions(): Promise<Array<{ weightClass: string; count: number }>> {
  try {
    const res = await fetch(`${API_BASE_URL}/fighters/divisions`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.divisions || [];
  } catch {
    return [];
  }
}

export function FighterHubList({ fighters }: { fighters: HubFighter[] }) {
  if (fighters.length === 0) {
    return <p className="py-8 text-center text-sm text-text-secondary">No fighters found.</p>;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {fighters.map((f) => {
        const name = `${f.firstName} ${f.lastName}`;
        const record = formatRecord(f);
        return (
          <li key={f.id}>
            <Link
              href={`/fighters/${f.slug || f.id}`}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-background/60"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-background">
                <FighterAvatar
                  src={f.profileImage}
                  alt={name}
                  initials={`${f.firstName[0] ?? ''}${f.lastName[0] ?? ''}`}
                  imgClassName="h-full w-full object-cover"
                  initialsClassName="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {name}
                  {f.isChampion && <span className="ml-1.5 text-xs text-primary">🏆</span>}
                </p>
                <p className="truncate text-xs text-text-secondary">
                  {[record, f.weightClass ? divisionLabel(f.weightClass) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {typeof f.totalRatings === 'number' && f.totalRatings > 0 && (
                <span className="shrink-0 text-xs text-text-secondary">
                  {f.totalRatings.toLocaleString()} rating{f.totalRatings === 1 ? '' : 's'}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Crawlable prev/next pagination — plain links, no JS. */
export function HubPagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const pageHref = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`);
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className="font-medium text-primary hover:underline">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-text-secondary">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={pageHref(page + 1)} className="font-medium text-primary hover:underline">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
