/**
 * Claude Haiku 4.5 — derive the STRUCTURED fighter-archetype tokens
 * (styleArchetype + fighterAppeals) from a fighter's ALREADY-STORED aiProfile
 * prose. No fetching, no sources, no regeneration of the profile itself.
 *
 * Why this exists: prod aiProfile rows were generated before the structured
 * token fields were added to extractFighterProfile.ts, so 0/939 carry
 * styleArchetype/fighterAppeals and the Fan DNA fighter axis can only see
 * personaType. The stored prose ("pressure boxer with heavy hands and a
 * granite chin") was source-grounded at write time — deriving tokens from it
 * is a re-read, not new inference. Sibling of extractCharacterFromRecap.ts
 * (the fight-side stored-text pass).
 *
 * The prompt's allowed-token spec is built from FIGHTER_ARCHETYPE_VOCAB at
 * load so it cannot drift from the canonical vocabulary, and outputs are
 * filtered against the vocab anyway.
 */

import Anthropic from '@anthropic-ai/sdk';
import { FIGHTER_ARCHETYPE_VOCAB } from './extractFighterProfile';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

const SYSTEM_PROMPT = `You are annotating FIGHTER PROFILES for a fight-rating app with structured, controlled-vocabulary tokens. You will be given the prose profile we already wrote for one fighter (style description, appeal, persona, fan-sentiment notes). Your only job is to translate that prose into the two token fields below. You are a transcriber of the given text, NOT a fresh biographer: use ONLY what the prose supports. Do not add anything from your own knowledge of the fighter, even if you recognize them.

Output STRICT JSON (no prose, no markdown, no fences):
{
  "styleArchetype": [],   // multi-select, 1-3 MAX. HOW they fight, per the prose. [] if the prose gives no real style read.
  "fighterAppeals": [],   // multi-select, 1-3 MAX. WHY a fan is drawn to watch them, per the prose. [] if no documented draw.
  "confidence": 0.0       // how directly the prose supports the tokens you picked. Thin/generic prose => low.
}

Allowed "styleArchetype" tokens (use EXACTLY these strings):
${FIGHTER_ARCHETYPE_VOCAB.styleArchetype.join(', ')}

Allowed "fighterAppeals" tokens (use EXACTLY these strings):
${FIGHTER_ARCHETYPE_VOCAB.fighterAppeals.join(', ')}

Hard rules:
  - Pick only the tokens that DEFINE the fighter — the 1-3 things a fan would name first — not every adjective the prose touches. These tokens are matched against fan taste; if every fighter carries five styles, none of them mean anything. When torn between a 3rd token and stopping at 2, stop at 2.
  - Tokens must be supported by the GIVEN prose. "Heavy hands" supports knockout_power; a mention of constant pressure supports pressure_fighter; a documented heel act supports trash_talk/showmanship. A fighter the prose only calls "well-rounded" gets well_rounded or [] — do not decorate.
  - Calibrate against the persona when given: a "quiet-killer" rarely carries trash_talk/showmanship; a "heel" often does. Don't assign knockout_artist to someone the prose describes as a decision-grinder.
  - When the prose is generic or thin, return fewer tokens (or []) and low confidence rather than guessing.
  - Output the JSON object only.`;

export interface ArchetypeProseInput {
  name: string;
  weightClass: string | null;
  sport: string;
  // Stored aiProfile prose fields (any may be null):
  tldr: string | null;
  style: string | null;
  appeal: string | null;
  careerArc: string | null;
  personaType: string | null;
  whyFansLove: string | null;
  whyFansHate: string | null;
}

export interface ArchetypeTokens {
  styleArchetype: string[];
  fighterAppeals: string[];
  confidence: number;
}

export interface ArchetypeResult {
  tokens: ArchetypeTokens | null;
  /** Raw model text — populated only when parsing failed, for diagnostics. */
  rawText?: string;
  usage: { inputTokens: number; outputTokens: number };
}

const STYLE_SET = new Set<string>(FIGHTER_ARCHETYPE_VOCAB.styleArchetype);
const APPEAL_SET = new Set<string>(FIGHTER_ARCHETYPE_VOCAB.fighterAppeals);

let cachedClient: Anthropic | null = null;
function client() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

export function buildArchetypeUserMessage(input: ArchetypeProseInput): string {
  const lines: string[] = [];
  lines.push(`## FIGHTER: ${input.name}`);
  if (input.weightClass) lines.push(`Weight class: ${input.weightClass}`);
  lines.push(`Sport: ${input.sport}`);
  lines.push('');
  lines.push('## STORED PROFILE PROSE (your only source):');
  const field = (label: string, v: string | null) => {
    if (v && v.trim() && v !== 'null') lines.push(`- ${label}: ${v.trim()}`);
  };
  field('tldr', input.tldr);
  field('style', input.style);
  field('appeal', input.appeal);
  field('careerArc', input.careerArc);
  field('personaType', input.personaType);
  field('whyFansLove', input.whyFansLove);
  field('whyFansHate', input.whyFansHate);
  return lines.join('\n');
}

/** True when the profile has enough prose to be worth a model call at all. */
export function hasUsableProse(input: ArchetypeProseInput): boolean {
  return [input.tldr, input.style, input.appeal, input.careerArc, input.whyFansLove, input.whyFansHate].some(
    (v) => typeof v === 'string' && v.trim().length > 0 && v !== 'null',
  );
}

export async function extractArchetypeFromProfile(
  input: ArchetypeProseInput,
): Promise<ArchetypeResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildArchetypeUserMessage(input) }],
  });

  const text = resp.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
    .trim();

  const usage = resp.usage as any;
  const result: ArchetypeResult = {
    tokens: null,
    usage: {
      inputTokens: (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
      outputTokens: usage?.output_tokens ?? 0,
    },
  };

  // The model occasionally self-corrects: emits a JSON block, prose commentary,
  // then a corrected JSON block. Try candidates LAST-first (the correction is
  // always the later block), then fall back to the outermost brace span.
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const braceSpan =
    text.includes('{') && text.includes('}')
      ? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      : null;
  const candidates = [...fenced.reverse(), text, ...(braceSpan ? [braceSpan] : [])];

  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(candidate.trim());
      const strArr = (v: unknown, allowed: Set<string>): string[] =>
        Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && allowed.has(s)) : [];
      result.tokens = {
        styleArchetype: strArr(raw.styleArchetype, STYLE_SET),
        fighterAppeals: strArr(raw.fighterAppeals, APPEAL_SET),
        confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
      };
      break;
    } catch {
      // try next candidate
    }
  }
  if (!result.tokens) result.rawText = text;

  return result;
}
