import { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { FighterDetailClient } from './FighterDetailClient';
import { formatRecord } from '@/lib/record';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

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
    const description = tldr
      ? `${name}: ${tldr} Fight ratings and reviews on Good Fights.`
      : `${name}${record ? ` (${record})` : ''}. See fight ratings and reviews on Good Fights.`;
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

  // Client data calls (follow, re-fetch) run on the real UUID — the slug is a
  // URL/SEO concern only, so client behavior is unchanged.
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <FighterDetailClient fighterId={initialFighter?.id ?? id} initialFighter={initialFighter} />
    </>
  );
}
