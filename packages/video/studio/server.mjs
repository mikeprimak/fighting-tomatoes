/**
 * Local control panel for the video pipeline.
 *
 * Runs on your machine, NOT on Render. Rendering needs headless Chrome and minutes of
 * CPU; the Render instance is 256 MB and packages/video is deliberately excluded from
 * the deploy image. So the GUI is served locally and drives the same two commands you
 * would otherwise type.
 *
 *   node studio/server.mjs      (or: pnpm panel)  ->  http://localhost:3009
 *
 * Zero dependencies beyond Node — nothing new enters the lockfile.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.resolve(VIDEO_DIR, '../backend');
const DATA_DIR = path.join(VIDEO_DIR, 'src', 'data');
const OUT_DIR = path.join(VIDEO_DIR, 'out');
const PORT = Number(process.env.PORT ?? 3009);

/** One job at a time — renders are CPU-bound and two at once helps nobody. */
let job = null; // { type, log: string[], done: bool, ok: bool, startedAt }

const readJSON = (p, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function runJob(type, cmd, args, cwd) {
  job = { type, log: [], done: false, ok: false, startedAt: Date.now() };
  const current = job;
  current.log.push(`$ ${cmd} ${args.join(' ')}`);

  // shell:true so npx resolves on Windows.
  const child = spawn(cmd, args, { cwd, shell: true });
  const push = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (line.trim()) current.log.push(line);
    }
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  child.on('close', (code) => {
    current.ok = code === 0;
    current.done = true;
    current.log.push(current.ok ? '✓ done' : `✗ exited with code ${code}`);
  });
  child.on('error', (err) => {
    current.ok = false;
    current.done = true;
    current.log.push(`✗ ${err.message}`);
  });
}

function state() {
  const payload = readJSON(path.join(DATA_DIR, 'current.json'));
  const captions = readJSON(path.join(DATA_DIR, 'captions.json'), {});
  let renders = [];
  try {
    renders = fs
      .readdirSync(OUT_DIR)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => {
        const st = fs.statSync(path.join(OUT_DIR, f));
        return { file: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    /* out/ may not exist yet */
  }
  return {
    payload,
    captions,
    renders,
    job: job && {
      type: job.type,
      done: job.done,
      ok: job.ok,
      log: job.log.slice(-400),
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
    },
  };
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      // NB: readJSON() takes a file path, not a string — do not reuse it here.
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html');
  }

  if (url.pathname === '/api/state') {
    return send(res, 200, state());
  }

  if (url.pathname === '/api/pull' && req.method === 'POST') {
    if (job && !job.done) return send(res, 409, { error: 'A job is already running.' });
    const b = await readBody(req);
    const args = ['tsx', 'scripts/videoData.ts', `--format=${b.format}`, `--limit=${b.limit || 5}`];
    if (b.org) args.push(`--org=${b.org}`);
    if (b.minVotes) args.push(`--min-votes=${b.minVotes}`);
    if (b.format === 'fighter') args.push(`--fighter=${JSON.stringify(b.fighter || '')}`);
    if (b.format === 'weight-class') args.push(`--weight-class=${b.weightClass || ''}`);
    if (b.format === 'year') args.push(`--year=${b.year || ''}`);
    runJob('pull', 'npx', args, BACKEND_DIR);
    return send(res, 200, { started: true });
  }

  if (url.pathname === '/api/captions' && req.method === 'POST') {
    const b = await readBody(req);
    const existing = readJSON(path.join(DATA_DIR, 'captions.json'), {});
    const merged = { ...existing, ...(b.captions || {}) };
    // Drop blanks so an empty box falls back to "<event> · <finish>" rather than
    // rendering an empty caption line.
    for (const k of Object.keys(merged)) if (!String(merged[k]).trim()) delete merged[k];
    fs.writeFileSync(path.join(DATA_DIR, 'captions.json'), JSON.stringify(merged, null, 2) + '\n');
    return send(res, 200, { saved: Object.keys(merged).length });
  }

  if (url.pathname === '/api/render' && req.method === 'POST') {
    if (job && !job.done) return send(res, 409, { error: 'A job is already running.' });
    const payload = readJSON(path.join(DATA_DIR, 'current.json'));
    if (!payload) return send(res, 400, { error: 'No data pulled yet — pull a format first.' });
    // filters.extra looks like "year=2023" / "fighter=Conor McGregor" — take the value,
    // otherwise the org, so we get "year-2023" not "year-year-2023".
    const descriptor = payload.filters.extra
      ? payload.filters.extra.split('=').slice(1).join('=')
      : payload.filters.org;
    const name = slug(`${payload.format}-${descriptor}`) || 'video';
    runJob('render', 'npx', ['remotion', 'render', 'Countdown', `out/${name}.mp4`], VIDEO_DIR);
    return send(res, 200, { started: true, file: `${name}.mp4` });
  }

  if (url.pathname.startsWith('/out/')) {
    const file = path.join(OUT_DIR, path.basename(url.pathname));
    if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
    const stat = fs.statSync(file);
    const range = req.headers.range;
    if (range) {
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s, 10);
      const end = e ? parseInt(e, 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
    return fs.createReadStream(file).pipe(res);
  }

  send(res, 404, { error: 'not found' });
});

// Starting it twice is the most likely user error, and a raw EADDRINUSE stack trace
// reads like a breakage when in fact the panel is already up and working.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n  The panel is ALREADY RUNNING.`);
    console.log(`  Open  http://localhost:${PORT}\n`);
    console.log(`  (To restart it instead, close the other window, or run: pnpm panel:stop)\n`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Good Fights — video control panel`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
