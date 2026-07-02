import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/site';
import { divisionEnum, divisionLabel, divisionSlug, MIN_DIVISION_COUNT } from '@/lib/divisions';
import {
  FighterHubList,
  HubPagination,
  fetchHubFighters,
  fetchDivisions,
} from '@/components/fighters/FighterHubList';

type Props = {
  params: Promise<{ division: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { division } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
  const wc = divisionEnum(division);
  const label = divisionLabel(wc);
  const base = `${SITE_URL}/fighters/division/${division}`;
  const canonical = page <= 1 ? base : `${base}?page=${page}`;
  // Thin divisions render but stay out of the index (same gate philosophy as the
  // per-entity pages). Count comes from the same facet endpoint the hub uses.
  const divisions = await fetchDivisions();
  const count = divisions.find((d) => d.weightClass === wc)?.count ?? 0;
  return {
    title: `${label} Fighters`,
    description: `${label} fighter profiles with fan ratings, records, and fight histories on Good Fights.`,
    alternates: { canonical },
    ...(count < MIN_DIVISION_COUNT ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function DivisionHubPage({ params, searchParams }: Props) {
  const { division } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);

  // Round-trip guard: a malformed segment (e.g. "Light-Heavyweight%20x") that
  // doesn't map cleanly back to a slug is a 404, not a query.
  const wc = divisionEnum(division);
  if (divisionSlug(wc) !== division.toLowerCase()) notFound();

  const { fighters, total, totalPages } = await fetchHubFighters({ page, weightClass: wc });
  if (total === 0) notFound();

  const label = divisionLabel(wc);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <nav className="mb-1 text-xs text-text-secondary" aria-label="Breadcrumb">
          <Link href="/fighters" className="hover:text-primary hover:underline">
            Fighters
          </Link>
          <span className="mx-1">/</span>
          <span>{label}</span>
        </nav>
        <h1 className="text-2xl font-bold">{label} Fighters</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {total.toLocaleString()} {label.toLowerCase()} fighter{total === 1 ? '' : 's'} rated by
          fight fans — sorted by most rated.
        </p>
      </header>

      <FighterHubList fighters={fighters} />
      <HubPagination
        basePath={`/fighters/division/${division}`}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}
