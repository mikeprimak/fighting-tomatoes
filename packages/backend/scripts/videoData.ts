/**
 * Video content engine — pulls fight data + headshots for the faceless video workstream.
 *
 * Writes a JSON payload consumed by `packages/video` (Remotion) and downloads the
 * fighter headshots locally so a render never depends on R2 being reachable.
 *
 * Ratings are computed live from FightRating rather than read off Fight.averageRating:
 * every number in a video is a factual claim on screen, and the denormalised aggregate
 * fields are known to drift (see docs — Event.totalRatings is dead, Fighter aggregates
 * are only re-run quarterly).
 *
 * Usage (from packages/backend/):
 *   npx tsx scripts/videoData.ts --format=top-fights --org=UFC --limit=5
 *   npx tsx scripts/videoData.ts --format=top-fights --org=UFC --limit=5 --min-votes=25
 *   npx tsx scripts/videoData.ts --format=fighter --fighter="Conor McGregor"
 *   npx tsx scripts/videoData.ts --format=weight-class --weight-class=LIGHTWEIGHT
 *   npx tsx scripts/videoData.ts --format=year --year=2023
 */
import { prisma } from '../src/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

const VIDEO_PKG = path.resolve(__dirname, '../../video');
const HEADSHOT_DIR = path.join(VIDEO_PKG, 'public', 'headshots');
const DATA_DIR = path.join(VIDEO_PKG, 'src', 'data');

interface Args {
  format: string;
  org: string;
  limit: number;
  minVotes: number;
  fighter?: string;
  weightClass?: string;
  year?: number;
  out?: string;
}

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const get = (k: string) => {
    const hit = raw.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : undefined;
  };
  return {
    format: get('format') ?? 'top-fights',
    org: get('org') ?? 'UFC',
    limit: Number(get('limit') ?? 5),
    minVotes: Number(get('min-votes') ?? 10),
    fighter: get('fighter'),
    weightClass: get('weight-class'),
    year: get('year') ? Number(get('year')) : undefined,
    out: get('out'),
  };
}

export interface VideoFighter {
  id: string;
  name: string;      // "Glover Teixeira"
  lastName: string;  // "Teixeira" — the big-text variant for countdown cards
  nickname: string | null;
  headshot: string | null;
}

export interface VideoFight {
  rank: number;
  fightId: string;
  rating: number;        // rounded to 2dp, computed live
  votes: number;
  fighter1: VideoFighter;
  fighter2: VideoFighter;
  event: string;
  eventDate: string;     // ISO
  eventDateLabel: string;
  method: string | null;
  round: number | null;
  finishLabel: string | null;
  weightClass: string | null;
}

/**
 * Corpus-level counts backing the on-screen claims in the hook.
 * Queried every run so the copy can never drift ahead of the data.
 */
export interface VideoCorpus {
  totalFights: number;
  ratedFights: number;
  ratingsCast: number;
  /** Fights *within this video's scope* carrying >= 1 rating — backs the hook headline. */
  scopeRatedFights: number;
}

export interface VideoPayload {
  format: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  filters: { org: string; minVotes: number; limit: number; extra?: string };
  corpus: VideoCorpus;
  /**
   * Hook headline, rendered verbatim over the blurred #1 number.
   * Generated per format from queried counts so it can never overstate the data.
   */
  hookHeadline: string;
  fights: VideoFight[];
}

/** Fights in a given scope that carry at least one rating. */
async function countRatedIn(where: any): Promise<{ total: number; rated: number; cast: number }> {
  const fights = await prisma.fight.findMany({ where, select: { id: true } });
  const ids = fights.map((f) => f.id);
  const grouped = await prisma.fightRating.groupBy({
    by: ['fightId'],
    where: { fightId: { in: ids } },
    _count: { rating: true },
  });
  const cast = await prisma.fightRating.count({ where: { fightId: { in: ids } } });
  return { total: ids.length, rated: grouped.length, cast };
}

/** Org-wide catalogue coverage + this video's own scope. */
async function measureCorpus(org: string, scopeWhere: any): Promise<VideoCorpus> {
  const orgWide = await countRatedIn({ event: { promotion: org } });
  const scope = await countRatedIn(scopeWhere);
  return {
    totalFights: orgWide.total,
    ratedFights: orgWide.rated,
    ratingsCast: orgWide.cast,
    scopeRatedFights: scope.rated,
  };
}

