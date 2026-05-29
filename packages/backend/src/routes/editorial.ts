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
}

function parsePost(postsDir: string, filename: string): EditorialPost | null {
  try {
    const raw = fs.readFileSync(path.join(postsDir, filename), 'utf8');
    const { data } = matter(raw);

    // Skip drafts and posts explicitly hidden from the home rotation.
    if (data.draft === true || data.hideFromHome === true) return null;

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

      const posts = fs
        .readdirSync(postsDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => parsePost(postsDir, f))
        .filter((p): p is EditorialPost => p !== null)
        // Newest first by frontmatter date.
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, limit);

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
