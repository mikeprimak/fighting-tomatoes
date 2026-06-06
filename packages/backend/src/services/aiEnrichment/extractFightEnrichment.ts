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

// Minimum fan ratings before a fight's hype is trustworthy enough to show the LLM.
// Below this it's noise (a single 10/10 rating is not "fans are hyped"), so we omit
// it entirely rather than rely on the prompt to ignore it.
const HYPE_MIN_SAMPLE = 5;

const SYSTEM_PROMPT = `You are a combat-sports analyst enriching a fight card for a fight-rating app.

You will be given:
  - A promotion (e.g. "UFC")
  - An event name (e.g. "UFC Fight Night Allen vs Costa")
  - A CARD: the authoritative list of fights on this event, each with a fightId, fighter names, weight class, card section, order on card, and (when fans have rated it) a fanHype score + sample size.
  - One or more source excerpts (preview articles, official event pages).

Your job: emit ONE record per fightId that the editorial actually covers. Skip fightIds the editorial doesn't speak to — do NOT invent narrative from training data.

Output STRICT JSON (no prose, no markdown, no fences):
{
  "event": {                                       // card-wide summary — see "Event summary rules" below
    "summary": "ONE short line (~1 sentence, LAST NAMES ONLY) framing the whole card. See 'Event summary rules'. null if you can't ground a real card-wide read.",
    "confidence": 0.7                              // 0.0-1.0, YOUR confidence the event summary is accurate and useful
  },
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
  - You may use your general knowledge of named fighters' styles for pace + styleTags + rematch detection. Don't make up records or specific past events not in the editorial, but recognizing that (for example) a known wrestler will likely wrestle is analysis, not fabrication.

Event summary rules (the "event" object):
  - ONE tight line that frames the WHOLE card for a fan deciding whether to tune in. Keep it SHORT: roughly 15-25 words that fit three lines on a phone card. Plain English, no jargon. Lead with the main event in a few words (last names + the hook), then at most one more clause.
  - Use LAST NAMES ONLY ("Muhammad vs Bonfim", not "Belal Muhammad vs Gabriel Bonfim"), except where a first name is genuinely needed to tell apart two fighters who share a surname.
  - Reason across the CARD, not one fight: count of TITLE fights (use the CARD's TITLE flags), the main event and its stakes, notable returns/debuts, marquee names. Don't list every bout, pick the 1-2 hooks that sell the night.
  - FAN HYPE: some CARD fights show fanHype (scale 1-10, the average of fans' pre-fight excitement ratings, where 8+ is strong) and n (how many fans rated it). Only fights with enough ratings to be trustworthy carry this field, so a shown fanHype is always meaningful. Compare it RELATIVELY across the fights that show it. Use it to INFORM the line, never to dictate it: the main event still anchors.
    ONLY when a NON-main fight clearly leads on the shown hype (notably higher than the main event, or strongly hyped when the main event shows no hype) you MUST name that fan excitement EXPLICITLY using the word "fans". Do NOT swap in generic stakes language ("divisional implications", "with title-shot stakes") for the fan angle, and do NOT just restate the number. Worked example for a card whose co-main out-hypes the main event:
      GOOD: "Muhammad vs Bonfim headlines, but fans are most hyped for the Allen vs Shahbazyan co-main."
      BAD:  "Muhammad vs Bonfim headlines; Allen and Shahbazyan meet in the co-main with divisional implications." (mentions the fight but hides the fan excitement)
    If NO fight shows fanHype, or no non-main fight clearly out-hypes the main event, do NOT mention hype at all, just frame the headliner normally. Never invent fan excitement that the hype numbers don't support.
  - Do NOT fabricate. If only the main event is grounded, framing the headliner alone is fine. If you have nothing beyond names, set "summary" to null.
  - "confidence": editorial covers multiple fights / clear card-wide story ⇒ 0.7+. Only the main event grounded ⇒ 0.5-0.6. Thin/namedrop-only ⇒ below 0.5 (it will be hidden).
  - House style: no em dashes or en dashes (use commas, "and", or periods).`;

export interface CardItem {
  fightId: string;
  fighter1: string;
  fighter2: string;
  weightClass: string | null;
  cardSection: string | null;
  orderOnCard: number | null;
  isMainEvent: boolean;
  isTitle: boolean;
  /** Average of fans' pre-fight excitement ratings (0-100), null if none. */
  fanHype?: number | null;
  /** How many fans contributed to fanHype (sample size). */
  hypeCount?: number;
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

export interface EventSummary {
  summary: string;
  confidence: number;
}

export interface FightEnrichmentResult {
  fights: FightEnrichmentRecord[];
  event: EventSummary | null; // card-wide one-liner; null when ungrounded
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
  const { records, event, ghosts } = parseFights(text, validIds);

  const usage = resp.usage as any;
  return {
    fights: records,
    event,
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
    if (c.fanHype != null && c.hypeCount && c.hypeCount >= HYPE_MIN_SAMPLE) {
      bits.push(`fanHype=${c.fanHype.toFixed(1)}/10(n=${c.hypeCount})`);
    }
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
): { records: FightEnrichmentRecord[]; event: EventSummary | null; ghosts: string[] } {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    console.warn('[aiEnrichment.extract] no JSON object found; raw:', raw.slice(0, 200));
    return { records: [], event: null, ghosts: [] };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn('[aiEnrichment.extract] JSON parse failed; text:', jsonText.slice(0, 200));
    return { records: [], event: null, ghosts: [] };
  }
  const event = parseEventSummary(parsed?.event);
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

  return { records, event, ghosts };
}

function parseEventSummary(raw: any): EventSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary = typeof raw.summary === 'string' ? stripDashes(raw.summary.trim()) : '';
  if (!summary || /^(null|n\/a|none)$/i.test(summary)) return null;
  const confidence = typeof raw.confidence === 'number'
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.5;
  return { summary, confidence };
}

// House style: the cron auto-publishes with no human sweep, so guarantee no
// em/en dashes even if the prompt rule slips (mirrors the fighter-profile parser).
function stripDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ');
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
