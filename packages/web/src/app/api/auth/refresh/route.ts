import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refreshToken')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await res.json();
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
