/**
 * Claude Haiku 4.5 — derive the structured "fight character" taxonomy from a
 * recap we ALREADY have stored (aiPostFightSummary), no source fetching.
 *
 * This powers the cheap backfill path: ~2,200 fights carry 300-500-word
 * recaps written by the historic campaign / T+5d cron before the character
 * taxonomy existed. Re-deriving character from that stored text is a
 * text-only pass over data we own.
 *
 * The character JSON spec + calibration rules are rebuilt from
 * FIGHT_CHARACTER_VOCAB at module load, so this extractor can never drift
 * from the canonical vocabulary or the validating parser.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  FIGHT_CHARACTER_VOCAB,
  parseCharacter,
  type FightCharacter,
} from './extractPostFightEnrichment';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

const SCALAR_LINES = Object.entries(FIGHT_CHARACTER_VOCAB)
  .filter(([k]) => k !== 'appeals' && k !== 'letdowns')
  .map(([k, tokens]) => `    "${k}": null,  // ${(tokens as readonly string[]).join(' | ')}`)
  .join('\n');

const SYSTEM_PROMPT = `You are a combat-sports analyst classifying WHAT A FIGHT ACTUALLY WAS for a fight-rating app's taste analytics.

You will be given one fight: the fighters, the authoritative recorded RESULT (winner, method, round, time — ground truth from our database), and a RECAP of how the fight played out.

Emit ONLY the structured "character" classification as STRICT JSON (no prose, no markdown, no fences):
{
${SCALAR_LINES}
    "appeals": [],   // multi-select, WHY a fan would love it — pick ALL that genuinely apply: ${FIGHT_CHARACTER_VOCAB.appeals.join(', ')}
    "letdowns": [],  // multi-select, honest negatives, [] for a clean fight: ${FIGHT_CHARACTER_VOCAB.letdowns.join(', ')}
    "highlightWorthy": null  // true if it produced a genuine highlight-reel moment, false if not, null if unclear
}

Rules:
  - Use ONLY the exact allowed tokens. Single-value fields take AT MOST ONE token or null. Never invent tokens.
  - Your classification MUST be consistent with the recorded result. If the recap conflicts with the result, trust the result.
  - Classify what the recap describes — that is analysis, not fabrication. But do NOT invent specifics the recap doesn't support; use null (or []) whenever you would be guessing.
  - Calibration: a "war" is genuinely high-volume, damaging, and competitive — don't inflate an ordinary decision. "blowout" = near-shutout. "razor_thin" = legitimately could go either way. "robbery" only when the recap frames the scorecards as clearly wrong. "instant_classic" is rare — reserve it.
  - If the result is a decision: finish=decision, finishTiming=distance, and focus on competitiveness/phase/texture.
  - Output the JSON object only.`;

export interface RecapCharacterInput {
  fighter1: string;
  fighter2: string;
  weightClass: string | null;
  isTitle: boolean;
  promotion: string | null;
  winnerName: string | null;
  method: string | null;
  round: number | null;
  time: string | null;
  /** The stored aiPostFightSummary. */
  recap: string;
  /** Optional extra stored narrative (methodNarrative, momentDescription). */
  extraContext?: string | null;
}

export interface RecapCharacterResult {
  character: FightCharacter | null;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
}

let cachedClient: Anthropic | null = null;
function client() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

export async function extractCharacterFromRecap(
  input: RecapCharacterInput,
): Promise<RecapCharacterResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing');
  }

  const lines: string[] = [];
  lines.push(`Fight: ${input.fighter1} vs ${input.fighter2}`);
  if (input.promotion) lines.push(`Promotion: ${input.promotion}`);
  if (input.weightClass) lines.push(`Weight class: ${input.weightClass}`);
  if (input.isTitle) lines.push('TITLE FIGHT');
  const result: string[] = [];
  if (input.winnerName) result.push(`winner=${input.winnerName}`);
  if (input.method) result.push(`method=${input.method}`);
  if (input.round != null) result.push(`round=${input.round}`);
  if (input.time) result.push(`time=${input.time}`);
  lines.push(`RESULT (ground truth): ${result.length ? result.join(', ') : 'unrecorded'}`);
  lines.push('');
  lines.push('RECAP:');
  lines.push(input.recap);
  if (input.extraContext) {
    lines.push('');
    lines.push(`Additional stored notes: ${input.extraContext}`);
  }

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: lines.join('\n') }],
  });

  const text = resp.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim();

  let parsed: any = null;
  const start = text.indexOf('{');
  if (start >= 0) {
    try {
      parsed = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    } catch {
      parsed = null;
    }
  }

  const usage = resp.usage as any;
  return {
    character: parseCharacter(parsed),
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
    },
  };
}
