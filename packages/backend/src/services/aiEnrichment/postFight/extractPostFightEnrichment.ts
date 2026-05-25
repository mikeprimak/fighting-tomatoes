/**
 * Claude Haiku 4.5 — per-fight POST-fight enrichment, anchored to the DB card.
 *
 * Sibling to extractFightEnrichment.ts (the pre-fight extractor). The DB holds
 * the authoritative card AND the authoritative outcome (winner/method/round).
 * We pass both to the LLM and ask it to write a grounded recap per fightId from
 * post-event editorial. The LLM never invents fights, never overrides the
 * recorded result — it narrates what the editorial says happened.
 *
 * Prompt caching is on the system prompt — across a batch of events the cached
 * read is ~0.1× the input cost.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `You are a combat-sports analyst writing POST-fight recaps for a fight-rating app.

You will be given:
  - A promotion (e.g. "UFC")
  - An event name (e.g. "UFC Fight Night Allen vs Costa")
  - A CARD: the authoritative list of fights on this event. Each fight includes a fightId, fighter names, weight class, card section, order on card, AND the recorded RESULT (winner, method, round, time). The result is ground truth — it comes from our database, not from you.
  - One or more source excerpts (results articles, recaps, post-fight coverage).

Your job: emit ONE record per fightId that the editorial actually covers, describing WHAT HAPPENED in the fight. Skip fightIds the editorial doesn't speak to — do NOT invent a recap from training data or from the bare result line.

Output STRICT JSON (no prose, no markdown, no fences):
{
  "fights": [
    {
      "fightId": "abc-123-...",                 // copied verbatim from the CARD
      "summary": "300-500 word recap...",        // long-form editorial recap of how the fight played out, for SEO/web. Omit the field entirely if editorial gives you nothing beyond the bare result.
      "methodNarrative": "Holloway dropped Gaethje with a clean right hand and pointed at the canvas with 10 seconds left",  // 1-sentence concrete description of HOW the finish/decision came. Ground in editorial. null if unknown.
      "momentDescription": "the BMF buzzer-beater KO",  // the signature moment in one short phrase. null if nothing stands out.
      "bonuses": [],                             // ["Fight of the Night", "Performance of the Night", "Knockout of the Night"] — only those explicitly reported. Empty if none mentioned.
      "callouts": [],                            // post-fight callouts / mic moments ["called out Volkanovski"]. Empty if none.
      "aftermath": [],                           // consequences: ["broke his nose", "announced retirement", "moves to #1 contender", "suspended 6 months"]. Empty if none in editorial.
      "fotyConsideration": null,                 // "instant FOTY contender", "2026 FOTY frontrunner" etc. ONLY when editorial frames it that way. null otherwise.
      "confidence": 0.6                          // 0.0–1.0, YOUR confidence the recap is accurate and grounded for this specific fight
    }
  ]
}

Hard rules:
  - "fightId" must be one of the IDs from the CARD. Never invent IDs. Records with unknown fightIds will be dropped.
  - The CARD is ground truth for which fights happened AND for the result. Your recap MUST be consistent with the recorded winner/method/round — never contradict it. If editorial conflicts with the recorded result, trust the CARD's result and describe it accordingly.
  - "red" = fighter1 from the CARD, "blue" = fighter2. The recorded winner is given as a name; use it.
  - Everything in "summary", "methodNarrative", "momentDescription", "bonuses", "callouts", "aftermath", "fotyConsideration" MUST be grounded in the editorial text. The bare result line alone (e.g. "KO, Round 2") is NOT enough to write a narrative — if the editorial doesn't describe the fight, OMIT that fightId entirely. Do not pad.
  - Do NOT speculate about future bookings unless editorial states them. Do NOT invent bonuses or callouts.
  - "confidence" reflects YOUR estimate. Editorial with a real round-by-round or finish description ⇒ 0.7+. Editorial that only confirms the result in passing ⇒ 0.4–0.5. No real coverage ⇒ omit the fight.
  - If editorial is silent on every fight, return {"fights": []}.
  - Output the JSON object only. No commentary, no markdown fences, no rationale before or after the JSON.`;

export interface PostFightCardItem {
  fightId: string;
  fighter1: string;
  fighter2: string;
  weightClass: string | null;
  cardSection: string | null;
  orderOnCard: number | null;
  isMainEvent: boolean;
  isTitle: boolean;
  /** Authoritative result, resolved from the DB. */
  winnerName: string | null; // fighter name, "Draw", "No Contest", or null
  method: string | null;     // "KO", "TKO", "Submission", "Decision", ...
  round: number | null;
  time: string | null;       // "4:37"
}

