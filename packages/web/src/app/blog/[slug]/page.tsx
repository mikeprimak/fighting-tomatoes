import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPost, getPostSlugs, DEFAULT_POST_IMAGE } from '@/lib/posts';

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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

  return (
    <article className="mx-auto max-w-2xl py-8">
      <Link
        href="/blog"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground"
      >
        <ArrowLeft size={16} />
        All posts
      </Link>

      {post.draft && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          This post is a draft and is hidden in production.
        </div>
      )}

      <h1 className="mb-2 text-3xl font-bold">{post.title}</h1>
      <div className="mb-5 text-sm text-text-secondary">
        {formatDate(post.date)} · {post.author}
      </div>

      <div className="mb-8 aspect-[16/9] w-full overflow-hidden rounded-xl bg-background-secondary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.image || DEFAULT_POST_IMAGE}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="blog-content" dangerouslySetInnerHTML={{ __html: post.html }} />

      {post.tags.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-background-secondary px-2.5 py-1 text-xs text-text-secondary"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
