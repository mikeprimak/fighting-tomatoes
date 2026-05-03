import type { FastifyRequest } from 'fastify';

export type Region = 'US' | 'CA' | 'GB' | 'AU' | 'NZ' | 'EU';
export type RegionDetectedFrom = 'query-param' | 'user-pref' | 'ip' | 'fallback';

export const REGIONS: Region[] = ['US', 'CA', 'GB', 'AU', 'NZ', 'EU'];

const EU_COUNTRIES = new Set([
  // EEA + Switzerland + microstates. Anything in this set buckets to "EU".
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU',
  'MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'IS','LI','NO','CH',
  'AD','MC','SM','VA',
]);

export function countryToRegion(country: string | undefined | null): Region {
  if (!country) return 'US';
  const cc = country.toUpperCase();
  if (cc === 'US') return 'US';
  if (cc === 'CA') return 'CA';
  if (cc === 'GB' || cc === 'UK') return 'GB';
  if (cc === 'AU') return 'AU';
  if (cc === 'NZ') return 'NZ';
  if (EU_COUNTRIES.has(cc)) return 'EU';
  return 'US'; // unknown / sanctioned / RoW → US fallback
}

export function isValidRegion(value: unknown): value is Region {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
}

export interface ResolvedRegion {
  region: Region;
  detectedFrom: RegionDetectedFrom;
}

export interface ResolveRegionInput {
  queryRegion?: string | null;
  userBroadcastRegion?: string | null;
  cfIpCountry?: string | null;
}

export function resolveRegion(input: ResolveRegionInput): ResolvedRegion {
  if (input.queryRegion && isValidRegion(input.queryRegion)) {
    return { region: input.queryRegion, detectedFrom: 'query-param' };
  }
  if (input.userBroadcastRegion && isValidRegion(input.userBroadcastRegion)) {
    return { region: input.userBroadcastRegion, detectedFrom: 'user-pref' };
  }
  if (input.cfIpCountry) {
    return { region: countryToRegion(input.cfIpCountry), detectedFrom: 'ip' };
  }
  return { region: 'US', detectedFrom: 'fallback' };
}

export function resolveRegionFromRequest(
  request: FastifyRequest,
  userBroadcastRegion: string | null = null,
): ResolvedRegion {
  const q = (request.query as any)?.region as string | undefined;
  const cf = (request.headers['cf-ipcountry'] as string | undefined)
    ?? (request.headers['x-vercel-ip-country'] as string | undefined)
    ?? (request.headers['x-country-code'] as string | undefined);
  return resolveRegion({
    queryRegion: q ?? null,
    userBroadcastRegion,
    cfIpCountry: cf ?? null,
  });
}
