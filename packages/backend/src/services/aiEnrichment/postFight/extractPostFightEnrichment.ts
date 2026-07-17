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

// Collapse an accolade phrase to a canonical award key so semantic duplicates
// ("Fight of the Night" vs "2025 FOTN Winner") fold together. Mirrors the same
// helper in the mobile CompletedFightDetailScreen so render and data agree.
function accoladeKey(raw: string): string {
  const s = raw.toLowerCase();
  if (/fight of the night|\bfotn\b/.test(s)) return 'FOTN';
  if (/performance of the night|\bpotn\b/.test(s)) return 'POTN';
  if (/knockout of the night|\bkotn\b/.test(s)) return 'KOTN';
  if (/submission of the night|\bsotn\b/.test(s)) return 'SOTN';
  if (/fight of the year|\bfoty\b/.test(s)) return 'FOTY';
  if (/performance of the year|\bpoty\b/.test(s)) return 'POTY';
  return s.trim().replace(/\s+/g, ' ');
}

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
      "character": {                             // STRUCTURED classification of WHAT THE FIGHT ACTUALLY WAS — drives fan-taste analytics. Use ONLY the allowed values listed in "FIGHT CHARACTER" below. Fill each field from the recap + result; set any field to null (or [] for the arrays) when the coverage doesn't support a confident read. This is classification of what the recap describes — the same analytic standing as choosing a method, not fabrication.
        "finish": null,                          // ko | tko | submission | decision | draw | no_contest | dq
        "finishMoment": null,                    // one_punch_ko | flurry_finish | ground_and_pound | slick_submission | grinding_submission | strikes_to_submission | cut_stoppage | corner_stoppage | injury_tko | doctor_stoppage | buzzer_beater | went_distance
        "finishTiming": null,                    // first_exchange | early | mid_fight | late | final_seconds | distance
        "competitiveness": null,                 // blowout | one_sided | competitive | back_and_forth | razor_thin | controversial | robbery
        "momentum": null,                        // wire_to_wire | one_comeback | multiple_swings | see_saw | late_surge | fading_finish
        "actionLevel": null,                     // war | high_action | moderate | measured | low_action | dud
        "violence": null,                        // brutal | bloody | punishing | clean | tame
        "pace": null,                            // relentless | fast | steady | tactical | grinding
        "phase": null,                           // striking_battle | grappling_battle | scramble_heavy | clinch_war | ground_control | wrestling_clinic | mixed
        "dominantSkill": null,                   // knockout_power | volume_striking | technical_boxing | kicking | jiu_jitsu | wrestling | scrambles | clinch | cardio | heart | fight_iq
        "drama": null,                           // comeback | upset | dominance | gritty_survival | redemption | changing_of_the_guard | coronation | anticlimax
        "upsetLevel": null,                      // none | mild | major | stunning
        "texture": null,                         // technical_masterclass | chaotic_brawl | methodical_grind | high_iq_chess | sloppy | awkward
        "significance": null,                    // title_change | title_defense | division_shakeup | star_is_born | statement_win | gatekeeping | stay_busy | career_crossroads
        "stakesLevel": null,                     // historic | major | notable | routine
        "appeals": [],                           // WHY a fan would love it — multi-select, pick ALL that genuinely apply (see vocab in FIGHT CHARACTER). This is the breadth dimension.
        "letdowns": [],                          // honest negatives — multi-select, pick any that apply, [] for a clean fight (see vocab)
        "vibe": null,                            // instant_classic | great_scrap | solid | decent | forgettable | frustrating | controversial
        "highlightWorthy": null                  // true if it produced a genuine highlight-reel moment, false if not, null if unclear
      },
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
  - List each award ONCE. Do not repeat the same accolade with different wording (e.g. never both "Fight of the Night" and "2025 FOTN Winner"). "fotyConsideration" is ONLY for Fight/Performance of the YEAR framing — never restate a Night bonus there.
  - "confidence" reflects YOUR estimate. Editorial with a real round-by-round or finish description ⇒ 0.7+. Editorial that only confirms the result in passing ⇒ 0.4–0.5. No real coverage ⇒ omit the fight.
  - If editorial is silent on every fight, return {"fights": []}.
  - Output the JSON object only. No commentary, no markdown fences, no rationale before or after the JSON.

