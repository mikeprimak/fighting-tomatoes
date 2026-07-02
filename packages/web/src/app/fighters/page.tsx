import { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/lib/site';
import { divisionSlug, divisionLabel, MIN_DIVISION_COUNT } from '@/lib/divisions';
import {
  FighterHubList,
  HubPagination,
  fetchHubFighters,
  fetchDivisions,
} from '@/components/fighters/FighterHubList';

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
  const canonical = page <= 1 ? `${SITE_URL}/fighters` : `${SITE_URL}/fighters?page=${page}`;
  return {
    title: page <= 1 ? 'Fighters' : `Fighters — Page ${page}`,
    description:
      'Browse MMA and boxing fighter profiles with fan ratings, records, and fight histories on Good Fights.',
    alternates: { canonical },
  };
}

export default async function FightersHubPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);

  const [{ fighters, total, totalPages }, divisions] = await Promise.all([
    fetchHubFighters({ page }),
    fetchDivisions(),
  ]);
  const linkedDivisions = divisions.filter((d) => d.count >= MIN_DIVISION_COUNT);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Fighters</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {total.toLocaleString()} fighters rated by fight fans — sorted by most rated.
        </p>
      </header>

      {linkedDivisions.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Divisions">
          {linkedDivisions.map((d) => (
            <Link
              key={d.weightClass}
              href={`/fighters/division/${divisionSlug(d.weightClass)}`}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              {divisionLabel(d.weightClass)}
              <span className="ml-1 opacity-60">{d.count}</span>
            </Link>
          ))}
        </nav>
      )}

      <FighterHubList fighters={fighters} />
      <HubPagination basePath="/fighters" page={page} totalPages={totalPages} />
    </div>
  );
}
