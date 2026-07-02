import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/site';
import { fetchBestFights, fetchBestYears, indexableYears, MIN_YEAR_FIGHTS } from '@/lib/bestFights';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';

type Props = { params: Promise<{ year: string }> };

function parseYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const year = parseInt(raw, 10);
  const currentYear = new Date().getUTCFullYear();
  if (year < 1990 || year > currentYear) return null;
  return year;
}

function fightName(f: any): string {
  return `${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year: yearRaw } = await params;
  const year = parseYear(yearRaw);
  if (!year) return { title: 'Best Fights' };

  const fights = await fetchBestFights(year);
  const canonical = `${SITE_URL}/fights/best/${year}`;
  const title = `Best Fights of ${year} — Fan Rated`;
  const top = fights[0];
  const description = top
    ? `The best MMA and boxing fights of ${year}, ranked by fan ratings. #1: ${fightName(top)} (${top.averageRating.toFixed(1)}/10 from ${top.totalRatings} ratings).`
    : `The best MMA and boxing fights of ${year}, ranked by fan ratings on Good Fights.`;
  return {
    title,
    description,
    alternates: { canonical },
    // Same philosophy as the entity pages' shouldIndex gate: thin year pages
    // render for users but stay out of Google's index (and the sitemap).
    ...(fights.length < MIN_YEAR_FIGHTS ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type: 'website', url: canonical },
  };
}

/** ItemList JSON-LD — the ranked list as machine-readable structured data. */
function buildListJsonLd(year: number, fights: any[], url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best Fights of ${year}`,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: fights.length,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    itemListElement: fights.map((f, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: fightName(f),
      ...(f.slug ? { url: `${SITE_URL}/fights/${f.slug}` } : {}),
    })),
  };
}

export default async function BestFightsYearPage({ params }: Props) {
  const { year: yearRaw } = await params;
  const year = parseYear(yearRaw);
  if (!year) notFound();

  const [fights, allYears] = await Promise.all([fetchBestFights(year), fetchBestYears()]);
  const linkedYears = indexableYears(allYears);
  const jsonLd = buildListJsonLd(year, fights, `${SITE_URL}/fights/best/${year}`);

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">Best Fights of {year}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {fights.length > 0
            ? `The top ${fights.length} fights of ${year}, ranked by fan ratings from the Good Fights community.`
            : `No rated fights found for ${year} yet.`}
        </p>
      </header>

      {linkedYears.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Best fights by year">
          {linkedYears.map((y) => (
            <Link
              key={y.year}
              href={`/fights/best/${y.year}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                y.year === year
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-text-secondary hover:border-primary hover:text-primary'
              }`}
            >
              {y.year}
            </Link>
          ))}
        </nav>
      )}

      {fights.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {fights.map((fight: any, index: number) => (
            <CompletedFightCard key={fight.id} fight={fight} showRank={index + 1} showEvent />
          ))}
        </div>
      )}

      <p className="mt-6 text-sm text-text-secondary">
        Looking for recent standouts? See{' '}
        <Link href="/fights/top" className="text-primary hover:underline">
          top-rated recent fights
        </Link>{' '}
        or browse{' '}
        <Link href="/fighters" className="text-primary hover:underline">
          fighters
        </Link>{' '}
        and{' '}
        <Link href="/events" className="text-primary hover:underline">
          events
        </Link>
        .
      </p>
    </div>
  );
}
