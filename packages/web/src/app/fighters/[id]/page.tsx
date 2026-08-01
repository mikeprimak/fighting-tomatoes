import { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { FighterDetailClient } from './FighterDetailClient';
import { AppDownloadFooter } from '@/components/layout/AppDownloadFooter';
import { FighterFightStatus, nextFightSentence, pickNextAndLastFight } from './FighterFightStatus';
import { ExploreLinks, type ExploreLink } from '@/components/ExploreLinks';
import { divisionLabel, divisionSlug } from '@/lib/divisions';
import { formatRecord } from '@/lib/record';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

// ISR — see the matching comment on /fights/[id]. This was the single
// highest-volume route in the 2026-07-29 crawl (3,751 invocations in 6h).
// 60 matches the fetch revalidate below, so freshness is unchanged. The empty
// generateStaticParams is what actually enables runtime ISR on a dynamic
// segment — see the comment on /fights/[id].
export const revalidate = 60;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/fighters/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Fighter' };
    const { fighter } = await res.json();
    const name = `${fighter.firstName} ${fighter.lastName}`;
    // Prefer the AI profile tldr (confidence-gated) for a richer, indexable
    // description; fall back to the bare record line.
    const conf = fighter.aiProfileConfidence ?? 0;
    const tldr = conf >= 0.5 ? (fighter.aiProfile?.tldr as string | undefined) : undefined;
    const record = formatRecord(fighter);
    let description = tldr
      ? `${name}: ${tldr} Fight ratings and reviews on Good Fights.`
      : `${name}${record ? ` (${record})` : ''}. See fight ratings and reviews on Good Fights.`;
    // Lead the SERP snippet with the next-fight answer when one is booked —
    // the "who is X fighting next" query family this page targets. Same fetch
    // URL + options as the page body, so Next dedupes it within the request.
    try {
      const fightsRes = await fetch(`${API_BASE_URL}/fights?fighterId=${fighter.id}&limit=50`, { next: { revalidate: 60 } });
      if (fightsRes.ok) {
        const { next: nextFight } = pickNextAndLastFight((await fightsRes.json()).fights || []);
        const sentence = nextFightSentence(fighter, nextFight);
        if (sentence) description = `${sentence} ${description}`;
      }
    } catch {
      // Description stands without the next-fight lead.
    }
    return {
      title: name,
      description,
      alternates: { canonical: `${SITE_URL}/fighters/${fighter.slug || id}` },
      // SEO index gate: pages that fail the backend `shouldIndex` predicate render
      // for users but are kept out of Google's index (and the sitemap). follow:true
      // so link equity still flows through to indexable pages. See the programmatic-SEO plan.
      ...(fighter.shouldIndex === false ? { robots: { index: false, follow: true } } : {}),
      openGraph: {
        title: name,
        description: tldr || `${fighter.weightClass || ''}${record ? ` — ${record}` : ''}`.trim(),
        ...(fighter.profileImage ? { images: [fighter.profileImage] } : {}),
      },
    };
  } catch {
    return { title: 'Fighter' };
  }
}

/**
 * Person structured data for a fighter. The name/record/profile content already
 * server-renders via the client component's initial pass; this adds the machine-
 * readable entity so fighter pages can surface as knowledge-panel-style results.
 */
function buildFighterJsonLd(fighter: any, url: string) {
  const name = `${fighter.firstName} ${fighter.lastName}`;
  const ld: any = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  if (fighter.nickname) ld.alternateName = fighter.nickname;
  if (fighter.profileImage) ld.image = fighter.profileImage;
  // Physical facts (SEO step 7). Backend stores display strings (height `5' 11"`,
  // reach `76"`); schema.org accepts Text for these Person properties.
  if (fighter.nationality) ld.nationality = { '@type': 'Country', name: fighter.nationality };
  if (fighter.dateOfBirth) ld.birthDate = String(fighter.dateOfBirth).slice(0, 10);
  if (fighter.height) ld.height = fighter.height;
  // Confidence-gated tldr doubles as the entity description (same floor the UI uses).
  const conf = fighter.aiProfileConfidence ?? 0;
  if (conf >= 0.5 && fighter.aiProfile?.tldr) ld.description = fighter.aiProfile.tldr;
  return ld;
}

export default async function FighterDetailPage({ params }: Props) {
  const { id } = await params;

  let initialFighter = null;
  try {
    const res = await fetch(`${API_BASE_URL}/fighters/${id}`, { next: { revalidate: 60 } });
    if (res.ok) initialFighter = (await res.json()).fighter;
  } catch {
    // Client will load
  }

  // Canonicalize to the slug URL: if reached by legacy UUID (or any non-canonical
  // param) and the fighter has a slug, 308-redirect so all link equity consolidates
  // on /fighters/<slug>. permanentRedirect throws NEXT_REDIRECT, so it must be
  // outside the try/catch above.
  if (initialFighter?.slug && initialFighter.slug !== id) {
    permanentRedirect(`/fighters/${initialFighter.slug}`);
  }

  const canonicalUrl = `${SITE_URL}/fighters/${initialFighter?.slug ?? id}`;
  const jsonLd = initialFighter ? buildFighterJsonLd(initialFighter, canonicalUrl) : null;

  // Fight history is fetched server-side so the fighter's fights (and their
  // /fights/<slug> links) are in the SSR HTML — without this the history was a
  // client-only spinner and fighter pages contributed nothing to the fight-page
  // link graph (programmatic-SEO step 6). Keyed off the real UUID like the
  // event page (the ?fighterId= filter only matches UUIDs).
  const realId = initialFighter?.id ?? id;
  let initialFights: any[] = [];
  try {
    const fightsRes = await fetch(`${API_BASE_URL}/fights?fighterId=${realId}&limit=50`, { next: { revalidate: 60 } });
    if (fightsRes.ok) initialFights = (await fightsRes.json()).fights || [];
  } catch {
    // Client will load
  }

  // Internal-linking pass (Own The SERPs, 2026-07-17): fighter page →
  // division hub → fighters hub → schedule, in SSR HTML.
  const exploreLinks: ExploreLink[] = [];
  if (initialFighter?.weightClass) {
    exploreLinks.push({
      href: `/fighters/division/${divisionSlug(initialFighter.weightClass)}`,
      label: `${divisionLabel(initialFighter.weightClass)} fighters`,
    });
  }
  exploreLinks.push({ href: '/fighters', label: 'All fighters' });
  exploreLinks.push({ href: '/schedule', label: 'Fight schedule' });

  // Client data calls (follow, re-fetch) run on the real UUID — the slug is a
  // URL/SEO concern only, so client behavior is unchanged.
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <FighterDetailClient
        fighterId={realId}
        initialFighter={initialFighter}
        initialFights={initialFights}
        fightStatusBlock={<FighterFightStatus fighter={initialFighter} fights={initialFights} />}
      />
      <ExploreLinks links={exploreLinks} className="mx-auto mt-8 max-w-3xl" />
      <AppDownloadFooter />
    </>
  );
}