export interface PostFightEnrichmentInput {
  promotion: string;
  eventName: string;
  eventDate?: string;
  card: PostFightCardItem[];
  sources: Array<{ url: string; text: string; label?: string }>;
}

export interface PostFightTags {
  methodNarrative: string | null;
  momentDescription: string | null;
  bonuses: string[];
  callouts: string[];
  aftermath: string[];
  fotyConsideration: string | null;
}

export interface PostFightEnrichmentRecord {
  fightId: string;
  summary: string;        // long-form recap; '' when omitted
  tags: PostFightTags;
  confidence: number;
}

export interface PostFightEnrichmentResult {
  fights: PostFightEnrichmentRecord[];
  ghostFightIds: string[];
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

export async function extractPostFightEnrichment(
  input: PostFightEnrichmentInput,
): Promise<PostFightEnrichmentResult> {
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

function buildUserMessage(input: PostFightEnrichmentInput): string {
  const lines: string[] = [];
  lines.push(`Promotion: ${input.promotion}`);
  lines.push(`Event: ${input.eventName}`);
  if (input.eventDate) lines.push(`Date: ${input.eventDate}`);
  lines.push('');
  lines.push('## CARD (authoritative — fights AND results. Recap only these fightIds):');
  for (const c of input.card) {
    const bits: string[] = [];
    bits.push(`fightId=${c.fightId}`);
    bits.push(`${c.fighter1} vs ${c.fighter2}`);
    if (c.weightClass) bits.push(`weight=${c.weightClass}`);
    if (c.cardSection) bits.push(`section=${c.cardSection}`);
    if (c.isMainEvent) bits.push('MAIN_EVENT');
    if (c.isTitle) bits.push('TITLE');
    // Result line — ground truth.
    const result: string[] = [];
    if (c.winnerName) result.push(`winner=${c.winnerName}`);
    if (c.method) result.push(`method=${c.method}`);
    if (c.round != null) result.push(`round=${c.round}`);
    if (c.time) result.push(`time=${c.time}`);
    bits.push(`RESULT[${result.length ? result.join(', ') : 'unrecorded'}]`);
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
): { records: PostFightEnrichmentRecord[]; ghosts: string[] } {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    console.warn('[aiEnrichment.postFight] no JSON object found; raw:', raw.slice(0, 200));
    return { records: [], ghosts: [] };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn('[aiEnrichment.postFight] JSON parse failed; text:', jsonText.slice(0, 200));
    return { records: [], ghosts: [] };
  }
  const fights: any[] = parsed?.fights ?? [];

  const records: PostFightEnrichmentRecord[] = [];
  const ghosts: string[] = [];
  const NULLISH = new Set(['n/a', 'na', 'none', 'null', 'nil', '-']);
  const clean = (s: string): string | null => {
    const t = s.trim();
    return t && !NULLISH.has(t.toLowerCase()) ? t : null;
  };
  const strArr = (v: any): string[] =>
    Array.isArray(v)
      ? v.filter((s: any) => typeof s === 'string').map((s: string) => clean(s)).filter((s): s is string => !!s)
      : [];
  const strOrNull = (v: any): string | null => (typeof v === 'string' ? clean(v) : null);

  for (const f of fights) {
    if (!f || typeof f.fightId !== 'string') continue;
    const fightId = f.fightId.trim();
    if (!validIds.has(fightId)) {
      ghosts.push(fightId);
      continue;
    }
    records.push({
      fightId,
      summary: typeof f.summary === 'string' ? f.summary.trim() : '',
      tags: {
        methodNarrative: strOrNull(f.methodNarrative),
        momentDescription: strOrNull(f.momentDescription),
        bonuses: strArr(f.bonuses),
        callouts: strArr(f.callouts),
        aftermath: strArr(f.aftermath),
        fotyConsideration: strOrNull(f.fotyConsideration),
      },
      confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
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
