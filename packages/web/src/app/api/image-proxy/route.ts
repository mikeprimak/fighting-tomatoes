import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api';
const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, '');

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  // Resolve relative URLs against the backend
  let resolvedUrl = url;
  if (url.startsWith('/')) {
    resolvedUrl = BACKEND_ORIGIN + url;
  }

  // Only allow known domains
  const allowed = ['r2.dev', 'cloudflare', 'fightcrewapp', 'goodfights', 'onrender', 'tapology.com', 'fightingtomatoes.com'];
  const parsed = new URL(resolvedUrl);
  if (!allowed.some((d) => parsed.hostname.includes(d))) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    const resp = await fetch(resolvedUrl);
    if (!resp.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: resp.status });
    }
    const buffer = await resp.arrayBuffer();
    const contentType = resp.headers.get('content-type') || 'image/png';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
  }
}
