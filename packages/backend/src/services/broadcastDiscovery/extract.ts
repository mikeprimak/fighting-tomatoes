/**
 * Claude Haiku 4.5 extraction.
 * Given a promotion + region + raw text excerpts, emit structured findings.
 *
 * Uses prompt caching on the system prompt to keep cost low — at our weekly
 * cadence this should be ~$0.20/run.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a sports-media analyst extracting broadcaster claims from web content.

You will be given:
  - A combat-sports promotion (e.g. "UFC", "ONE", "BKFC")
  - A target region: one of US | CA | GB | AU | NZ | EU
  - Search snippets and (sometimes) text from an official "how to watch" page
  - The current default broadcaster on file for that promotion+region (may be empty)

Your job: identify which broadcaster(s) currently carry that promotion in that region, in 2026.

Output STRICT JSON in this shape (no prose, no markdown, no fences):
{
  "findings": [
    {
      "channelName": "Paramount+",         // human-readable, what's actually shown
      "tier": "SUBSCRIPTION",              // FREE | SUBSCRIPTION | PPV — null if unclear
      "sourceUrl": "https://...",          // the URL that supports this claim
      "snippet": "<= 200 chars excerpt",   // grounding evidence — direct quote
      "confidence": 0.85                   // 0.0–1.0 — see scoring rules below
    }
  ]
}

Confidence rules:
  - 0.90+ : Official press release on the promotion's site or the broadcaster's site
  - 0.70-0.89 : Reputable sports-news outlet (ESPN, SportsPro, Sportcal, BoxingScene, MMA Fighting)
  - 0.40-0.69 : Aggregator pages, secondary tier outlets
  - <0.40 : Forums, blogs, fan sites — DO NOT EMIT (drop the finding entirely)

Hard rules:
  - Only emit findings for the exact requested region. If a source mentions UK but you were asked about AU, drop it.
  - If two broadcasters cover the same region (e.g. Paramount+ and CBS for UFC US), emit BOTH as separate findings.
  - Do NOT invent broadcasters. If sources don't say, return {"findings": []}.
  - For "EU", treat any EEA/EFTA country deal as relevant; mention which countries in the snippet.
  - Tier classification: FREE means free to anyone with internet (YouTube, OTA TV); SUBSCRIPTION means included in a paid sub (Paramount+, DAZN, Netflix); PPV means extra one-time payment on top of any sub.`;

export interface ExtractionInput {
  promotion: string;
  region: string;
  currentDefaults: Array<{ channelName: string; tier: string }>;
  snippets: Array<{ url: string; title: string; description: string }>;
  howToWatchPage?: { url: string; text: string };
}

export interface ExtractedFinding {
  channelName: string;
  tier: 'FREE' | 'SUBSCRIPTION' | 'PPV' | null;
  sourceUrl: string;
  snippet: string;
  confidence: number;
}

let cachedClient: Anthropic | null = null;
function client() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

export async function extractFindings(input: ExtractionInput): Promise<ExtractedFinding[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[discovery] ANTHROPIC_API_KEY missing — skipping LLM extraction');
    return [];
  }

  const userBlocks: any[] = [
    {
      type: 'text',
      text: buildUserMessage(input),
    },
  ];

  let resp;
  try {
    resp = await client().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userBlocks }],
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const status = e?.status ?? e?.response?.status;
    // Auth / billing / quota errors are not transient — every subsequent call will
    // fail the same way. Throw so the orchestrator records an error and the
    // workflow exits non-zero. Previously this was swallowed as "no findings",
    // which meant exhausted credits silently produced an empty inbox.
    const isFatal =
      status === 401 ||
      status === 403 ||
      /credit balance/i.test(msg) ||
      /invalid.*api.?key/i.test(msg) ||
      /unauthor/i.test(msg);
    if (isFatal) {
      console.error('[discovery] Anthropic fatal auth/billing error:', msg);
      throw new Error(`Anthropic ${status ?? ''} ${msg}`);
    }
    console.warn('[discovery] Anthropic call failed (treated as transient):', msg);
    return [];
  }

  const text = resp.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim();

  return parseFindings(text);
}

function buildUserMessage(input: ExtractionInput): string {
  const lines: string[] = [];
  lines.push(`Promotion: ${input.promotion}`);
  lines.push(`Target region: ${input.region}`);
  if (input.currentDefaults.length > 0) {
    lines.push(`Current default(s) on file: ${input.currentDefaults.map(d => `${d.channelName} (${d.tier})`).join(', ')}`);
  } else {
    lines.push('Current default(s) on file: (none)');
  }
  lines.push('');
  lines.push('## Search results');
  for (const s of input.snippets) {
    lines.push(`URL: ${s.url}`);
    lines.push(`Title: ${s.title}`);
    lines.push(`Snippet: ${s.description}`);
    lines.push('');
  }
  if (input.howToWatchPage) {
    lines.push('## Official "how to watch" page');
    lines.push(`URL: ${input.howToWatchPage.url}`);
    lines.push(`Excerpt: ${input.howToWatchPage.text.slice(0, 4000)}`);
  }
  return lines.join('\n');
}

function parseFindings(raw: string): ExtractedFinding[] {
  // Tolerant: strip any code fence wrapping.
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[discovery] LLM JSON parse failed:', cleaned.slice(0, 200));
    return [];
  }
  const findings: any[] = parsed?.findings ?? [];
  return findings
    .filter(f => f && typeof f.channelName === 'string' && typeof f.confidence === 'number')
    .filter(f => f.confidence >= 0.4)
    .map(f => ({
      channelName: String(f.channelName).trim(),
      tier: ['FREE', 'SUBSCRIPTION', 'PPV'].includes(f.tier) ? f.tier : null,
      sourceUrl: String(f.sourceUrl ?? '').trim(),
      snippet: String(f.snippet ?? '').slice(0, 280),
      confidence: Math.max(0, Math.min(1, Number(f.confidence))),
    }));
}
