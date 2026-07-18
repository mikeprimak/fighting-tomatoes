import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPost, getPostSlugs, DEFAULT_POST_IMAGE } from '@/lib/posts';
import { SITE_URL } from '@/lib/site';
import { BlogArticle } from '@/components/BlogArticle';
import { ExploreLinks, type ExploreLink } from '@/components/ExploreLinks';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

/**
 * Internal-linking pass (Own The SERPs, 2026-07-17): blog posts that embed
 * fight cards (`data-event-id` slots, hydrated client-side) get a
 * server-rendered link to the corresponding programmatic event page, so link
 * equity flows from ranking articles into the event/fight page graph. The
 * embed attribute already carries the event slug-or-uuid.
 */
async function buildEventLinks(html: string): Promise<ExploreLink[]> {
  const keys = [...new Set([...html.matchAll(/data-event-id="([^"]+)"/g)].map((m) => m[1]))].slice(0, 5);
  const links: ExploreLink[] = [];
  for (const key of keys) {
    let label = 'Full fight card & fan ratings';
    let href = `/events/${key}`;
    try {
      const res = await fetch(`${API_BASE_URL}/events/${key}`, { next: { revalidate: 300 } });
      if (res.ok) {
        const { event } = await res.json();
        if (event?.name) label = `${event.name}: full card & fan ratings`;
        if (event?.slug) href = `/events/${event.slug}`;
      }
    } catch {
      // Keep the slug-based fallback link.
    }
    links.push({ href, label });
  }
  return links;
}

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  // Shares prefer the dedicated stat-card ogImage when a post provides one;
  // the on-page hero stays `image`.
  const image = post.ogImage || post.image || DEFAULT_POST_IMAGE;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [image],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const postUrl = `${SITE_URL}/blog/${post.slug}`;
  const postImage = post.image || DEFAULT_POST_IMAGE;
  const imageUrl = postImage.startsWith('http') ? postImage : `${SITE_URL}${postImage}`;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: [imageUrl],
    datePublished: post.date,
    dateModified: post.updated || post.date,
    author: { '@type': 'Organization', name: post.author || 'Good Fights', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Good Fights',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/good-fights-logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: postUrl },
    ],
  };

  const faqLd =
    post.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: post.faqs.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null;

  const eventLd = post.event
    ? {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: post.event.name,
        startDate: post.event.startDate,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        image: [imageUrl],
        description: post.excerpt,
        ...(post.event.venue
          ? {
              location: {
                '@type': 'Place',
                name: post.event.venue,
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: post.event.city,
                  addressRegion: post.event.region,
                  addressCountry: post.event.country || 'US',
                },
              },
            }
          : {}),
        ...(post.event.performers
          ? { competitor: post.event.performers.map((name) => ({ '@type': 'Person', name })) }
          : {}),
        organizer: { '@type': 'Organization', name: 'UFC', url: 'https://www.ufc.com' },
      }
    : null;

  const jsonLd = [
    articleLd,
    breadcrumbLd,
    ...(faqLd ? [faqLd] : []),
    ...(eventLd ? [eventLd] : []),
  ];

  const eventLinks = await buildEventLinks(post.html);

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <BlogArticle post={post} />
      <ExploreLinks
        links={[...eventLinks, { href: '/schedule', label: 'Fight schedule' }, { href: '/fights/best/2026', label: 'Best fights of 2026' }]}
        className="mx-auto mt-8 max-w-3xl"
      />
    </>
  );
}