const FIGHTER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  profileImage: true,
} as const;

type FighterRow = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  profileImage: string | null;
};

function toVideoFighter(f: FighterRow, headshot: string | null): VideoFighter {
  return {
    id: f.id,
    name: `${f.firstName} ${f.lastName}`.trim(),
    lastName: f.lastName.trim() || f.firstName.trim(),
    nickname: f.nickname,
    headshot,
  };
}

/** Fight ids that pass the vote floor, ranked by live average rating. */
async function rankFights(where: any, minVotes: number, limit: number) {
  const eligible = await prisma.fight.findMany({
    where,
    select: { id: true },
  });
  if (eligible.length === 0) return [];

  const grouped = await prisma.fightRating.groupBy({
    by: ['fightId'],
    where: { fightId: { in: eligible.map((f) => f.id) } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  return grouped
    .filter((g) => g._count.rating >= minVotes && g._avg.rating !== null)
    .sort((a, b) => (b._avg.rating ?? 0) - (a._avg.rating ?? 0))
    .slice(0, limit)
    .map((g) => ({
      fightId: g.fightId,
      rating: Math.round((g._avg.rating ?? 0) * 100) / 100,
      votes: g._count.rating,
    }));
}

function finishLabel(method: string | null, round: number | null): string | null {
  if (!method) return null;
  const m = method.trim();
  if (/decision/i.test(m)) return round ? `Decision (R${round})` : 'Decision';
  return round ? `${m} R${round}` : m;
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Download a headshot into packages/video/public/headshots; returns the staticFile-relative path. */
async function cacheHeadshot(url: string | null, fighterId: string): Promise<string | null> {
  if (!url) return null;
  const ext = (url.split('?')[0].match(/\.(png|jpg|jpeg|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
  const filename = `${fighterId}.${ext}`;
  const dest = path.join(HEADSHOT_DIR, filename);
  const rel = `headshots/${filename}`;

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return rel;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ! headshot ${res.status} for ${fighterId} (${url})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    fs.mkdirSync(HEADSHOT_DIR, { recursive: true });
    fs.writeFileSync(dest, buf);
    return rel;
  } catch (err) {
    console.warn(`  ! headshot fetch failed for ${fighterId}:`, (err as Error).message);
    return null;
  }
}

async function hydrate(ranked: Awaited<ReturnType<typeof rankFights>>): Promise<VideoFight[]> {
  const fights = await prisma.fight.findMany({
    where: { id: { in: ranked.map((r) => r.fightId) } },
    include: {
      fighter1: { select: FIGHTER_SELECT },
      fighter2: { select: FIGHTER_SELECT },
      event: { select: { name: true, date: true, mainStartTime: true } },
    },
  });
  const byId = new Map(fights.map((f) => [f.id, f]));

  const out: VideoFight[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const f = byId.get(r.fightId);
    if (!f) continue;

    // Event.date is a UTC-hour placeholder; mainStartTime is the real instant when present.
    const when = f.event.mainStartTime ?? f.event.date;

    const [h1, h2] = await Promise.all([
      cacheHeadshot(f.fighter1.profileImage, f.fighter1.id),
      cacheHeadshot(f.fighter2.profileImage, f.fighter2.id),
    ]);

    out.push({
      rank: i + 1,
      fightId: f.id,
      rating: r.rating,
      votes: r.votes,
      fighter1: toVideoFighter(f.fighter1, h1),
      fighter2: toVideoFighter(f.fighter2, h2),
      event: f.event.name,
      eventDate: when.toISOString(),
      eventDateLabel: dateLabel(when),
      method: f.method,
      round: f.round,
      finishLabel: finishLabel(f.method, f.round),
      weightClass: f.weightClass ?? null,
    });
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const completed: any = { fightStatus: 'COMPLETED' };
  let where: any;
  let title = '';
  let subtitle = '';
  let extra: string | undefined;
  // What the hook counts: "FANS HAVE RATED <n> <scopeLabel>."
  let scopeLabel = '';

  switch (args.format) {
    case 'top-fights':
      where = { ...completed, event: { promotion: args.org } };
      title = `The ${args.limit} Highest-Rated Fights in ${args.org} History`;
      subtitle = 'As rated by Good Fights users';
      scopeLabel = `${args.org} FIGHTS`;
      break;

    case 'fighter': {
      if (!args.fighter) throw new Error('--fighter="Name" is required for --format=fighter');
      const parts = args.fighter.trim().split(/\s+/);
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(' ');
      const fighter = await prisma.fighter.findFirst({
        where: first
          ? {
              firstName: { equals: first, mode: 'insensitive' },
              lastName: { equals: last, mode: 'insensitive' },
            }
          : { lastName: { equals: last, mode: 'insensitive' } },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!fighter) throw new Error(`No fighter matched "${args.fighter}"`);
      const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();
      where = { ...completed, OR: [{ fighter1Id: fighter.id }, { fighter2Id: fighter.id }] };
      title = `Every ${fullName} Fight, Rated by Fans`;
      subtitle = 'As rated by Good Fights users';
      extra = `fighter=${fullName}`;
      scopeLabel = `${fullName.toUpperCase()} FIGHTS`;
      break;
    }

    case 'weight-class':
      if (!args.weightClass) throw new Error('--weight-class=LIGHTWEIGHT is required');
      where = { ...completed, weightClass: args.weightClass, event: { promotion: args.org } };
      title = `The Best ${args.weightClass.replace(/_/g, ' ')} Fights Ever`;
      subtitle = 'As rated by Good Fights users';
      extra = `weightClass=${args.weightClass}`;
      scopeLabel = `${args.weightClass.replace(/_/g, ' ')} FIGHTS`;
      break;

    case 'year': {
      if (!args.year) throw new Error('--year=2023 is required');
      const start = new Date(Date.UTC(args.year, 0, 1));
      const end = new Date(Date.UTC(args.year + 1, 0, 1));
      where = { ...completed, event: { promotion: args.org, date: { gte: start, lt: end } } };
      title = `The Best Fights of ${args.year}`;
      subtitle = 'As rated by Good Fights users';
      extra = `year=${args.year}`;
      scopeLabel = `${args.org} FIGHTS FROM ${args.year}`;
      break;
    }

    default:
      throw new Error(`Unknown --format=${args.format}`);
  }

  console.log(`Format: ${args.format} | org=${args.org} | limit=${args.limit} | minVotes=${args.minVotes}`);
  const ranked = await rankFights(where, args.minVotes, args.limit);
  if (ranked.length === 0) {
    console.error('No fights matched the filters. Nothing written.');
    process.exit(1);
  }
  console.log(`Ranked ${ranked.length} fights. Caching headshots...`);
  const fights = await hydrate(ranked);
  const corpus = await measureCorpus(args.org, where);

  const payload: VideoPayload = {
    format: args.format,
    title,
    subtitle,
    generatedAt: new Date().toISOString(),
    filters: { org: args.org, minVotes: args.minVotes, limit: args.limit, extra },
    corpus,
    hookHeadline: `FANS HAVE RATED\n${corpus.scopeRatedFights.toLocaleString('en-US')} ${scopeLabel}.`,
    fights,
  };

  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(DATA_DIR, `${args.format}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  // The Remotion root imports current.json — a static import, so it cannot pick a file
  // by name at render time. Every pull therefore also becomes "the one that renders next".
  // Without this, `pnpm render` silently re-renders whatever format was pulled first.
  const currentPath = path.join(DATA_DIR, 'current.json');
  fs.writeFileSync(currentPath, JSON.stringify(payload, null, 2));

  console.log('');
  fights.forEach((f) => {
    const shots = `${f.fighter1.headshot ? '✓' : '✗'}${f.fighter2.headshot ? '✓' : '✗'}`;
    console.log(
      `  #${f.rank}  ${f.rating.toFixed(2)}  (${f.votes} votes)  ${f.fighter1.name} vs ${f.fighter2.name}  [${f.event}]  headshots:${shots}`,
    );
  });
  console.log(
    `\nCorpus (${args.org}): ${corpus.ratedFights.toLocaleString()} of ${corpus.totalFights.toLocaleString()} fights rated, ` +
      `${corpus.ratingsCast.toLocaleString()} ratings cast.`,
  );
  console.log('  ^ on-screen claims must not exceed these numbers.');
  console.log(`Hook: ${payload.hookHeadline.replace('\n', ' ')}`);
  console.log(`\nWrote ${outPath}`);
  console.log(`Wrote ${currentPath}  <- this is what "pnpm render" will use`);
  console.log(`\nNext:  cd ../video && pnpm render`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
