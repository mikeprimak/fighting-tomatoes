import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/site';
import {
  fetchBestFacets,
  fetchBestListFights,
  fetchBestYears,
  indexableBestLists,
  indexableYears,
  resolveBestList,
  bestListTitle,
  MIN_LIST_FIGHTS,
  type BestFacets,
  type BestList,
  type BestYear,
} from '@/lib/bestFights';
import { BEST_FIGHT_YEAR_NOTES } from '@/lib/bestFightYearNotes';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { FightColumnHeader } from '@/components/fight-cards/FightSectionList';

// One dynamic segment serves every list flavor (Own The SERPs front-load #4):
// a year ("2026"), "all-time", a method ("knockouts", "submissions",
// "title-fights"), an org ("ufc", "bkfc", …), or a division ("lightweight").
type Props = { params: Promise<{ list: string }> };

// ISR the rendered HTML, not just the upstream fetches. Without this the route
// re-rendered on every request (586 function invocations in 6h during the
// 2026-07-29 crawler spike) even though every fetch below was already cached
// for an hour. 3600 matches the `fetchBest*` defaults in lib/bestFights.ts, so
// page freshness is unchanged — only the invocation count drops. The empty
// generateStaticParams is required for `revalidate` to take effect at all on a
// dynamic segment — see the comment on /fights/[id].
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

function fightName(f: any): string {
  return `${f.fighter1.firstName} ${f.fighter1.lastName} vs ${f.fighter2.firstName} ${f.fighter2.lastName}`;
}

async function resolveFromParams(
  listRaw: string,
): Promise<{ list: BestList; years: BestYear[]; facets: BestFacets | null } | null> {
  const [facets, allYears] = await Promise.all([fetchBestFacets(), fetchBestYears()]);
  const list = resolveBestList(listRaw, facets, allYears);
  if (!list) return null;
  return { list, years: indexableYears(allYears), facets };
}

