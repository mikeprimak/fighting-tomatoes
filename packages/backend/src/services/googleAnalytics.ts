// packages/backend/src/services/googleAnalytics.ts
//
// Thin GA4 Data API client for the backend. Used by the admin Acquisition
// snapshot (web/organic-search section) and the monthly web-traffic email.
//
// Credentials resolution (first that works wins):
//   1. GA_SERVICE_ACCOUNT_JSON env var (the full service-account JSON string) — prod (Render).
//   2. packages/backend/ga-service-account.json on disk — local dev (gitignored).
// Property id: GA4_PROPERTY_ID (numeric, NOT the G-XXXX measurement id).
//
// Everything is best-effort: if GA isn't configured or the API errors, the
// functions return null so callers degrade gracefully instead of throwing.

import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export interface OrganicMonthRow {
  month: string;          // 'YYYY-MM'
  sessions: number;
  activeUsers: number;
  engagedSessions: number;
}

function resolveCredentials(): { credentials?: object; keyFile?: string } | null {
  const inline = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim().startsWith('{')) {
    try {
      return { credentials: JSON.parse(inline) };
    } catch (e) {
      console.error('[ga] GA_SERVICE_ACCOUNT_JSON is set but not valid JSON');
      return null;
    }
  }
  // Fall back to the local file (dev only — gitignored).
  const keyFile = path.resolve(__dirname, '..', '..', 'ga-service-account.json');
  if (fs.existsSync(keyFile)) return { keyFile };
  return null;
}

export function isGaConfigured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID) && resolveCredentials() !== null;
}

async function getAccessToken(): Promise<string | null> {
  const creds = resolveCredentials();
  if (!creds) return null;
  try {
    const auth = new GoogleAuth({ ...creds, scopes: [GA_SCOPE] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    return token ?? null;
  } catch (e) {
    console.error('[ga] failed to obtain access token:', (e as Error).message);
    return null;
  }
}

async function runReport(body: object): Promise<any | null> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return null;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('[ga] runReport error:', JSON.stringify(data));
      return null;
    }
    return data;
  } catch (e) {
    console.error('[ga] runReport request failed:', (e as Error).message);
    return null;
  }
}

/**
 * Real organic-search sessions by calendar month — the buyer-credible web
 * metric. Bot/redirect junk is excluded automatically (it doesn't classify as
 * "Organic Search"). Returns null if GA isn't configured or the call fails.
 */
export async function getOrganicSessionsByMonth(months = 12): Promise<OrganicMonthRow[] | null> {
  const data = await runReport({
    dateRanges: [{ startDate: `${Math.max(1, months) * 31}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'engagedSessions' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'sessionDefaultChannelGroup',
        stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: false },
      },
    },
    orderBys: [{ dimension: { dimensionName: 'yearMonth' }, desc: false }],
    limit: 24,
  });
  if (!data) return null;
  const rows = data.rows || [];
  return rows.map((r: any) => {
    const ym = r.dimensionValues?.[0]?.value || '';     // '202606'
    const month = ym.length === 6 ? `${ym.slice(0, 4)}-${ym.slice(4)}` : ym;
    return {
      month,
      sessions: Number(r.metricValues?.[0]?.value || 0),
      activeUsers: Number(r.metricValues?.[1]?.value || 0),
      engagedSessions: Number(r.metricValues?.[2]?.value || 0),
    };
  });
}
