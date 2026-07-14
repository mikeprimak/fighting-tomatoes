import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/site';
import { fetchBestFights, fetchBestYears, indexableYears, MIN_YEAR_FIGHTS } from '@/lib/bestFights';
import { BEST_FIGHT_YEAR_NOTES } from '@/lib/bestFightYearNotes';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { FightColumnHeader } from '@/components/fight-cards/FightSectionList';

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

  const top = fights[0];
  // Editorial retrospective, falling back to a data-driven line so every year
  // page has real prose above the list.
  const yearNote =
    BEST_FIGHT_YEAR_NOTES[year] ||
    (top
      ? `Fans on Good Fights have rated ${fights.length} fights from ${year}, and ${fightName(top)} leads the year at ${top.averageRating.toFixed(1)}/10.`
      : null);

  const faqs = [
    ...(top
      ? [
          {
            q: `What was the best fight of ${year}?`,
            a: `By fan rating, the best fight of ${year} is ${fightName(top)}${top.event?.name ? ` at ${top.event.name}` : ''}, scored ${top.averageRating.toFixed(1)}/10 across ${top.totalRatings} fan ratings on Good Fights.`,
          },
        ]
      : []),
    {
      q: 'How are these rankings decided?',
      a: `No editors, no algorithm, no promoter input: every fight here is ranked purely by the average score fans gave it after watching, on a 1-10 scale. A fight needs a minimum number of ratings to qualify, so one enthusiastic voter can't put an obscure fight on top.`,
    },
  ];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  // Adjacent-year links for the bottom of the page (the chip nav is at the top).
  const yearIdx = linkedYears.findIndex((y) => y.year === year);
  const prevYear = yearIdx >= 0 ? linkedYears[yearIdx + 1]?.year : undefined; // list is newest-first
  const nextYear = yearIdx > 0 ? linkedYears[yearIdx - 1]?.year : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">Best Fights of {year}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {fights.length > 0
            ? `The top ${fights.length} fights of ${year}, ranked by fan ratings from the Good Fights community.`
            : `No rated fights found for ${year} yet.`}
        </p>
      </header>

      {yearNote && (
        <p className="mb-5 text-sm leading-relaxed text-text-secondary">{yearNote}</p>
      )}

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
        <>
          <FightColumnHeader variant="rating" />
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {fights.map((fight: any, index: number) => (
              <CompletedFightCard key={fight.id} fight={fight} showRank={index + 1} showEvent />
            ))}
          </div>
        </>
      )}

      {faqs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">FAQ: the best fights of {year}</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q}>
                <h3 className="text-sm font-semibold">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(prevYear || nextYear) && (
        <nav className="mt-8 flex items-center justify-between text-sm" aria-label="Adjacent years">
          {prevYear ? (
            <Link href={`/fights/best/${prevYear}`} className="text-primary hover:underline">
              ← Best fights of {prevYear}
            </Link>
          ) : <span />}
          {nextYear ? (
            <Link href={`/fights/best/${nextYear}`} className="text-primary hover:underline">
              Best fights of {nextYear} →
            </Link>
          ) : <span />}
        </nav>
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
