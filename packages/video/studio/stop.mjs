/**
 * Stops a panel left running in another window (or orphaned by a closed terminal).
 * Windows-first, since that is the dev machine; falls back to lsof elsewhere.
 *
 *   pnpm panel:stop
 */
import { execSync } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3009);
const isWin = process.platform === 'win32';

try {
  let pids = [];

  if (isWin) {
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
    pids = [
      ...new Set(
        out
          .split(/\r?\n/)
          .filter((l) => l.includes('LISTENING'))
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p) => p && p !== '0'),
      ),
    ];
  } else {
    const out = execSync(`lsof -ti tcp:${PORT}`, { encoding: 'utf8' });
    pids = out.split(/\s+/).filter(Boolean);
  }

  if (!pids.length) {
    console.log(`\n  Nothing running on port ${PORT}. Start it with: pnpm panel\n`);
    process.exit(0);
  }

  for (const pid of pids) {
    execSync(isWin ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`, { stdio: 'ignore' });
    console.log(`  Stopped panel (pid ${pid}).`);
  }
  console.log(`\n  Start it again with: pnpm panel\n`);
} catch {
  console.log(`\n  Nothing running on port ${PORT}. Start it with: pnpm panel\n`);
}
