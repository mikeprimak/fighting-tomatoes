import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

// html:true passes the posts' embedded raw HTML (<figure>/<img>/inline styles)
// through to the rendered output, matching how the web renders these posts.
const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

/**
 * Editorial blog endpoint.
 *
 * Serves the Good Fights editorial blog posts (markdown + frontmatter) as JSON
 * metadata so the mobile app can render a "blog" section that deep-links into
 * the web blog (https://<web-host>/blog/<slug>).
 *
 * SINGLE SOURCE OF TRUTH: posts are authored in `packages/web/src/content/posts`.
 * `scripts/syncBlogPosts.js` copies them into `packages/backend/src/content/posts`
 * (gitignored) on `dev` and `build`, so the backend serves the same content the
 * web app renders. Do NOT edit the backend copy by hand — edit the web posts.
 */

// Resolve the posts directory in a way that works in dev (nodemon from package
// root) and in production (compiled `dist`, run with cwd = packages/backend).
// tsc does not copy `.md` files into `dist`, so we anchor on `src/content/posts`.
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

interface EditorialPost {
  slug: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  tags: string[];
  image: string;
  featured: boolean;
  hideFromHome: boolean;
  /** Set by orderByHighlights(): true if pinned via the admin highlights list. */
  highlighted?: boolean;
}

// The admin-curated lineup lives in a single SystemConfig row (key below, value
// = ordered string[] of post slugs). See routes/adminBlog.ts. Stored in the DB so
// it's editable live from admin.html with no redeploy and no migration.
const HIGHLIGHTS_KEY = 'blog_highlights';

/**
 * Reorder the date-sorted post list so the admin's pinned posts lead, in the
 * order they pinned them; the rest follow newest-first. With no highlights set
 * yet, we preserve the prior behavior: posts flagged `featured` in frontmatter
 * float to the top, then the rest by date — so the home page never changes shape
 * until an admin actually curates a lineup.
 */
async function orderByHighlights(prisma: any, posts: EditorialPost[]): Promise<EditorialPost[]> {
  let highlights: string[] = [];
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: HIGHLIGHTS_KEY } });
    if (cfg && Array.isArray(cfg.value)) {
      highlights = (cfg.value as unknown[]).filter((s): s is string => typeof s === 'string');
    }
  } catch {
    // systemConfig unreadable — fall through to the featured/date ordering below.
  }

  if (highlights.length > 0) {
    const bySlug = new Map(posts.map((p) => [p.slug, p]));
    const picked: EditorialPost[] = [];
    const pickedSlugs = new Set<string>();
    for (const slug of highlights) {
      const p = bySlug.get(slug);
      if (p && !pickedSlugs.has(slug)) {
        picked.push({ ...p, highlighted: true });
        pickedSlugs.add(slug);
      }
    }
    const rest = posts.filter((p) => !pickedSlugs.has(p.slug)).map((p) => ({ ...p, highlighted: false }));
    return [...picked, ...rest];
  }

  const featured = posts.filter((p) => p.featured).map((p) => ({ ...p, highlighted: true }));
  const rest = posts.filter((p) => !p.featured).map((p) => ({ ...p, highlighted: false }));
  return [...featured, ...rest];
}

function parsePost(postsDir: string, filename: string): EditorialPost | null {
  try {
    const raw = fs.readFileSync(path.join(postsDir, filename), 'utf8');
    const { data } = matter(raw);

    // Skip drafts. NOTE: `hideFromHome` is a web-app curation flag (it controls
    // the website's home rotation) and is intentionally NOT honored here — the
    // mobile feed shows every published post by date.
    if (data.draft === true) return null;

    const slug = (data.slug as string) || filename.replace(/\.md$/, '');
    return {
      slug,
      title: (data.title as string) || slug,
      date: (data.date as string) || '',
      author: (data.author as string) || 'Good Fights',
      excerpt: (data.excerpt as string) || '',
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      image: (data.image as string) || '',
      featured: data.featured === true,
      hideFromHome: data.hideFromHome === true,
    };
  } catch {
    return null;
  }
}

// Full post incl. rendered HTML body — used by the native mobile reader.
// Mirrors the web's `getPost` (marked.parse, raw-HTML passthrough) so the app
// renders the same content the website does.
interface EditorialFullPost extends EditorialPost {
  html: string;
}

function parseFullPost(
  postsDir: string,
  filename: string,
  { allowDraft }: { allowDraft: boolean },
): EditorialFullPost | null {
  try {
    const raw = fs.readFileSync(path.join(postsDir, filename), 'utf8');
    const { data, content } = matter(raw);

    if (data.draft === true && !allowDraft) return null;

    const slug = (data.slug as string) || filename.replace(/\.md$/, '');
    return {
      slug,
      title: (data.title as string) || slug,
      date: (data.date as string) || '',
      author: (data.author as string) || 'Good Fights',
      excerpt: (data.excerpt as string) || '',
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
      image: (data.image as string) || '',
      featured: data.featured === true,
      hideFromHome: data.hideFromHome === true,
      html: md.render(content),
    };
  } catch {
    return null;
  }
}

export default async function editorialRoutes(fastify: FastifyInstance) {
  fastify.get('/editorial', {
    schema: {
      description: 'Get Good Fights editorial blog posts (metadata only)',
      tags: ['editorial'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            posts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  slug: { type: 'string' },
                  title: { type: 'string' },
                  date: { type: 'string' },
                  author: { type: 'string' },
                  excerpt: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  image: { type: 'string' },
                  featured: { type: 'boolean' },
                  highlighted: { type: 'boolean' },
                  hideFromHome: { type: 'boolean' },
                },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = 10 } = request.query as { limit?: number };

    try {
      const postsDir = resolvePostsDir();
      if (!postsDir) {
        return reply.send({ posts: [] });
      }

      const all = fs
        .readdirSync(postsDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => parsePost(postsDir, f))
        .filter((p): p is EditorialPost => p !== null)
        // Newest first by frontmatter date.
        .sort((a, b) => (a.date < b.date ? 1 : -1));

      // Pinned highlights lead, then the rest by date. Slice AFTER ordering so a
      // pinned older post can't get dropped by the limit before it floats up.
      const ordered = await orderByHighlights(fastify.prisma, all);
      const posts = ordered.slice(0, limit);

      return reply.send({ posts });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to load editorial posts');
      return reply.status(500).send({ error: 'Failed to load editorial posts' });
    }
  });

  // Single post with rendered HTML body, for the native in-app reader.
  fastify.get('/editorial/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };

    try {
      const postsDir = resolvePostsDir();
      if (!postsDir) {
        return reply.status(404).send({ error: 'Post not found' });
      }

      // Drafts are visible everywhere except production (mirrors the web).
      const allowDraft = process.env.NODE_ENV !== 'production';

      const files = fs.readdirSync(postsDir).filter((f) => f.endsWith('.md'));
      for (const filename of files) {
        const post = parseFullPost(postsDir, filename, { allowDraft });
        if (post && post.slug === slug) {
          return reply.send({ post });
        }
      }

      return reply.status(404).send({ error: 'Post not found' });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to load editorial post');
      return reply.status(500).send({ error: 'Failed to load editorial post' });
    }
  });
}
