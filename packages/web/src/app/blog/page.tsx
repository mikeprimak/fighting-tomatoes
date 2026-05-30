import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts, DEFAULT_POST_IMAGE } from '@/lib/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Combat sports previews, takes, and breakdowns from Good Fights.',
  alternates: {
    types: {
      'application/rss+xml': '/blog/feed.xml',
    },
  },
};

function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <h1 className="mb-6 text-2xl font-bold">Blog</h1>

      {posts.length === 0 ? (
        <p className="text-sm text-text-secondary">No posts yet. Check back soon.</p>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-border pb-6 last:border-b-0">
              <Link href={`/blog/${post.slug}`} className="group flex gap-4">
                <div className="aspect-[16/10] w-28 shrink-0 overflow-hidden rounded-lg bg-background-secondary sm:w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.image || DEFAULT_POST_IMAGE}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2 text-xs text-text-secondary">
                    <span>{formatDate(post.date)}</span>
                    {post.draft && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
                        Draft
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-primary">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-1 text-sm text-text-secondary">{post.excerpt}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
