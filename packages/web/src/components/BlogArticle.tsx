import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Post } from '@/lib/posts';
import { DEFAULT_POST_IMAGE } from '@/lib/posts';
import { SITE_URL } from '@/lib/site';
import { ShareButtons } from '@/components/ShareButtons';
import { TweetEmbeds } from '@/components/TweetEmbeds';
import { FacebookEmbeds } from '@/components/FacebookEmbeds';
import { BlogFightCards } from '@/components/BlogFightCards';

function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The visual body of a blog article — back-link, header, hero image, rendered
 * markdown, embeds, share buttons, and tags. Shared by the live post page
 * (`/blog/[slug]`) and the admin preview page (`/blog-preview/[slug]`) so a
 * preview looks byte-for-byte like the published article. SEO/JSON-LD lives in
 * the live page only.
 */
export function BlogArticle({ post }: { post: Post }) {
  return (
    <article className="mx-auto max-w-2xl pb-8">
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
        Published: {formatDate(post.date)}
        {post.updated && post.updated !== post.date ? ` · Updated: ${formatDate(post.updated)}` : ''} · {post.author}
      </div>

      {post.imageFit === 'contain' ? (
        <div className="mb-8 flex w-full justify-center overflow-hidden rounded-xl bg-background-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image || DEFAULT_POST_IMAGE}
            alt=""
            aria-hidden="true"
            className="max-h-[70vh] w-auto object-contain"
          />
        </div>
      ) : (
        <div className="mb-8 aspect-[16/9] w-full overflow-hidden rounded-xl bg-background-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image || DEFAULT_POST_IMAGE}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="blog-content" dangerouslySetInnerHTML={{ __html: post.html }} />
      <TweetEmbeds />
      <FacebookEmbeds />
      <BlogFightCards />

      <ShareButtons url={`${SITE_URL}/blog/${post.slug}`} title={post.title} />

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
