import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Dynamic Open Graph image for a fight page. Shared links to
// goodfights.app/fights/<id> unfurl into this branded card in iMessage /
// WhatsApp / Slack / X, etc. — which is what makes the mobile share loop look
// good (the raw UUID recedes behind a visual preview).
//
// IMPORTANT: this represents the FIGHT (the URL is per-fight, shared by many
// users), so it shows the matchup + event + COMMUNITY rating/hype + brand —
// never a single user's "my hype" (the server doesn't know who's sharing).

export const runtime = 'nodejs'; // readFile + image pre-fetch need Node, not edge
// Belt-and-braces with the Cache-Control below: Next.js owns the response for
// metadata image routes and stamps `max-age=0, must-revalidate` on dynamic ones
// unless the segment declares a revalidate window. Setting both means the CDN
// caches whichever layer ends up winning.
export const revalidate = 86400;
export const alt = 'Good Fights';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';
const SERVER_BASE_URL = API_BASE_URL.replace(/\/api$/, '');

// Rendering this card costs ~270ms CPU (API fetch + 2 headshot fetches + base64
// + Satori + PNG encode), and until 2026-07-26 EVERY request paid it — the route
// shipped `max-age=0, must-revalidate`, so the CDN never held a copy and every
// hit was an X-Vercel-Cache MISS. A PerplexityBot crawl of ~4,800 fight pages
// then turned a normal <30 req/hr baseline into 1000+ req/20min, spiking CPU and
// surfacing the 300s timeouts below. The card's inputs (matchup, event, community
// score) move slowly, so a long CDN TTL with SWR makes repeat crawls and repeat
// social unfurls free while keeping scores reasonably fresh.
const CACHE_OK = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
// The fallback card means the API failed. Cache it only briefly so a transient
// backend blip doesn't pin a logo-only card in front of a real fight for a day.
const CACHE_FALLBACK = 'public, max-age=60, s-maxage=60';

// Every outbound fetch here is on the critical path of an image response. With
// no timeout a single hung upstream (cold Render dyno, slow R2 object) rides the
// function all the way to Vercel's 300s ceiling — which is exactly the
// "Task timed out after 300 seconds" / "failed to pipe response" pair in the
// error logs. Bounded waits degrade to the placeholder instead.
const FIGHT_FETCH_TIMEOUT_MS = 6000;
const IMAGE_FETCH_TIMEOUT_MS = 4000;

const C = {
  bg: '#161618',
  panel: '#1F1F22',
  text: '#FFFFFF',
  sec: '#9A9A9E',
  brand: '#F5C518',
  hairline: '#2C2C30',
};

function isDefaultImage(url: string): boolean {
  return [
    'silhouette', 'default-fighter', 'placeholder', 'avatar-default',
    'no-image', '_headshot_default', 'default_headshot',
  ].some((s) => url.includes(s));
}

