'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

type EditorialPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  tags: string[];
  image: string;
  featured?: boolean;
  url: string;
};

async function fetchEditorial(): Promise<{ posts: EditorialPost[] }> {
  const res = await fetch('/api/editorial');
  if (!res.ok) throw new Error('Failed to load editorial');
  return res.json();
}

function formatDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Three smaller post cards shown beneath the EditorialHero. Mirrors the hero's
 * selection (featured-or-newest) so it excludes whatever the hero is already
 * showing, then renders the next three posts. Renders nothing until loaded.
 */
export function EditorialSecondary() {
  const { data } = useQuery({
    queryKey: ['editorial'],
    queryFn: fetchEditorial,
    staleTime: 5 * 60 * 1000,
  });

  const posts = data?.posts;
  if (!posts || posts.length === 0) return null;

  // The feed is already ordered (highlights first, then newest). The hero takes
  // posts[0]; these are the next three.
  const rest = posts.slice(1, 4);
  if (rest.length === 0) return null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {rest.map((post) => (
        <Link
          key={post.slug}
          href={post.url}
          className="group flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/40"
        >
          <div className="relative aspect-square h-16 w-16 shrink-0 overflow-hidden rounded-md bg-background-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>

          <div className="min-w-0 flex-1">
            {post.date && (
              <div className="mb-0.5 text-[11px] font-normal text-text-secondary">
                {formatDate(post.date)}
              </div>
            )}
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground group-hover:text-primary">
              {post.title}
            </h3>
          </div>
        </Link>
      ))}
    </div>
  );
}