FIGHT CHARACTER (the "character" object):
  This is a STRUCTURED, controlled-vocabulary description of what the fight was actually LIKE. It is aggregated across thousands of fights and across what each user rated highly, so consistency and using the EXACT allowed tokens matters more than nuance. Classifying what the recap describes (e.g. "a back-and-forth war that ended in a late KO") is analysis, the same standing as recording the method — not fabrication. But do NOT invent specifics the coverage doesn't support; set a field to null (or [] for arrays) whenever you're guessing.
  - Single-value fields: pick AT MOST ONE allowed token, or null. Never invent tokens, never return a value outside the list.
  - "appeals" — multi-select, the why-a-fan-loved-it layer. Pick ALL that genuinely apply. Allowed: knockout, submission, violence, heart, technique, drama, comeback, upset, dominance, controversy, grudge_payoff, stylistic_clash, underdog_story, veteran_clinic, prospect_breakout, title_stakes, grappling_artistry, striking_clinic, cardio_test, finish_hunting, durability, trash_talk_delivered, redemption.
  - "letdowns" — multi-select, honest negatives. [] for a clean fight. Allowed: point_fighting, stalling, clinch_heavy, low_output, early_stoppage, controversial_decision, injury_ending, anticlimactic, showboating, gassed_out, lay_and_pray.
  - Calibration: a "war" is genuinely high-volume, damaging, and competitive — don't inflate an ordinary decision to "war". "blowout" = near-shutout; "razor_thin" = legitimately could go either way; "robbery" only when the recap frames the scorecards as clearly wrong. "instant_classic" / "foty"-level vibes are rare — reserve them.
  - finish vs decision: if the result is a decision, "finish"/"finishMoment" describe the decision (finish=decision, finishTiming=distance) and you should focus on competitiveness/phase/texture instead.`;

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

/**
 * Controlled vocabularies for the structured "fight character" taxonomy. Exported
 * so the Fan DNA aggregation can iterate the exact same token sets (one source of
 * truth — extractor and analytics never drift). Each single-value dimension maps
 * to one allowed token (or null); `appeals` / `letdowns` are multi-select subsets.
 *
 * This is deliberately broad: it is meant to be the structured record of *what a
 * fight was actually like and why fans loved it*, dense enough to support taste
 * correlations across a user's whole rating history.
 */
export const FIGHT_CHARACTER_VOCAB = {
  finish: ['ko', 'tko', 'submission', 'decision', 'draw', 'no_contest', 'dq'],
  finishMoment: ['one_punch_ko', 'flurry_finish', 'ground_and_pound', 'slick_submission', 'grinding_submission', 'strikes_to_submission', 'cut_stoppage', 'corner_stoppage', 'injury_tko', 'doctor_stoppage', 'buzzer_beater', 'went_distance'],
  finishTiming: ['first_exchange', 'early', 'mid_fight', 'late', 'final_seconds', 'distance'],
  competitiveness: ['blowout', 'one_sided', 'competitive', 'back_and_forth', 'razor_thin', 'controversial', 'robbery'],
  momentum: ['wire_to_wire', 'one_comeback', 'multiple_swings', 'see_saw', 'late_surge', 'fading_finish'],
  actionLevel: ['war', 'high_action', 'moderate', 'measured', 'low_action', 'dud'],
  violence: ['brutal', 'bloody', 'punishing', 'clean', 'tame'],
  pace: ['relentless', 'fast', 'steady', 'tactical', 'grinding'],
  phase: ['striking_battle', 'grappling_battle', 'scramble_heavy', 'clinch_war', 'ground_control', 'wrestling_clinic', 'mixed'],
  dominantSkill: ['knockout_power', 'volume_striking', 'technical_boxing', 'kicking', 'jiu_jitsu', 'wrestling', 'scrambles', 'clinch', 'cardio', 'heart', 'fight_iq'],
  drama: ['comeback', 'upset', 'dominance', 'gritty_survival', 'redemption', 'changing_of_the_guard', 'coronation', 'anticlimax'],
  upsetLevel: ['none', 'mild', 'major', 'stunning'],
  texture: ['technical_masterclass', 'chaotic_brawl', 'methodical_grind', 'high_iq_chess', 'sloppy', 'awkward'],
  significance: ['title_change', 'title_defense', 'division_shakeup', 'star_is_born', 'statement_win', 'gatekeeping', 'stay_busy', 'career_crossroads'],
  stakesLevel: ['historic', 'major', 'notable', 'routine'],
  appeals: ['knockout', 'submission', 'violence', 'heart', 'technique', 'drama', 'comeback', 'upset', 'dominance', 'controversy', 'grudge_payoff', 'stylistic_clash', 'underdog_story', 'veteran_clinic', 'prospect_breakout', 'title_stakes', 'grappling_artistry', 'striking_clinic', 'cardio_test', 'finish_hunting', 'durability', 'trash_talk_delivered', 'redemption'],
  letdowns: ['point_fighting', 'stalling', 'clinch_heavy', 'low_output', 'early_stoppage', 'controversial_decision', 'injury_ending', 'anticlimactic', 'showboating', 'gassed_out', 'lay_and_pray'],
  vibe: ['instant_classic', 'great_scrap', 'solid', 'decent', 'forgettable', 'frustrating', 'controversial'],
} as const;

/** Single-value dimensions of the character taxonomy (each holds one vocab token or null). */
type CharacterScalarKey =
  | 'finish' | 'finishMoment' | 'finishTiming' | 'competitiveness' | 'momentum'
  | 'actionLevel' | 'violence' | 'pace' | 'phase' | 'dominantSkill' | 'drama'
  | 'upsetLevel' | 'texture' | 'significance' | 'stakesLevel' | 'vibe';

export type FightCharacter =
  & { [K in CharacterScalarKey]: string | null }
  & { appeals: string[]; letdowns: string[]; highlightWorthy: boolean | null };

export interface PostFightTags {
  methodNarrative: string | null;
  momentDescription: string | null;
  bonuses: string[];
  callouts: string[];
  aftermath: string[];
  fotyConsideration: string | null;
  /** Structured, enumerated description of what the fight actually was. Null when the model produced nothing usable. */
  character: FightCharacter | null;
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
    // Dedupe accolades by canonical award key so the same bonus can't appear
    // twice (e.g. "Fight of the Night" + "2025 FOTN Winner"), and so
    // fotyConsideration is dropped when it merely restates a Night bonus.
    const rawBonuses = strArr(f.bonuses);
    const seenAwards = new Set<string>();
    const bonuses: string[] = [];
    for (const b of rawBonuses) {
      const key = accoladeKey(b);
      if (seenAwards.has(key)) continue;
      seenAwards.add(key);
      bonuses.push(b);
    }
    let fotyConsideration = strOrNull(f.fotyConsideration);
    if (fotyConsideration && seenAwards.has(accoladeKey(fotyConsideration))) {
      fotyConsideration = null;
    }
    records.push({
      fightId,
      summary: typeof f.summary === 'string' ? f.summary.trim() : '',
      tags: {
        methodNarrative: strOrNull(f.methodNarrative),
        momentDescription: strOrNull(f.momentDescription),
        bonuses,
        callouts: strArr(f.callouts),
        aftermath: strArr(f.aftermath),
        fotyConsideration,
        character: parseCharacter(f.character),
      },
      confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
    });
  }

  return { records, ghosts };
}

/**
 * Validate the raw "character" object against FIGHT_CHARACTER_VOCAB. Single-value
 * fields keep their token only if it's in the allowed set (else null); the two
 * multi-selects keep only allowed tokens (deduped). Garbage in → null/[] out, never
 * a thrown error. Returns null when the model omitted the object entirely or every
 * field came back empty (so downstream can treat "no character read" uniformly).
 */
export function parseCharacter(raw: any): FightCharacter | null {
  if (!raw || typeof raw !== 'object') return null;
  const V = FIGHT_CHARACTER_VOCAB;
  const scalarKeys: CharacterScalarKey[] = [
    'finish', 'finishMoment', 'finishTiming', 'competitiveness', 'momentum',
    'actionLevel', 'violence', 'pace', 'phase', 'dominantSkill', 'drama',
    'upsetLevel', 'texture', 'significance', 'stakesLevel', 'vibe',
  ];
  const oneOf = (val: any, allowed: readonly string[]): string | null =>
    typeof val === 'string' && (allowed as readonly string[]).includes(val.trim()) ? val.trim() : null;
  const subsetOf = (val: any, allowed: readonly string[]): string[] => {
    if (!Array.isArray(val)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of val) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      if ((allowed as readonly string[]).includes(t) && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out;
  };

  const character: FightCharacter = {
    finish: null, finishMoment: null, finishTiming: null, competitiveness: null,
    momentum: null, actionLevel: null, violence: null, pace: null, phase: null,
    dominantSkill: null, drama: null, upsetLevel: null, texture: null,
    significance: null, stakesLevel: null, vibe: null,
    appeals: subsetOf(raw.appeals, V.appeals),
    letdowns: subsetOf(raw.letdowns, V.letdowns),
    highlightWorthy: typeof raw.highlightWorthy === 'boolean' ? raw.highlightWorthy : null,
  };
  for (const k of scalarKeys) {
    character[k] = oneOf(raw[k], V[k]);
  }

  // Collapse to null when nothing usable came back, so consumers can branch once.
  const anyScalar = scalarKeys.some((k) => character[k] != null);
  const anyArray = character.appeals.length > 0 || character.letdowns.length > 0;
  if (!anyScalar && !anyArray && character.highlightWorthy == null) return null;
  return character;
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
