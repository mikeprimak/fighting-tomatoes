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

// Find the markdown FILENAME of a draft by its frontmatter slug (slug may differ
// from the filename), so we can target the exact file on GitHub.
function findDraftFile(slug: string): string | null {
  const dir = resolvePostsDir();
  if (!dir) return null;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    try {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (data.draft !== true) continue;
      const fileSlug = (data.slug as string) || f.replace(/\.md$/, '');
      if (fileSlug === slug) return f;
    } catch {
      // Skip unparseable files.
    }
  }
  return null;
}

// Surgically flip `draft: true` -> `draft: false` inside the leading frontmatter
// block ONLY, preserving the rest of the file byte-for-byte (no YAML re-serialize,
// so comments/quoting/ordering survive). Returns null if there's no `draft: true`
// line in the frontmatter (already published, or no flag).
function flipDraftFalse(raw: string): string | null {
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) return null;
  const [full, open, body, close] = m;
  if (!/^draft:[ \t]*true[ \t]*$/m.test(body)) return null;
  const newBody = body.replace(/^draft:[ \t]*true[ \t]*$/m, 'draft: false');
  return raw.replace(full, open + newBody + close);
}

const GITHUB_REPO = 'mikeprimak/fighting-tomatoes';

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

  // Publish a draft: flip `draft: false` and commit to main via the GitHub
  // Contents API (git is the canonical source — the backend FS is ephemeral and
  // Vercel builds the web blog straight from the repo). The commit triggers the
  // web auto-deploy (Vercel) so the post goes live at goodfights.app/blog.
  //
  // Render's buildFilter ignores packages/web/** and **/*.md, so this commit does
  // NOT redeploy the backend — which would leave the mobile /api/editorial feed
  // (served from the build-time copy) stale until the next backend deploy. To
  // avoid that, we ALSO flip the backend's local synced copy at runtime;
  // /api/editorial reads from disk per-request, so mobile updates immediately,
  // and the local write is harmless once the next redeploy regenerates it from
  // the now-matching git source.
  fastify.post('/admin/drafts/:slug/publish', {
    preValidation: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return reply.code(500).send({
        error: 'GITHUB_TOKEN is not configured on this server, so the panel cannot publish. Set it on Render (needs contents:write on ' + GITHUB_REPO + '), or flip draft:false in the post file and push.',
      });
    }

    const filename = findDraftFile(slug);
    if (!filename) {
      return reply.code(404).send({ error: 'No draft found for that slug (it may already be published).' });
    }

    const repoPath = `packages/web/src/content/posts/${filename}`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${repoPath}`;
    const ghHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'goodfights-admin',
    };

    try {
      // 1. Read the current file (need its blob sha + content) from main.
      const getRes = await fetch(`${apiUrl}?ref=main`, { headers: ghHeaders });
      if (!getRes.ok) {
        const t = await getRes.text();
        return reply.code(502).send({ error: `GitHub read failed (${getRes.status}): ${t.slice(0, 300)}` });
      }
      const getJson = (await getRes.json()) as { sha: string; content: string };
      const current = Buffer.from(getJson.content, 'base64').toString('utf8');

      // 2. Flip the frontmatter flag.
      const updated = flipDraftFalse(current);
      if (!updated) {
        return reply.code(409).send({ error: 'The post in the repo is not marked draft:true (it may already be published).' });
      }

      // 3. Commit back to main.
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `chore(blog): publish "${slug}" via admin panel`,
          content: Buffer.from(updated, 'utf8').toString('base64'),
          sha: getJson.sha,
          branch: 'main',
        }),
      });
      if (!putRes.ok) {
        const t = await putRes.text();
        return reply.code(502).send({ error: `GitHub commit failed (${putRes.status}): ${t.slice(0, 300)}` });
      }
      const putJson = (await putRes.json()) as { commit?: { html_url?: string } };

      // 4. Best-effort: flip the backend's local copy so /api/editorial (mobile
      //    "Latest") reflects it now, without waiting for a backend redeploy.
      let localUpdated = false;
      try {
        const dir = resolvePostsDir();
        if (dir) {
          const local = path.join(dir, filename);
          if (fs.existsSync(local)) {
            const flipped = flipDraftFalse(fs.readFileSync(local, 'utf8'));
            if (flipped) {
              fs.writeFileSync(local, flipped, 'utf8');
              localUpdated = true;
            }
          }
        }
      } catch {
        // Non-fatal: web still publishes via the commit; mobile catches up on next deploy.
      }

      return reply.send({
        success: true,
        slug,
        commitUrl: putJson.commit?.html_url || null,
        localUpdated,
        message: localUpdated
          ? 'Published. Live in the app feed now; the web blog goes live after Vercel finishes the auto-deploy (~2-3 min).'
          : 'Committed draft:false to main. The web blog goes live after Vercel auto-deploys (~2-3 min); the app feed catches up on the next backend deploy.',
      });
    } catch (err: any) {
      return reply.code(502).send({ error: `Publish failed: ${err?.message || 'unknown error'}` });
    }
  });
}