/** The noun phrase the copy hangs on: "the best UFC fights", "the best fights of 2026"… */
function subject(list: BestList): string {
  switch (list.kind) {
    case 'year':
      return `the best MMA and boxing fights of ${list.year}`;
    case 'all-time':
      return 'the best MMA and boxing fights of all time';
    case 'org':
      return `the best ${list.org.name} fights`;
    case 'method':
      return list.method === 'title'
        ? 'the best championship title fights'
        : `the best ${list.noun} in MMA and boxing`;
    case 'division':
      return `the best ${list.label.toLowerCase()} fights`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { list: listRaw } = await params;
  const resolved = await resolveFromParams(listRaw);
  if (!resolved) return { title: 'Best Fights' };
  const { list } = resolved;

  const fights = await fetchBestListFights(list);
  const canonical = `${SITE_URL}/fights/best/${list.slug}`;
  const title = `${bestListTitle(list)} — Fan Rated`;
  const top = fights[0];
  const description = top
    ? `${capitalize(subject(list))}, ranked by fan ratings. #1: ${fightName(top)} (${top.averageRating.toFixed(1)}/10 from ${top.totalRatings} ratings).`
    : `${capitalize(subject(list))}, ranked by fan ratings on Good Fights.`;
  return {
    title,
    description,
    alternates: { canonical },
    // Same philosophy as the entity pages' shouldIndex gate: thin list pages
    // render for users but stay out of Google's index (and the sitemap).
    ...(fights.length < MIN_LIST_FIGHTS ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type: 'website', url: canonical },
  };
}

/** ItemList JSON-LD — the ranked list as machine-readable structured data. */
function buildListJsonLd(list: BestList, fights: any[], url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: bestListTitle(list),
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

/** The #1-fight FAQ question, phrased per list flavor. */
function topFaqQuestion(list: BestList): string {
  switch (list.kind) {
    case 'year':
      return `What was the best fight of ${list.year}?`;
    case 'all-time':
      return 'What is the best fight of all time?';
    case 'org':
      return `What is the best ${list.org.name} fight ever?`;
    case 'method':
      return list.method === 'title'
        ? 'What is the best title fight ever?'
        : `What is the best ${list.label.toLowerCase()} fight ever?`;
    case 'division':
      return `What is the best ${list.label.toLowerCase()} fight ever?`;
  }
}

/** Chip label: "Best UFC Fights" -> "UFC", "Best Fights of All Time" -> "All time". */
function chipLabel(l: BestList): string {
  switch (l.kind) {
    case 'all-time':
      return 'All time';
    case 'org':
      return l.org.name;
    case 'method':
      return capitalize(l.noun);
    case 'division':
      return l.label;
    case 'year':
      return String(l.year);
  }
}

export default async function BestFightsListPage({ params }: Props) {
  const { list: listRaw } = await params;
  const resolved = await resolveFromParams(listRaw);
  if (!resolved) notFound();
  const { list, years, facets } = resolved;

  const fights = await fetchBestListFights(list);
  const canonical = `${SITE_URL}/fights/best/${list.slug}`;
  const jsonLd = buildListJsonLd(list, fights, canonical);
  const browseLists = indexableBestLists(facets);

  const top = fights[0];
  // Editorial retrospective for year pages, falling back to a data-driven line
  // so every list page has real prose above the ranking.
  const intro =
    (list.kind === 'year' && BEST_FIGHT_YEAR_NOTES[list.year]) ||
    (top
      ? `Fans on Good Fights rank ${subject(list)} with real post-fight ratings, and the wars at the top of this list, like ${fightName(top)}, all scored ${Math.floor(top.averageRating)}/10 or close to it. The order shifts as more fans rate.`
      : null);

  const faqs = [
    ...(top
      ? [
          {
            q: topFaqQuestion(list),
            a: `There is no single right answer, which is why fans vote. Right now ${fightName(top)}${top.event?.name ? ` at ${top.event.name}` : ''} leads the fan ratings at ${top.averageRating.toFixed(1)}/10 across ${top.totalRatings} ratings on Good Fights, but the order shifts as more fans weigh in, and everything near the top of this list has a real claim.`,
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

  // Adjacent-year links for year pages (the chip nav is at the top).
  const yearIdx = list.kind === 'year' ? years.findIndex((y) => y.year === list.year) : -1;
  const prevYear = yearIdx >= 0 ? years[yearIdx + 1]?.year : undefined; // list is newest-first
  const nextYear = yearIdx > 0 ? years[yearIdx - 1]?.year : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="mb-4">
        <h1 className="text-2xl font-bold">{bestListTitle(list)}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {fights.length > 0
            ? `The top ${fights.length} ranked by fan ratings from the Good Fights community.`
            : 'No rated fights found for this list yet.'}
        </p>
      </header>

      {intro && <p className="mb-5 text-sm leading-relaxed text-text-secondary">{intro}</p>}

      {years.length > 0 && (
        <nav className="mb-3 flex flex-wrap gap-2" aria-label="Best fights by year">
          {years.map((y) => (
            <Link
              key={y.year}
              href={`/fights/best/${y.year}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                list.kind === 'year' && y.year === list.year
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-text-secondary hover:border-primary hover:text-primary'
              }`}
            >
              {y.year}
            </Link>
          ))}
        </nav>
      )}

      {browseLists.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Best fights by category">
          {browseLists.map((l) => (
            <Link
              key={l.slug}
              href={`/fights/best/${l.slug}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                l.slug === list.slug
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-text-secondary hover:border-primary hover:text-primary'
              }`}
            >
              {chipLabel(l)}
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
          <h2 className="mb-3 text-lg font-bold">FAQ: {subject(list)}</h2>
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
        {list.kind === 'org' ? (
          <>
            See the full{' '}
            <Link href={`/orgs/${list.org.slug}`} className="text-primary hover:underline">
              {list.org.name} schedule, results and fan ratings
            </Link>
            , or browse{' '}
          </>
        ) : (
          <>
            Looking for recent standouts? See{' '}
            <Link href="/fights/top" className="text-primary hover:underline">
              top-rated recent fights
            </Link>{' '}
            or browse{' '}
          </>
        )}
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
