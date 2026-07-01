import { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { FightDetailClient } from './FightDetailClient';
import { SITE_URL } from '@/lib/site';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/fights/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Fight' };
    const { fight } = await res.json();
    const f1 = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
    const f2 = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
    const title = `${f1} vs ${f2}`;
    const desc = fight.fightStatus === 'COMPLETED'
      ? `${title} — Rated ${fight.averageRating?.toFixed(1) || 'N/A'}/10 by the community. ${fight.event?.name || ''}`
      : `${title} — ${fight.event?.name || ''} upcoming fight. See hype scores and community predictions.`;
    const canonical = `${SITE_URL}/fights/${fight.slug || id}`;
    return {
      title: title,
      description: desc,
      alternates: { canonical },
      // og:image / twitter:image are supplied by opengraph-image.tsx (the
      // branded dynamic fight card). Don't set a raw fighter photo here or two
      // conflicting og:image tags get emitted.
      openGraph: {
        title,
        description: desc,
        type: 'website',
        url: canonical,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description: desc,
      },
    };
  } catch {
    return { title: 'Fight' };
  }
}

/** Map the Sport enum to a human, schema.org-friendly label. */
function readableSport(s?: string): string {
  if (!s) return 'Mixed Martial Arts';
  const map: Record<string, string> = {
    MMA: 'Mixed Martial Arts',
    BOXING: 'Boxing',
    KICKBOXING: 'Kickboxing',
    MUAY_THAI: 'Muay Thai',
    BKB: 'Bare Knuckle Boxing',
    BAREKNUCKLE: 'Bare Knuckle Boxing',
    GRAPPLING: 'Grappling',
    KARATE: 'Karate',
  };
  return map[s] || s.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

/**
 * SportsEvent structured data for a fight. The AggregateRating (our community
 * fight rating) is the money field — Event is a rich-snippet-eligible type, so
 * this is how our unique fan-rating data can surface as stars in search results.
 * Only emitted when there are real ratings; never fabricated.
 */
function buildFightJsonLd(fight: any, url: string) {
  const f1 = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
  const f2 = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
  const ev = fight.event || {};
  const startDate = ev.mainStartTime || ev.date || undefined;
  const hasRatings =
    typeof fight.totalRatings === 'number' &&
    fight.totalRatings > 0 &&
    typeof fight.averageRating === 'number' &&
    fight.averageRating > 0;

  const ld: any = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${f1} vs ${f2}`,
    sport: readableSport(fight.fighter1?.sport),
    competitor: [
      { '@type': 'Person', name: f1 },
      { '@type': 'Person', name: f2 },
    ],
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  if (startDate) ld.startDate = new Date(startDate).toISOString();
  if (ev.name) ld.superEvent = { '@type': 'SportsEvent', name: ev.name };
  if (ev.venue || ev.location) ld.location = { '@type': 'Place', name: ev.venue || ev.location };
  if (fight.fightStatus === 'UPCOMING' || fight.fightStatus === 'SCHEDULED') {
    ld.eventStatus = 'https://schema.org/EventScheduled';
  }
  if (hasRatings) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(fight.averageRating.toFixed(2)),
      ratingCount: fight.totalRatings,
      bestRating: 10,
      worstRating: 1,
    };
  }
  return ld;
}

export default async function FightDetailPage({ params }: Props) {
  const { id } = await params;

  let initialFight = null;
  try {
    const res = await fetch(`${API_BASE_URL}/fights/${id}`, { next: { revalidate: 60 } });
    if (res.ok) initialFight = (await res.json()).fight;
  } catch {
    // Will load on client
  }

  // Canonicalize to the slug URL (see fighter page for rationale). Outside the
  // try/catch — permanentRedirect throws NEXT_REDIRECT.
  if (initialFight?.slug && initialFight.slug !== id) {
    permanentRedirect(`/fights/${initialFight.slug}`);
  }

  const canonicalUrl = `${SITE_URL}/fights/${initialFight?.slug ?? id}`;
  const jsonLd = initialFight ? buildFightJsonLd(initialFight, canonicalUrl) : null;
  const title = initialFight
    ? `${initialFight.fighter1.firstName} ${initialFight.fighter1.lastName} vs ${initialFight.fighter2.firstName} ${initialFight.fighter2.lastName}`
    : '';

  // JSON-LD + a single semantic <h1> are server-rendered here so they are
  // guaranteed in the initial HTML regardless of client hydration. Client data
  // calls (rate, aggregate-stats, etc.) run on the real UUID — the slug is a
  // URL/SEO concern only, so client behavior is unchanged.
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      {title && (
        <header className="mx-auto mb-6 max-w-3xl text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        </header>
      )}
      <FightDetailClient fightId={initialFight?.id ?? id} initialFight={initialFight} />
    </>
  );
}
