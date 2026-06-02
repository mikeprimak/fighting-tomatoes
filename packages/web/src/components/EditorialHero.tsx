'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';

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
  // Force UTC so this client-rendered date matches the server-rendered article
  // page (which runs in UTC). Without it, browsers behind UTC show day-1.
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Rotten-Tomatoes-style editorial band: the latest published post, shown above
 * the data feed on the main list pages. Renders nothing until a post loads (no
 * skeleton), so it never pushes the feed around on slow connections.
 */
export function EditorialHero() {
  const { data } = useQuery({
    queryKey: ['editorial'],
    queryFn: fetchEditorial,
    staleTime: 5 * 60 * 1000,
  });

  // The feed arrives already ordered: admin-pinned highlights first (in the
  // order set in the admin panel's Blog tab), then newest-first. So the hero is
  // simply the first post.
  const post = data?.posts?.[0];
  if (!post) return null;

  return (
    <Link
      href={post.url}
      className="group mb-6 block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="sm:flex">
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-background-secondary sm:aspect-auto sm:w-2/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>

        <div className="flex flex-col justify-center p-5 sm:p-6">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            The Latest
            {post.date && (
              <span className="font-normal normal-case tracking-normal text-text-secondary">
                · {formatDate(post.date)}
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold leading-snug text-foreground group-hover:text-primary sm:text-2xl">
            {post.title}
          </h2>

          {post.excerpt && (
            <p className="mt-2 line-clamp-3 text-sm text-text-secondary">{post.excerpt}</p>
          )}

          <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
            Read it
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
