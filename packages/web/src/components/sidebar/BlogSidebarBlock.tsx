'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, ArrowRight } from 'lucide-react';

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
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Blog block, pinned to the top of the "About you" sidebar. The feed arrives
 * already ordered — admin-pinned highlights first (set in the admin panel's Blog
 * tab), then newest. So posts[0] is the main/featured article and posts[1] the
 * secondary, mirroring the admin's hero + secondary picks. A "To blog" button
 * links to the rest. Renders nothing until a post loads.
 */
export function BlogSidebarBlock() {
  const { data } = useQuery({
    queryKey: ['editorial'],
    queryFn: fetchEditorial,
    staleTime: 5 * 60 * 1000,
  });

  const posts = data?.posts ?? [];
  const main = posts[0];
  const secondary = posts[1];
  if (!main) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Newspaper size={11} className="text-primary" />
        From the blog
      </div>

      {/* Main / featured article */}
      <Link href={main.url} className="group block">
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-background-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={main.image}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
        {main.date && (
          <div className="mt-2 text-[10px] font-normal text-text-secondary">{formatDate(main.date)}</div>
        )}
        <h3 className="mt-0.5 line-clamp-3 text-sm font-bold leading-snug text-foreground group-hover:text-primary">
          {main.title}
        </h3>
      </Link>

      {/* Secondary article — compact thumb row */}
      {secondary && (
        <Link
          href={secondary.url}
          className="group mt-3 flex items-center gap-2.5 border-t border-border pt-3"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-background-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={secondary.image}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
          <h4 className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold leading-snug text-foreground group-hover:text-primary">
            {secondary.title}
          </h4>
        </Link>
      )}

      <Link
        href="/blog"
        className="mt-3 flex items-center justify-center gap-1 rounded-md border border-border py-2 text-xs font-medium text-text-secondary transition-colors hover:border-primary/30 hover:text-primary"
      >
        To the blog
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}
