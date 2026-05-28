import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

const POSTS_DIR = path.join(process.cwd(), 'src/content/posts');

// Fallback share/hero image for posts that don't set their own `image`.
export const DEFAULT_POST_IMAGE = '/good-fights-logo.png';

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  tags: string[];
  draft: boolean;
  /** Hero/share image path (e.g. /blog/my-slug.jpg). Empty string = use DEFAULT_POST_IMAGE. */
  image: string;
  /** Pins this post to the EditorialHero band on the main pages. The newest
   *  `featured: true` post wins; if none are featured we fall back to newest. */
  featured: boolean;
  /** Hides this post from the homepage editorial bands (hero + secondary cards)
   *  while keeping it live on /blog, the sitemap, and the RSS feed. Use to retire
   *  a post from the homepage rotation without unpublishing it. */
  hideFromHome: boolean;
};

export type Post = PostMeta & {
  html: string;
};

const includeDrafts = process.env.NODE_ENV !== 'production';

function parseFile(filename: string): { meta: PostMeta; content: string } | null {
  const fullPath = path.join(POSTS_DIR, filename);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(raw);

  const slug = (data.slug as string) || filename.replace(/\.md$/, '');
  const meta: PostMeta = {
    slug,
    title: (data.title as string) || slug,
    date: (data.date as string) || '',
    author: (data.author as string) || 'Good Fights',
    excerpt: (data.excerpt as string) || '',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    draft: data.draft === true,
    image: (data.image as string) || '',
    featured: data.featured === true,
    hideFromHome: data.hideFromHome === true,
  };

  if (meta.draft && !includeDrafts) return null;
  return { meta, content };
}

function listFiles(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
}

export function getAllPosts(): PostMeta[] {
  return listFiles()
    .map(parseFile)
    .filter((p): p is { meta: PostMeta; content: string } => p !== null)
    .map((p) => p.meta)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostSlugs(): string[] {
  return getAllPosts().map((p) => p.slug);
}

export function getPost(slug: string): Post | null {
  for (const filename of listFiles()) {
    const parsed = parseFile(filename);
    if (parsed && parsed.meta.slug === slug) {
      return { ...parsed.meta, html: marked.parse(parsed.content) as string };
    }
  }
  return null;
}
