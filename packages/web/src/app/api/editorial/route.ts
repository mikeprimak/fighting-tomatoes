import { NextResponse } from 'next/server';
import { DEFAULT_POST_IMAGE } from '@/lib/posts';

// The editorial ORDER (which posts are pinned to the top) is curated live from
// the admin panel and stored in the backend DB, so this route proxies the
// backend feed at request time rather than reading the local markdown at build
// time. ISR-cached for 60s: admin changes go live within a minute, and we don't
// hit Render on every request. (Post CONTENT still lives in git markdown and
// only changes on deploy — the backend serves a synced copy.)
export const revalidate = 60;

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://fightcrewapp-backend.onrender.com/api';

type BackendPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  tags?: string[];
  image?: string;
  featured?: boolean;
  highlighted?: boolean;
  hideFromHome?: boolean;
};

/**
 * Editorial feed for the web home bands (EditorialHero + EditorialSecondary).
 * The backend returns posts already ordered highlights-first-then-date; we drop
 * `hideFromHome` posts and shape the fields the components expect. The hero is
 * simply posts[0] and the secondary cards are posts[1..3].
 */
export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/editorial?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`backend editorial ${res.status}`);
    const { posts } = (await res.json()) as { posts: BackendPost[] };

    const mapped = (posts || [])
      // Drop posts flagged `hideFromHome` from the auto by-date fill, but an
      // explicit admin pin always wins — if you highlighted it, show it.
      .filter((p) => p.highlighted || !p.hideFromHome)
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        date: p.date,
        author: p.author,
        tags: p.tags ?? [],
        image: p.image || DEFAULT_POST_IMAGE,
        featured: p.highlighted ?? p.featured ?? false,
        url: `/blog/${p.slug}`,
      }));

    return NextResponse.json({ posts: mapped });
  } catch {
    // Backend unreachable — degrade gracefully. The home bands render nothing
    // on an empty list rather than erroring.
    return NextResponse.json({ posts: [] });
  }
}
