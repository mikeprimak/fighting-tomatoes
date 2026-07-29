/**
 * Scan public/backgrounds/ and write src/data/backgrounds.json — the manifest
 * mapping fightId -> staticFile-relative path.
 *
 * Remotion compositions can't list the public folder at render time
 * (getStaticFiles() is Studio-only), so "which fights have a background photo"
 * must be knowable at bundle time. This runs before every render/studio/still
 * (chained in package.json and called by the panel server), so dropping a file
 * into public/backgrounds/ is all it takes.
 *
 * Filename contract: <fightId>.<jpg|jpeg|png|webp> — the fightId from the
 * payload, verbatim. The panel's per-fight upload writes this for you; only
 * hand-name files if you must. Anything that doesn't parse as <uuid>.<ext> is
 * ignored with a warning rather than silently shipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIDEO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG_DIR = path.join(VIDEO_DIR, 'public', 'backgrounds');
const MANIFEST = path.join(VIDEO_DIR, 'src', 'data', 'backgrounds.json');

const FILE_RE = /^([0-9a-f-]{36})\.(jpg|jpeg|png|webp)$/i;

export function syncBackgrounds() {
  fs.mkdirSync(BG_DIR, { recursive: true });
  const manifest = {};
  for (const f of fs.readdirSync(BG_DIR).sort()) {
    const m = f.match(FILE_RE);
    if (!m) {
      if (!f.startsWith('.')) console.warn(`[backgrounds] ignoring ${f} — expected <fightId>.<jpg|png|webp>`);
      continue;
    }
    manifest[m[1]] = `backgrounds/${f}`;
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = syncBackgrounds();
  console.log(`[backgrounds] ${Object.keys(m).length} background(s) in manifest`);
}
