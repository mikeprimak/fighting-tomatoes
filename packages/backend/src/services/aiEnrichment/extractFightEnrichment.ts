/**
 * Claude Haiku 4.5 — per-fight enrichment from event preview source text.
 *
 * Given the raw text from one source (e.g. a ufc.com event page), emit one
 * structured record per fight. Designed to be honest about coverage gaps:
 * fields the source doesn't support are returned empty/null rather than
 * fabricated.
 *
 * Prompt caching is on the system prompt — across a batch of events the
 * cached read is ~0.1× the input cost.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are a combat-sports analyst extracting per-fight enrichment from web content for a fight-rating app.

You will be given:
  - A promotion (e.g. "UFC")
  - An event name (e.g. "UFC Fight Night Allen vs Costa")
  - One or more source excerpts of varying quality (card listings, articles, etc.)

For EACH fight you can identify in the source, emit one record. Do NOT fabricate fighters or fields that the source does not support — leave unsupported fields empty/null.

Output STRICT JSON (no prose, no markdown, no fences):
{
  "fights": [
    {
      "redFighter": "Arnold Allen",                // surname only is OK if that's all the source gives — try for full name
      "blueFighter": "Melquizael Costa",
      "weightClass": "Featherweight",              // null if not stated
      "cardSection": "MAIN_CARD",                  // EARLY_PRELIMS | PRELIMS | MAIN_CARD | null
      "isMainEvent": false,                        // true ONLY if the source flags this fight as the main event / headliner
      "rankings": { "red": 7, "blue": 12 },        // numeric rank when shown like "#7"; use null for unranked side; use null for the whole field if no rankings shown
      "odds": { "red": "-135", "blue": "+115" },   // strings; null if not shown
      "whyCare": "1-sentence hook a casual fan would understand. Plain English. Avoid jargon. Empty string if the source gives you nothing to anchor to.",
      "stakes": [],                                // short bullet list of what's on the line ("ranking implications", "title eliminator", "main event spotlight"). Empty if source doesn't support it.
      "storylines": [],                            // narrative angles ("rematch of 2024 FOTY", "Allen returns from 18-month layoff"). Empty if source doesn't support it.
      "styleTags": [],                             // ("striker vs grappler", "high-output volume", "knockout artist"). Empty if not derivable from source.
      "pace": null,                                // "fast" | "tactical" | "grinding" | null
      "riskTier": null,                            // "lopsided" | "favorite-leans" | "pickem" | null  — derive from odds when present
      "confidence": 0.6                            // 0.0–1.0, your own confidence the record is correct and useful
    }
  ]
}

Hard rules:
  - One record per fight. Don't merge multi-bout sections.
  - Prefer full fighter names. If only a surname is in the source, use the surname.
  - "isMainEvent" is true for at most ONE fight per event.
  - "riskTier" mapping when odds are present: spread of 300+ → lopsided; 150–299 → favorite-leans; <150 → pickem.
  - Do NOT invent storylines, styleTags, or stakes from training data. They MUST be grounded in the provided source text. If the source is just a card listing with no narrative, those arrays should be empty.
  - "confidence" reflects YOUR estimate of correctness. Card-listing-only inputs should yield 0.4–0.6. Editorial-grade inputs can yield 0.7+.
  - If you can't identify any fights, return {"fights": []}.`;

export interface FightEnrichmentInput {
  promotion: string;
  eventName: string;
  sources: Array<{ url: string; text: string }>;
}

export type CardSection = 'EARLY_PRELIMS' | 'PRELIMS' | 'MAIN_CARD' | null;
export type Pace = 'fast' | 'tactical' | 'grinding' | null;
export type RiskTier = 'lopsided' | 'favorite-leans' | 'pickem' | null;

export interface FightEnrichmentRecord {
  redFighter: string;
  blueFighter: string;
  weightClass: string | null;
  cardSection: CardSection;
  isMainEvent: boolean;
  rankings: { red: number | null; blue: number | null } | null;
  odds: { red: string | null; blue: string | null } | null;
  whyCare: string;
  stakes: string[];
  storylines: string[];
  styleTags: string[];
  pace: Pace;
  riskTier: RiskTier;
  confidence: number;
}

export interface FightEnrichmentResult {
  fights: FightEnrichmentRecord[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
}

let cachedClient: Anthropic | null = null;
function client() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

export async function extractFightEnrichment(
  input: FightEnrichmentInput,
): Promise<FightEnrichmentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing');
  }

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });

  const text = resp.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim();

  const usage = resp.usage as any;
  return {
    fights: parseFights(text),
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
    },
  };
}

function buildUserMessage(input: FightEnrichmentInput): string {
  const lines: string[] = [];
  lines.push(`Promotion: ${input.promotion}`);
  lines.push(`Event: ${input.eventName}`);
  lines.push('');
  for (let i = 0; i < input.sources.length; i++) {
    const s = input.sources[i];
    lines.push(`## Source ${i + 1}`);
    lines.push(`URL: ${s.url}`);
    lines.push('Text:');
    lines.push(s.text);
    lines.push('');
  }
  return lines.join('\n');
}

function parseFights(raw: string): FightEnrichmentRecord[] {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[aiEnrichment.extract] JSON parse failed; raw:', cleaned.slice(0, 300));
    return [];
  }
  const fights: any[] = parsed?.fights ?? [];
  const SECTIONS = ['EARLY_PRELIMS', 'PRELIMS', 'MAIN_CARD'];
  const PACES = ['fast', 'tactical', 'grinding'];
  const RISK = ['lopsided', 'favorite-leans', 'pickem'];

  return fights
    .filter((f) => f && typeof f.redFighter === 'string' && typeof f.blueFighter === 'string')
    .map((f) => ({
      redFighter: String(f.redFighter).trim(),
      blueFighter: String(f.blueFighter).trim(),
      weightClass: typeof f.weightClass === 'string' ? f.weightClass.trim() : null,
      cardSection: SECTIONS.includes(f.cardSection) ? (f.cardSection as CardSection) : null,
      isMainEvent: f.isMainEvent === true,
      rankings: f.rankings && typeof f.rankings === 'object'
        ? {
            red: typeof f.rankings.red === 'number' ? f.rankings.red : null,
            blue: typeof f.rankings.blue === 'number' ? f.rankings.blue : null,
          }
        : null,
      odds: f.odds && typeof f.odds === 'object'
        ? {
            red: typeof f.odds.red === 'string' ? f.odds.red : null,
            blue: typeof f.odds.blue === 'string' ? f.odds.blue : null,
          }
        : null,
      whyCare: typeof f.whyCare === 'string' ? f.whyCare.trim() : '',
      stakes: Array.isArray(f.stakes) ? f.stakes.filter((s: any) => typeof s === 'string') : [],
      storylines: Array.isArray(f.storylines) ? f.storylines.filter((s: any) => typeof s === 'string') : [],
      styleTags: Array.isArray(f.styleTags) ? f.styleTags.filter((s: any) => typeof s === 'string') : [],
      pace: PACES.includes(f.pace) ? (f.pace as Pace) : null,
      riskTier: RISK.includes(f.riskTier) ? (f.riskTier as RiskTier) : null,
      confidence: typeof f.confidence === 'number'
        ? Math.max(0, Math.min(1, f.confidence))
        : 0.5,
    }));
}
