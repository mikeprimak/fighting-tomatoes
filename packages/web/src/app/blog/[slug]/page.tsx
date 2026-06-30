import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPost, getPostSlugs, DEFAULT_POST_IMAGE } from '@/lib/posts';
import { SITE_URL } from '@/lib/site';
import { BlogArticle } from '@/components/BlogArticle';

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
  const image = post.image || DEFAULT_POST_IMAGE;
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
    </>
  );
}
