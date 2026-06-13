import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

const POSTS_DIR = path.join(process.cwd(), 'src/content/posts');

// Fallback share/hero image for posts that don't set their own `image`.
export const DEFAULT_POST_IMAGE = '/good-fights-logo.png';

/** Optional event block (frontmatter `event:`) → emits SportsEvent JSON-LD. */
export type PostEvent = {
  name: string;
  startDate: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  performers?: string[];
};

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  /** Optional last-updated date (ISO). Shown as "Updated:" and used for dateModified. */
  updated: string;
  author: string;
  excerpt: string;
  tags: string[];
  draft: boolean;
  event: PostEvent | null;
  /** Hero/share image path (e.g. /blog/my-slug.jpg). Empty string = use DEFAULT_POST_IMAGE. */
  image: string;
  /** How the hero image fills its frame. `cover` (default) crops to a 16:9 box;
   *  `contain` shows the whole image centered (use for tall portrait photos whose
   *  faces would otherwise be cropped). */
  imageFit: 'cover' | 'contain';
  /** Pins this post to the EditorialHero band on the main pages. The newest
   *  `featured: true` post wins; if none are featured we fall back to newest. */
  featured: boolean;
  /** Hides this post from the homepage editorial bands (hero + secondary cards)
   *  while keeping it live on /blog, the sitemap, and the RSS feed. Use to retire
   *  a post from the homepage rotation without unpublishing it. */
  hideFromHome: boolean;
};

export type Faq = { question: string; answer: string };

export type Post = PostMeta & {
  html: string;
  /** Q&A pairs auto-extracted from `## ...?` headings, for FAQPage JSON-LD. */
  faqs: Faq[];
};

/** Strip markdown formatting down to plain text (for structured-data answers). */
function stripMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/<[^>]+>/g, '') // raw HTML tags (e.g. anchors)
    .replace(/[*_`#]/g, '') // emphasis / heading marks
    .replace(/^[-*]\s+/gm, '') // list bullets
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull FAQ pairs out of a post: every `## ` heading that ends in `?` becomes a
 * question, and the prose beneath it (skipping images and italic captions) is the
 * answer. Used to emit FAQPage structured data so Google can parse the Q&A.
 */
function extractFaqs(markdown: string): Faq[] {
  const lines = markdown.split('\n');
  const faqs: Faq[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^##\s+(.+)$/);
    const qMark = m ? m[1].indexOf('?') : -1;
    if (m && qMark !== -1) {
      // Question = text up to and including the first '?', so headings like
      // "...outside the US? (Canada, UK...)" yield a clean question.
      const question = stripMarkdown(m[1].slice(0, qMark + 1));
      const answerLines: string[] = [];
      i++;
      while (i < lines.length && !/^##\s+/.test(lines[i])) {
        const line = lines[i].trim();
        const isImage = line.startsWith('![');
        const isCaption = /^\*[^*].*\*$/.test(line); // italic-only caption line
        const isAnchor = line.startsWith('<a ');
        if (line && !isImage && !isCaption && !isAnchor) answerLines.push(line);
        i++;
      }
      const answer = stripMarkdown(answerLines.join(' '));
      if (answer) faqs.push({ question, answer });
    } else {
      i++;
    }
  }
  return faqs;
}

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
    updated: (data.updated as string) || '',
    author: (data.author as string) || 'Good Fights',
    excerpt: (data.excerpt as string) || '',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    draft: data.draft === true,
    event: (data.event as PostEvent) || null,
    image: (data.image as string) || '',
    imageFit: data.imageFit === 'contain' ? 'contain' : 'cover',
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
      return {
        ...parsed.meta,
        html: marked.parse(parsed.content) as string,
        faqs: extractFaqs(parsed.content),
      };
    }
  }
  return null;
}
