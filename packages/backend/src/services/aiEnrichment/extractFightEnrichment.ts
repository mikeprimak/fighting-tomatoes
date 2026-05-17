/**
 * Claude Haiku 4.5 — per-fight enrichment, anchored to the DB card.
 *
 * The DB holds the authoritative card list (fightId, fighters, section, order).
 * We pass that card to the LLM and ask it to fill in narrative fields per
 * fightId from editorial text. The LLM never invents fights, never matches
 * fighter names — those problems are gone.
 *
 * Prompt caching is on the system prompt — across a batch of events the
 * cached read is ~0.1× the input cost.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are a combat-sports analyst enriching a fight card for a fight-rating app.

You will be given:
  - A promotion (e.g. "UFC")
  - An event name (e.g. "UFC Fight Night Allen vs Costa")
  - A CARD: the authoritative list of fights on this event, each with a fightId, fighter names, weight class, card section, and order on card.
  - One or more source excerpts (preview articles, official event pages).

Your job: emit ONE record per fightId that the editorial actually covers. Skip fightIds the editorial doesn't speak to — do NOT invent narrative from training data.

Output STRICT JSON (no prose, no markdown, no fences):
{
  "fights": [
    {
      "fightId": "abc-123-...",                   // copied verbatim from the CARD
      "rankings": { "red": 7, "blue": 12 },       // numeric rank when shown ("#7"); use null for unranked side; use null for the whole field if no rankings shown
      "odds": { "red": "-135", "blue": "+115" },  // strings; null if not shown
      "whyCare": "1-sentence hook a casual fan would understand. Plain English, no jargon. Omit the field if you have nothing grounded.",
      "stakes": [],                                // short bullet list of what's on the line. Empty if not in editorial.
      "storylines": [],                            // narrative angles ("rematch of 2024 FOTY", "Allen returns from 18-month layoff"). When editorial confirms a prior fight between the same two named fighters, you MUST include the literal word "rematch" (or "trilogy" for a third meeting) in one of the entries. Empty if not in editorial.
      "styleTags": [],                             // contrast tags like "striker vs grappler", "wrestler vs striker", "kickboxer vs MMA grappler". Apply the Inference rules below — these don't require explicit editorial phrasing, just enough signal from the matchup or framing.
      "pace": null,                                // "fast" | "tactical" | "grinding" | null. Apply the Inference rules below — pace is inferential. Leave null only when you genuinely have no read on the matchup.
      "riskTier": null,                            // "lopsided" | "favorite-leans" | "pickem" | null  — derive from odds when present
      "confidence": 0.6                            // 0.0–1.0, YOUR confidence the record is correct and useful for this specific fight
    }
  ]
}

Hard rules:
  - "fightId" must be one of the IDs from the CARD. Never invent IDs. Records with unknown fightIds will be dropped.
  - The CARD is the ground truth for which fights are on the event. NEVER add fights not in the CARD, even if you see them mentioned in the editorial.
  - "red" = fighter1 from the CARD, "blue" = fighter2. Orientation is fixed by the CARD; do not flip.
  - Narrative fields about EVENTS (stakes, whyCare, factual storylines like "X is coming off a knockout loss") MUST be grounded in the editorial text. If editorial doesn't speak to a specific fight at all, OMIT that fightId entirely — don't pad with empty arrays.
  - "riskTier" mapping when odds are present: spread of 300+ → lopsided; 150–299 → favorite-leans; <150 → pickem.
  - "confidence" reflects YOUR estimate. Editorial with named-fight discussion ⇒ 0.7+. Editorial that only namedrops the event ⇒ 0.4–0.5.
  - If editorial is silent on every fight, return {"fights": []}.
  - Output the JSON object only. No commentary, no markdown fences, no rationale before or after the JSON.

Inference rules (these are NOT fabrication — apply them whenever the matchup gives you signal):
  - "pace" is inferential — it describes how the fight will likely PLAY OUT given the two fighters' established tendencies. Pick one:
      • "fast" — two high-output strikers, known brawlers, or a striker with cardio against an aggressive opponent. Expect a firefight.
      • "tactical" — technical strikers, counter-fighters, low-output veterans, or a measured matchup of skilled-but-cautious fighters. Expect a chess match.
      • "grinding" — wrestler vs wrestler, a grappler taking down a striker, attrition matchups, or known cardio-grinders. Expect clinch/control/scrambles.
      • null — only when you have zero read on either fighter's style.
    Pace inference does NOT require editorial to say "this will be fast" — it requires you to recognize the matchup. You are an analyst; act like one.
  - "styleTags" follow the same rule: emit contrast tags when fighters' established styles imply a clash, even if the editorial doesn't spell it out. Common patterns: "striker vs grappler", "wrestler vs striker", "kickboxer vs boxer", "veteran vs prospect". Skip when the matchup is symmetrical with no contrast hook.
  - Rematches/trilogies: when editorial confirms (or strongly implies) a prior meeting between the two named fighters, ALWAYS include the literal word "rematch" (or "trilogy" for a third meeting) in storylines, plus the prior outcome when given. Example: "rematch of 2024 FOTY (Allen UD)". This token is load-bearing for downstream personalization.
  - You may use your general knowledge of named fighters' styles for pace + styleTags + rematch detection. Don't make up records or specific past events not in the editorial, but recognizing that (for example) a known wrestler will likely wrestle is analysis, not fabrication.`;

export interface CardItem {
  fightId: string;
  fighter1: string;
  fighter2: string;
  weightClass: string | null;
  cardSection: string | null;
  orderOnCard: number | null;
  isMainEvent: boolean;
  isTitle: boolean;
}

export interface FightEnrichmentInput {
  promotion: string;
  eventName: string;
  eventDate?: string;
  card: CardItem[];
  sources: Array<{ url: string; text: string; label?: string }>;
}

export type Pace = 'fast' | 'tactical' | 'grinding' | null;
export type RiskTier = 'lopsided' | 'favorite-leans' | 'pickem' | null;

export interface FightEnrichmentRecord {
  fightId: string;
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
  ghostFightIds: string[]; // fightIds returned by LLM that aren't in the card (dropped)
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

  const validIds = new Set(input.card.map((c) => c.fightId));
  const { records, ghosts } = parseFights(text, validIds);

  const usage = resp.usage as any;
  return {
    fights: records,
    ghostFightIds: ghosts,
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
  if (input.eventDate) lines.push(`Date: ${input.eventDate}`);
  lines.push('');
  lines.push('## CARD (authoritative — enrich only these fightIds):');
  for (const c of input.card) {
    const bits: string[] = [];
    bits.push(`fightId=${c.fightId}`);
    bits.push(`${c.fighter1} vs ${c.fighter2}`);
    if (c.weightClass) bits.push(`weight=${c.weightClass}`);
    if (c.cardSection) bits.push(`section=${c.cardSection}`);
    if (c.orderOnCard !== null) bits.push(`order=${c.orderOnCard}`);
    if (c.isMainEvent) bits.push('MAIN_EVENT');
    if (c.isTitle) bits.push('TITLE');
    lines.push(`- ${bits.join(' | ')}`);
  }
  lines.push('');
  if (input.sources.length === 0) {
    lines.push('## SOURCES: none');
  } else {
    for (let i = 0; i < input.sources.length; i++) {
      const s = input.sources[i];
      lines.push(`## Source ${i + 1}${s.label ? ` (${s.label})` : ''}`);
      lines.push(`URL: ${s.url}`);
      lines.push('Text:');
      lines.push(s.text);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function parseFights(
  raw: string,
  validIds: Set<string>,
): { records: FightEnrichmentRecord[]; ghosts: string[] } {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    console.warn('[aiEnrichment.extract] no JSON object found; raw:', raw.slice(0, 200));
    return { records: [], ghosts: [] };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn('[aiEnrichment.extract] JSON parse failed; text:', jsonText.slice(0, 200));
    return { records: [], ghosts: [] };
  }
  const fights: any[] = parsed?.fights ?? [];
  const PACES = ['fast', 'tactical', 'grinding'];
  const RISK = ['lopsided', 'favorite-leans', 'pickem'];

  const records: FightEnrichmentRecord[] = [];
  const ghosts: string[] = [];

  for (const f of fights) {
    if (!f || typeof f.fightId !== 'string') continue;
    const fightId = f.fightId.trim();
    if (!validIds.has(fightId)) {
      ghosts.push(fightId);
      continue;
    }
    records.push({
      fightId,
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
    });
  }

  return { records, ghosts };
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}