// Pre-fetch a fighter photo and inline it as a data URL. Returns null on any
// problem so the card falls back to a placeholder circle instead of erroring
// the whole image (Satori throws on an unreachable <img src>).
async function loadFighterImage(profileImage: string | null | undefined): Promise<string | null> {
  if (!profileImage || isDefaultImage(profileImage)) return null;
  let url = profileImage;
  if (url.startsWith('/')) url = `${SERVER_BASE_URL}${url}`;
  else if (!url.startsWith('http')) return null;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function displayName(f: { firstName?: string; lastName?: string }): { first: string; last: string } {
  const first = (f.firstName || '').trim();
  const last = (f.lastName || '').trim();
  if (!first && last) return { first: '', last };
  if (first && !last) return { first: '', last: first };
  return { first, last };
}

function safeEventDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  // Guard against placeholder/sentinel dates (2099 markers, 1899 sentinels).
  if (Number.isNaN(y) || y < 2015 || y > new Date().getUTCFullYear() + 2) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

type Props = { params: Promise<{ id: string }> };

function HeadshotCircle({ src }: { src: string | null }) {
  const dim = 200;
  if (src) {
    return (
      <img
        src={src}
        width={dim}
        height={dim}
        style={{ width: dim, height: dim, borderRadius: dim / 2, objectFit: 'cover', border: `3px solid ${C.hairline}` }}
      />
    );
  }
  // Placeholder circle when no usable photo.
  return (
    <div
      style={{
        display: 'flex',
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        background: C.panel,
        border: `3px solid ${C.hairline}`,
      }}
    />
  );
}

export default async function Image({ params }: Props) {
  const { id } = await params;

  const logoData = await readFile(join(process.cwd(), 'public/brand/good-fights-logo-crisp.png'));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  let fight: any = null;
  try {
    const res = await fetch(`${API_BASE_URL}/fights/${id}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(FIGHT_FETCH_TIMEOUT_MS),
    });
    if (res.ok) fight = (await res.json()).fight;
  } catch {
    // fall through to the branded fallback below
  }

  // Fallback: logo-only branded card if the fight can't be loaded.
  if (!fight) {
    return new ImageResponse(
      (
        <div style={{ display: 'flex', width: '100%', height: '100%', background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <img src={logoSrc} width={520} height={137} style={{ width: 520, height: 137 }} />
        </div>
      ),
      { ...size, headers: { 'Cache-Control': CACHE_FALLBACK } },
    );
  }

  const [img1, img2] = await Promise.all([
    loadFighterImage(fight.fighter1?.profileImage),
    loadFighterImage(fight.fighter2?.profileImage),
  ]);

  const n1 = displayName(fight.fighter1 || {});
  const n2 = displayName(fight.fighter2 || {});
  const dateStr = safeEventDate(fight.event?.date);
  const eventLine = [fight.event?.name, dateStr].filter(Boolean).join('  ·  ');

  const completed = fight.fightStatus === 'COMPLETED';
  const rating = Number(fight.averageRating) || 0;
  const hype = Number(fight.averageHype) || 0;
  const totalRatings = Number(fight.totalRatings) || 0;

  let valueNumber: string | null = null;
  let valueLabel = '';
  if (completed) {
    if (totalRatings > 0) { valueNumber = rating.toFixed(1); valueLabel = 'COMMUNITY RATING'; }
    else { valueLabel = 'BE THE FIRST TO RATE'; }
  } else {
    if (hype > 0) { valueNumber = hype.toFixed(1); valueLabel = 'COMMUNITY HYPE'; }
    else { valueLabel = 'HOW HYPED ARE YOU?'; }
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: C.bg,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '50px 60px',
        }}
      >
        {/* Brand logo */}
        <img src={logoSrc} width={300} height={79} style={{ width: 300, height: 79 }} />

        {/* Matchup */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 420 }}>
            <HeadshotCircle src={img1} />
            {!!n1.first && (
              <div style={{ display: 'flex', color: C.sec, fontSize: 26, marginTop: 14 }}>{n1.first}</div>
            )}
            <div style={{ display: 'flex', color: C.text, fontSize: 40, fontWeight: 700, marginTop: 2 }}>{n1.last}</div>
          </div>

          <div style={{ display: 'flex', color: C.sec, fontSize: 30, fontWeight: 700, padding: '0 24px' }}>VS</div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 420 }}>
            <HeadshotCircle src={img2} />
            {!!n2.first && (
              <div style={{ display: 'flex', color: C.sec, fontSize: 26, marginTop: 14 }}>{n2.first}</div>
            )}
            <div style={{ display: 'flex', color: C.text, fontSize: 40, fontWeight: 700, marginTop: 2 }}>{n2.last}</div>
          </div>
        </div>

        {/* Event + value + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {!!eventLine && (
            <div style={{ display: 'flex', color: C.sec, fontSize: 24, fontWeight: 600, marginBottom: 14 }}>{eventLine}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {valueNumber && (
              <div style={{ display: 'flex', alignItems: 'baseline', marginRight: 14 }}>
                <span style={{ color: C.brand, fontSize: 56, fontWeight: 700 }}>{valueNumber}</span>
                <span style={{ color: C.sec, fontSize: 30, marginLeft: 2 }}>/10</span>
              </div>
            )}
            <div style={{ display: 'flex', color: valueNumber ? C.sec : C.brand, fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>
              {valueLabel}
            </div>
          </div>
          <div style={{ display: 'flex', color: C.sec, fontSize: 24, marginTop: 16 }}>
            <span>Rate it on</span>
            <span style={{ color: C.brand, fontWeight: 700, marginLeft: 8 }}>goodfights.app</span>
          </div>
        </div>
      </div>
    ),
    { ...size, headers: { 'Cache-Control': CACHE_OK } },
  );
}
