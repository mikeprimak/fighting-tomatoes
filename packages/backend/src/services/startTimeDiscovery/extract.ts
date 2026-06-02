/**
 * Start-Time Discovery — Claude Haiku 4.5 extraction.
 *
 * Tapology (and most aggregators) publish only ONE time per card — the main-card
 * broadcast time. The real first bell (early prelims / prelims) lives only in
 * prose "what time does X start / ring walk times" articles from outlets like
 * ESPN, Yahoo, Bad Left Hook, the promoter, etc. This module asks Haiku to read
 * those snippets and return each card section's start time, NORMALIZED TO ET,
 * with a confidence score and grounding evidence.
 *
 * Mirrors services/broadcastDiscovery/extract.ts: prompt-cached system prompt,
 * strict-JSON output, confidence floor, fatal-vs-transient error handling.
 *
 * The caller converts the ET time strings to UTC via eventTimeToUTC against the
 * event date (same path the daily scraper uses for mainStartTime), then applies
 * with ordering + provenance guards (see persist.ts). We never fabricate: if the
 * sources don't state a section's time, that field is null.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a combat-sports schedule analyst. You extract the START TIME of each
section of a single fight card from web content (news previews, "what time does
it start" / "ring walk times" articles, promoter pages, TV listings).

You will be given:
  - An event name, promotion, and calendar date
  - The venue / location (gives the local time zone)
  - Search snippets and (sometimes) page excerpts that may mention start times

A fight card has up to three sections that start at different times:
  - "earlyPrelims" — the earliest portion (free streams / niche platforms). Often absent.
  - "prelims"      — the preliminary card (the real "first bell" / doors-to-action for most cards)
  - "mainCard"     — the headline/televised portion (latest start; what TV time listings usually cite)

CRITICAL: news listings almost always headline the MAIN CARD time and bury the
earlier prelim/first-bell time deeper in the article. Your most valuable job is
to surface the EARLIEST real start (early prelims or prelims), not just the main
card. The whole point is to learn when the FIRST fight starts, which is usually
hours before the main card.

NORMALIZE EVERY TIME TO U.S. EASTERN TIME (ET). Articles quote times in several
zones (ET/CT/MT/PT and venue-local). Convert them all to ET. Use a 12-hour
"H:MM AM/PM" string (e.g. "5:15 PM"). If a source gives only a non-ET zone,
convert it to ET yourself using standard US offsets for that calendar date.

Output STRICT JSON in this exact shape (no prose, no markdown, no code fences):
{
  "found": true,
  "earlyPrelims": "3:30 PM" | null,
  "prelims": "5:15 PM" | null,
  "mainCard": "9:00 PM" | null,
  "mainEventRingWalkApprox": "11:00 PM" | null,
  "confidence": 0.0,
  "sources": ["https://...", "https://..."],
  "evidence": "<=240 chars: direct quotes of the times you used, with their original zones"
}

Rules:
  - All times in ET, "H:MM AM/PM" format. null when the sources do not state that section's time.
  - "found" is false (and all times null) if NO credible start time appears in the content.
  - Ordering must be sane: earlyPrelims <= prelims <= mainCard. If a source contradicts this, trust the clearer source and drop the rest.
  - "mainEventRingWalkApprox" is the estimated headliner walk time if stated ("expected around 11 PM ET"); informational only, never a section start.
  - Do NOT invent times. No grounding quote in "evidence" => that field must be null.
  - Confidence scoring (single 0.0-1.0 for the overall extraction):
      0.90+  : official promoter/broadcaster schedule or a major outlet (ESPN, DAZN, Yahoo Sports, BoxingScene, MMA Fighting, Bad Left Hook) that explicitly lists per-section times
      0.70-0.89 : reputable outlet stating at least the prelim and main times clearly
      0.40-0.69 : only a single time found, or secondary/aggregator sources, or some zone ambiguity
      <0.40  : forums, fan blogs, contradictory sources — set found=false
  - "sources" = the URLs that actually supported the times you returned (subset of what you were given).`;

export interface StartTimeExtractionInput {
  eventName: string;
  promotion: string;
  dateLabel: string; // human date, e.g. "Saturday, May 30, 2026"
  location: string; // venue / city for TZ grounding
  snippets: Array<{ url: string; title: string; description: string }>;
  pageExcerpts?: Array<{ url: string; text: string }>;
}

export interface ExtractedStartTimes {
  found: boolean;
  earlyPrelims: string | null; // ET "H:MM AM/PM"
  prelims: string | null;
  mainCard: string | null;
  mainEventRingWalkApprox: string | null;
  confidence: number;
  sources: string[];
  evidence: string;
}

let cachedClient: Anthropic | null = null;
function client() {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cachedClient;
}

export async function extractStartTimes(
  input: StartTimeExtractionInput,
): Promise<ExtractedStartTimes | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[startTimeDiscovery] ANTHROPIC_API_KEY missing — skipping extraction');
    return null;
  }

  let resp;
  try {
    resp = await client().messages.create({
      model: MODEL,
      max_tokens: 700,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: buildUserMessage(input) }] }],
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const status = e?.status ?? e?.response?.status;
    const isFatal =
      status === 401 || status === 403 ||
      /credit balance/i.test(msg) || /invalid.*api.?key/i.test(msg) || /unauthor/i.test(msg);
    if (isFatal) {
      console.error('[startTimeDiscovery] Anthropic fatal auth/billing error:', msg);
      throw new Error(`Anthropic ${status ?? ''} ${msg}`);
    }
    console.warn('[startTimeDiscovery] Anthropic call failed (transient):', msg);
    return null;
  }

  const text = resp.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim();

  return parseExtraction(text);
}

function buildUserMessage(input: StartTimeExtractionInput): string {
  const lines: string[] = [];
  lines.push(`Event: ${input.eventName}`);
  lines.push(`Promotion: ${input.promotion}`);
  lines.push(`Date: ${input.dateLabel}`);
  lines.push(`Location: ${input.location}`);
  lines.push('');
  lines.push('## Search results');
  for (const s of input.snippets) {
    lines.push(`URL: ${s.url}`);
    lines.push(`Title: ${s.title}`);
    lines.push(`Snippet: ${s.description}`);
    lines.push('');
  }
  if (input.pageExcerpts?.length) {
    lines.push('## Page excerpts');
    for (const p of input.pageExcerpts) {
      lines.push(`URL: ${p.url}`);
      lines.push(`Excerpt: ${p.text.slice(0, 3500)}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function parseExtraction(raw: string): ExtractedStartTimes | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();
  let p: any;
  try {
    p = JSON.parse(cleaned);
  } catch {
    console.warn('[startTimeDiscovery] LLM JSON parse failed:', cleaned.slice(0, 200));
    return null;
  }
  const timeOrNull = (v: any): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(t) ? t.toUpperCase() : null;
  };
  const found = p?.found === true;
  return {
    found,
    earlyPrelims: timeOrNull(p?.earlyPrelims),
    prelims: timeOrNull(p?.prelims),
    mainCard: timeOrNull(p?.mainCard),
    mainEventRingWalkApprox: timeOrNull(p?.mainEventRingWalkApprox),
    confidence: Math.max(0, Math.min(1, Number(p?.confidence) || 0)),
    sources: Array.isArray(p?.sources) ? p.sources.filter((u: any) => typeof u === 'string').slice(0, 6) : [],
    evidence: String(p?.evidence ?? '').slice(0, 280),
  };
}
