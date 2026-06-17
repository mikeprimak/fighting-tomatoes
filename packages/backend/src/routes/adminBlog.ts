/**
 * Admin CRUD for the blog "highlights" lineup — the ordered list of post slugs
 * that float to the top of the editorial feed (the web home hero + secondary
 * cards, and the front of the mobile Home "The Latest" row). Everything not in
 * the list shows newest-first.
 *
 * Stored as a single SystemConfig row (key `blog_highlights`, value = string[]
 * of slugs). DB-backed on purpose: editable live from admin.html with no deploy
 * and no migration. The posts themselves stay authored as markdown in
 * packages/web/src/content/posts (synced into the backend by
 * scripts/syncBlogPosts.js) — this only controls ORDER, not content.
 *
 * Consumed by routes/editorial.ts → orderByHighlights().
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { requireAdmin } from '../middleware/auth';

const HIGHLIGHTS_KEY = 'blog_highlights';

// Mirror editorial.ts: html:true passes embedded raw HTML through so drafts
// preview the same way they'll render live on the web.
const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

// Mirror of editorial.ts resolvePostsDir() — works in dev (cwd = package root)
// and prod (compiled dist, run with cwd = packages/backend).
function resolvePostsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), 'src/content/posts'),
    path.resolve(__dirname, '../content/posts'),
    path.resolve(__dirname, '../../src/content/posts'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

interface PostRow {
  slug: string;
  title: string;
  date: string;
  hideFromHome: boolean;
}

// Every published (non-draft) post, newest first — the pool the admin picks from.
function listPublishedPosts(): PostRow[] {
  const dir = resolvePostsDir();
  if (!dir) return [];
  const rows: PostRow[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    try {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.draft === true) continue;
      rows.push({
        slug: (data.slug as string) || f.replace(/\.md$/, ''),
        title: (data.title as string) || f.replace(/\.md$/, ''),
        date: (data.date as string) || '',
        hideFromHome: data.hideFromHome === true,
      });
    } catch {
      // Skip unparseable files rather than failing the whole list.
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

interface DraftRow {
  slug: string;
  title: string;
  date: string;
  updated: string;
  excerpt: string;
  image: string;
}

// Every DRAFT post, newest first. This is the only place drafts are exposed,
// and it's admin-gated, so Mike can read unpublished posts without a dev server.
function listDrafts(): DraftRow[] {
  const dir = resolvePostsDir();
  if (!dir) return [];
  const rows: DraftRow[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    try {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.draft !== true) continue;
      rows.push({
        slug: (data.slug as string) || f.replace(/\.md$/, ''),
        title: (data.title as string) || f.replace(/\.md$/, ''),
        date: (data.date as string) || '',
        updated: (data.updated as string) || '',
        excerpt: (data.excerpt as string) || '',
        image: (data.image as string) || '',
      });
    } catch {
      // Skip unparseable files.
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Render a single draft to HTML for inline preview in admin.html.
function renderDraft(slug: string): (DraftRow & { html: string }) | null {
  const dir = resolvePostsDir();
  if (!dir) return null;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    try {
      const { data, content } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.draft !== true) continue;
      const fileSlug = (data.slug as string) || f.replace(/\.md$/, '');
      if (fileSlug !== slug) continue;
      return {
        slug: fileSlug,
        title: (data.title as string) || fileSlug,
        date: (data.date as string) || '',
        updated: (data.updated as string) || '',
        excerpt: (data.excerpt as string) || '',
        image: (data.image as string) || '',
        html: md.render(content),
      };
    } catch {
      // Skip unparseable files.
    }
  }
  return null;
}

async function readHighlights(prisma: any): Promise<string[]> {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: HIGHLIGHTS_KEY } });
  if (cfg && Array.isArray(cfg.value)) {
    return (cfg.value as unknown[]).filter((s): s is string => typeof s === 'string');
  }
  return [];
}

export default async function adminBlogRoutes(fastify: FastifyInstance) {
  // Current highlights + the full pool of published posts (for the picker UI).
  fastify.get('/admin/blog-highlights', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (_request, reply) => {
    const posts = listPublishedPosts();
    const known = new Set(posts.map((p) => p.slug));
    // Drop slugs for posts that no longer exist (deleted/renamed) so the UI stays clean.
    const highlights = (await readHighlights(fastify.prisma)).filter((s) => known.has(s));
    return reply.send({ highlights, posts });
  });

  // Replace the ordered highlights list.
  fastify.put('/admin/blog-highlights', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as { slugs?: unknown };
    if (!Array.isArray(body?.slugs) || !body.slugs.every((s) => typeof s === 'string')) {
      return reply.code(400).send({ error: 'slugs must be an array of strings' });
    }
    // Keep only slugs that map to a real published post; preserve order, drop dups.
    const known = new Set(listPublishedPosts().map((p) => p.slug));
    const slugs: string[] = [];
    for (const s of body.slugs as string[]) {
      if (known.has(s) && !slugs.includes(s)) slugs.push(s);
    }

    await fastify.prisma.systemConfig.upsert({
      where: { key: HIGHLIGHTS_KEY },
      create: { key: HIGHLIGHTS_KEY, value: slugs },
      update: { value: slugs },
    });
    return reply.send({ highlights: slugs });
  });

  // List unpublished (draft) posts so an admin can review them before flipping
  // them live. Drafts are hidden everywhere else in production.
  fastify.get('/admin/drafts', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (_request, reply) => {
    return reply.send({ drafts: listDrafts() });
  });

  // Full rendered HTML of one draft, for inline preview in admin.html.
  fastify.get('/admin/drafts/:slug', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const post = renderDraft(slug);
    if (!post) return reply.code(404).send({ error: 'Draft not found' });
    return reply.send({ post });
  });
}
