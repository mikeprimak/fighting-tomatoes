/**
 * Sync editorial blog posts from the web package (the single canonical source)
 * into the backend so GET /api/editorial can serve them at runtime.
 *
 * Canonical source: packages/web/src/content/posts (authored by Mike, co-located
 * with hero images in packages/web/public/blog).
 * Generated copy:   packages/backend/src/content/posts (gitignored — never edit).
 *
 * Runs automatically from the backend `dev` and `build` scripts. Idempotent.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../web/src/content/posts');
const DEST = path.join(__dirname, '../src/content/posts');

function main() {
  if (!fs.existsSync(SRC)) {
    console.warn(`[syncBlogPosts] source not found: ${SRC} — skipping (editorial may be empty)`);
    return;
  }

  fs.mkdirSync(DEST, { recursive: true });

  // Clear stale generated copies so deletions in web propagate.
  for (const f of fs.readdirSync(DEST)) {
    if (f.endsWith('.md')) fs.rmSync(path.join(DEST, f));
  }

  const posts = fs.readdirSync(SRC).filter((f) => f.endsWith('.md'));
  for (const f of posts) {
    fs.copyFileSync(path.join(SRC, f), path.join(DEST, f));
  }

  console.log(`[syncBlogPosts] synced ${posts.length} post(s) → ${path.relative(process.cwd(), DEST)}`);
}

main();
