import { NextResponse } from 'next/server';
import { getAllPosts, DEFAULT_POST_IMAGE } from '@/lib/posts';

// Posts only change on redeploy, so compute this once at build time and serve
// static JSON. Reading the markdown files via fs only works at build time on
// Vercel (the source files aren't in the runtime lambda) — force-static fits both.
export const dynamic = 'force-static';

/**
 * Editorial feed consumed by the web hero sections and (phase 2) the mobile
 * Home tab. Single source of truth: the markdown files in src/content/posts.
 * Drafts are already stripped from getAllPosts() in production builds.
 */
export async function GET() {
  const posts = getAllPosts().map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    date: p.date,
    author: p.author,
    tags: p.tags,
    image: p.image || DEFAULT_POST_IMAGE,
    url: `/blog/${p.slug}`,
  }));

  return NextResponse.json({ posts });
}
