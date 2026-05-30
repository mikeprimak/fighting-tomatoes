import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refreshToken')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  // Distinguish transient backend unavailability (5xx / network error during a
  // redeploy) from a genuine rejection (4xx). Only a genuine rejection clears
  // the refresh cookie — a transient failure keeps the session intact so the
  // next attempt succeeds once the backend is back. Mirrors the mobile
  // AuthContext tryRefreshTokens() fix (commit a657d10).
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [300, 800];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Network error / timeout — transient. Retry, never clear the cookie.
      await sleep(BACKOFF_MS[attempt] ?? 0);
      continue;
    }

    // 5xx (incl. 502/503 from the proxy while the container restarts) is
    // transient — retry, never clear the cookie.
    if (res.status >= 500) {
      await sleep(BACKOFF_MS[attempt] ?? 0);
      continue;
    }

    const data = await res.json().catch(() => ({}));

    // 4xx = the refresh token was genuinely rejected → real logout.
    if (!res.ok) {
      const response = NextResponse.json(data, { status: res.status });
      response.cookies.delete('refreshToken');
      return response;
    }

    const newAccessToken = data.tokens?.accessToken || data.accessToken;
    const newRefreshToken = data.tokens?.refreshToken || data.refreshToken;

    const response = NextResponse.json({ accessToken: newAccessToken });

    if (newRefreshToken) {
      response.cookies.set('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return response;
  }

  // Exhausted retries against an unreachable backend — transient. Return 503
  // WITHOUT clearing the cookie so the session survives; the client treats this
  // as a failed-but-not-logged-out refresh and the next request retries.
  return NextResponse.json(
    { error: 'Auth service temporarily unavailable', code: 'REFRESH_TRANSIENT' },
    { status: 503 },
  );
}
