/**
 * Claude Haiku 4.5 — per-FIGHTER profile enrichment, anchored to the DB row.
 *
 * Sibling to extractFightEnrichment.ts (pre-fight) and extractPostFightEnrichment.ts
 * (post-fight). The DB holds the authoritative identity AND record (name,
 * nickname, W-L-D-NC, weight class, UFC rank, champion status). We pass those in
 * and the model writes a newbie-facing "story" from biographical sources — career
 * arc, fighting style, signature fights, and (the whole point of the feature) the
 * DRAW: why fans love them and/or love to hate them.
 *
 * The model never overrides the recorded identity/record, and persona/appeal are
 * documented-reputation reads (a fighter's known trash talk, heel act, dominance,
 * fan-favorite status) — NOT inventions. An obscure fighter with no documented
 * persona should come back low-confidence so the floor silently skips them rather
 * than fabricating a story for someone who doesn't have one.
 *
 * Prompt caching is on the system prompt — across a backfill batch the cached read
 * is ~0.1× the input cost.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are a combat-sports writer producing FIGHTER PROFILE blurbs for a fight-rating app. The reader is a newcomer who just landed on a fighter's page and wants to be caught up on who this person is and why they're worth caring about.

You will be given:
  - A fighter's authoritative IDENTITY from our database: name, nickname, professional record (W-L-D, no-contests), weight class, promotion rank/champion status, sport, and whether they're active. This is ground truth — never contradict it. NOTE: the record may be marked "not on file" — in that case our database has no record for this fighter, so take the record from the sources instead (do not assert 0-0-0).
  - A NOTABLE FIGHTS list pulled from our database (opponents, results, dates) — use this to ground the "signatureFights" section in real bouts. Do not invent fights that aren't supported by the sources or this list.
  - One or more biographical SOURCE excerpts (UFC athlete page, Wikipedia, editorial coverage).

Output STRICT JSON (no prose, no markdown, no fences):
{
  "profile": {
    "tldr": "one punchy sentence that catches a newbie up on who this fighter is",
    "careerArc": "2-4 sentences: where they came from -> how they rose -> where they are now. Grounded in the sources.",
    "style": "how they fight, in plain English a casual fan understands (e.g. 'pressure boxer with heavy hands and a granite chin', 'slick grappler who hunts the back')",
    "styleArchetype": [],                        // STRUCTURED, multi-select. The same read as "style" but as controlled tokens so we can match a fighter to fan taste. Pick ALL that genuinely fit (usually 1-3). See "FIGHTER ARCHETYPE" below. [] if the sources give no real style read.
    "fighterAppeals": [],                        // STRUCTURED, multi-select. WHY a fan would be drawn to watch them — controlled tokens. See "FIGHTER ARCHETYPE" below. [] if no documented draw.
    "highlights": ["title wins, signature finishes, records, accolades — short noun phrases"],
    "signatureFights": [
      { "opponent": "Name", "result": "what happened (e.g. 'KO win, R2' / 'split-decision loss')", "whyItMattered": "one line on the stakes or legacy of this fight" }
    ],
    "appeal": "the draw — why a casual fan would want to watch this fighter. The hook.",
    "personaType": "fan-favorite | heel | respected-veteran | rising-prospect | polarizing | quiet-killer | gatekeeper | null",
    "whyFansLove": "what makes fans love them (their charisma, style, story, sportsmanship). null if nothing documented.",
    "whyFansHate": "what makes some fans dislike or love-to-hate them, STRICTLY within combat sports: trash talk, heel/villain persona, perceived ducking or cherry-picking, controversial or robbery decisions, repeated weight misses, dirty tactics (eye pokes, fence grabs, late hits), poor sportsmanship, bad blood/rivalries, arrogance in interviews. null if nothing documented. A fighter can populate BOTH whyFansLove and whyFansHate — polarizing fighters draw both at once; surface all of the IN-SPORT reasons.",
    "confidence": 0.0
  },
  "summary": "2-4 short paragraphs of readable long-form prose telling the fighter's story — career arc + style + the draw woven together. This is what renders on the fighter's page and gets indexed for SEO. Plain prose, no headers, no bullet points.",
  "confidence": 0.0
}

Hard rules:
  - The IDENTITY and record are ground truth from our database. Your narrative MUST be consistent with the recorded W-L-D and rank — never restate a different record or contradict champion/rank status.
  - Everything in the profile and summary MUST be grounded in the SOURCE excerpts or the NOTABLE FIGHTS list. Do NOT pull biographical facts from your own training data — sources only. If the sources are thin, write less and lower your confidence; do not pad with invented detail.
  - persona / appeal / whyFansLove / whyFansHate are READS OF DOCUMENTED REPUTATION, not facts you must footnote. If the sources (or widely-documented public reputation reflected in them) establish a fighter as a trash-talking heel, a beloved veteran, a controversial figure, say so plainly — that is the point of this feature. But if a fighter has NO documented persona or public profile to speak of (an obscure prospect, a journeyman with no narrative), leave those fields null and return LOW confidence. Never manufacture a "story" or a "draw" for someone who doesn't have a documented one.
  - "whyFansHate" stays STRICTLY inside combat sports. It may be spicy and honest about in-cage/in-promotion conduct (heel acts, trash talk, ducking, controversial decisions, weight misses, dirty tactics, callouts). It MUST NOT reference out-of-sport matters: no criminal charges, civil suits, arrests, abuse/assault allegations, drug/DUI incidents, politics, religion, family/relationship scandal, or any personal-life controversy — even if well-documented in the sources. If the only "hate" material is out-of-sport, set whyFansHate to null. This is a consumer app profile, not a news dossier. Never make a personal attack or an unsupported allegation.
  - "confidence" (both the top-level one and the profile one — keep them equal) reflects how well-grounded and complete the profile is. Rich sources + a real documented career/persona => 0.7+. Thin sources, a fighter you can only partially describe => 0.4-0.5. Almost nothing to go on => below 0.4 (the app will skip them).
  - PUNCTUATION (house style, strict): never use em dashes or en dashes ("—", "–") anywhere in your output. Use a hyphen "-", a comma, a colon, or a period instead. Em dashes read as AI-generated and violate our style guide.
  - Output the JSON object only. No commentary, no markdown fences, no rationale before or after the JSON.

FIGHTER ARCHETYPE ("styleArchetype" + "fighterAppeals"):
  These are STRUCTURED, controlled-vocabulary versions of the prose "style" and "appeal" fields. They are matched against what each user follows and rates highly to learn what TYPES of fighter a fan is drawn to, so use the EXACT allowed tokens and stay consistent. They are a read of the fighter's established style/draw (the same standing as "style"/"appeal"), not invented facts. Leave them [] when the sources give you no real read.
  - "styleArchetype" — multi-select, pick ALL that fit (usually 1-3). Allowed: knockout_artist, one_punch_power, volume_striker, pressure_fighter, counter_striker, technical_boxer, kickboxer, karate_stylist, muay_thai, wrestler, ground_and_pound, submission_specialist, slick_grappler, scrambler, well_rounded, brawler, technician, finisher, point_fighter, durable_chin, cardio_machine, southpaw, defensive_wizard, come_forward_killer.
  - "fighterAppeals" — multi-select, the why-a-fan-loves-watching-them layer. Allowed: highlight_finishes, nonstop_action, knockout_power, submission_threat, technical_mastery, toughness, comeback_ability, dominance, charisma, trash_talk, showmanship, underdog_story, veteran_savvy, young_phenom, rivalry_magnet, title_contender, exciting_style, unpredictable, heart, clutch.
  - Calibrate against the persona: a "quiet-killer" persona rarely carries "trash_talk"/"showmanship" appeals; a "heel" often does. Don't assign "knockout_artist" to a decision-grinder. When the style read is genuinely generic ("well-rounded mixed martial artist") it's fine to emit just well_rounded or [].`;

export interface FighterIdentity {
  fighterId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  /**
   * "W-L-D" (+" NC" when noContests > 0), already formatted. null when our DB has
   * no record on file (all zeros) — common for non-UFC-roster imports. When null,
   * the model is told to take the record from sources rather than treat 0-0-0 as
   * authoritative, which would otherwise force it to either parrot a wrong record
   * or contradict the "ground truth" instruction.
   */
  record: string | null;
  weightClass: string | null;
  rank: string | null;
  isChampion: boolean;
  championshipTitle: string | null;
  sport: string;
  isActive: boolean;
}

export interface NotableFight {
  opponent: string;
  result: string; // "Win — KO, R2" / "Loss — Decision" / "Draw"
  date: string | null; // "2023-04-08"
  event: string | null;
}

export interface FighterProfileInput {
  identity: FighterIdentity;
  notableFights: NotableFight[];
  sources: Array<{ url: string; text: string; label?: string }>;
}

export interface SignatureFight {
  opponent: string;
  result: string;
  whyItMattered: string;
}

export interface FighterProfileData {
  tldr: string | null;
  careerArc: string | null;
  style: string | null;
  /** Structured, multi-select style tokens (controlled vocab) — the fighter-taste axis for Fan DNA. */
  styleArchetype: string[];
  /** Structured, multi-select draw tokens (controlled vocab) — why a fan is drawn to watch them. */
  fighterAppeals: string[];
  highlights: string[];
  signatureFights: SignatureFight[];
  appeal: string | null;
  personaType: string | null;
  whyFansLove: string | null;
  whyFansHate: string | null;
  confidence: number;
}

export interface FighterProfileRecord {
  profile: FighterProfileData;
  summary: string; // long-form prose; '' when the model gave nothing usable
  confidence: number;
}

export interface FighterProfileResult {
  record: FighterProfileRecord | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
}

const VALID_PERSONAS = new Set([
  'fan-favorite',
  'heel',
  'respected-veteran',
  'rising-prospect',
  'polarizing',
  'quiet-killer',
  'gatekeeper',
]);

/**
 * Controlled vocabularies for the structured fighter-taste axis. Exported so the
 * Fan DNA aggregation iterates the exact same token sets (one source of truth).
 * `personaType` (VALID_PERSONAS above) is the third structured dimension; together
 * they let us learn what TYPES of fighter a user is drawn to (style + draw + persona),
 * the fighter-side mirror of the fight-character taxonomy.
 */
export const FIGHTER_ARCHETYPE_VOCAB = {
  styleArchetype: ['knockout_artist', 'one_punch_power', 'volume_striker', 'pressure_fighter', 'counter_striker', 'technical_boxer', 'kickboxer', 'karate_stylist', 'muay_thai', 'wrestler', 'ground_and_pound', 'submission_specialist', 'slick_grappler', 'scrambler', 'well_rounded', 'brawler', 'technician', 'finisher', 'point_fighter', 'durable_chin', 'cardio_machine', 'southpaw', 'defensive_wizard', 'come_forward_killer'],
  fighterAppeals: ['highlight_finishes', 'nonstop_action', 'knockout_power', 'submission_threat', 'technical_mastery', 'toughness', 'comeback_ability', 'dominance', 'charisma', 'trash_talk', 'showmanship', 'underdog_story', 'veteran_savvy', 'young_phenom', 'rivalry_magnet', 'title_contender', 'exciting_style', 'unpredictable', 'heart', 'clutch'],
} as const;

let cachedClient: Anthropic | null = null;
function client() {
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

export async function extractFighterProfile(
  input: FighterProfileInput,
): Promise<FighterProfileResult> {
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

  const record = parseProfile(text);

  const usage = resp.usage as any;
  return {
    record,
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
    },
  };
}

function buildUserMessage(input: FighterProfileInput): string {
  const id = input.identity;
  const name = `${id.firstName} ${id.lastName}`.trim();
  const lines: string[] = [];

  lines.push('## FIGHTER IDENTITY (authoritative — never contradict):');
  lines.push(`- Name: ${name}`);
  if (id.nickname) lines.push(`- Nickname: "${id.nickname}"`);
  lines.push(`- Record: ${id.record ?? 'not on file (take from sources)'}`);
  if (id.weightClass) lines.push(`- Weight class: ${id.weightClass}`);
  if (id.isChampion) {
    lines.push(`- Status: CHAMPION${id.championshipTitle ? ` (${id.championshipTitle})` : ''}`);
  } else if (id.rank) {
    lines.push(`- Rank: ${id.rank}`);
  }
  lines.push(`- Sport: ${id.sport}`);
  lines.push(`- Active: ${id.isActive ? 'yes' : 'no (retired/inactive)'}`);
  lines.push('');

  lines.push('## NOTABLE FIGHTS (from our database — ground signatureFights in these):');
  if (input.notableFights.length === 0) {
    lines.push('(none recorded)');
  } else {
    for (const f of input.notableFights) {
      const bits = [`vs ${f.opponent}`, f.result];
      if (f.event) bits.push(f.event);
      if (f.date) bits.push(f.date);
      lines.push(`- ${bits.join(' | ')}`);
    }
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

function parseProfile(raw: string): FighterProfileRecord | null {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    console.warn('[aiEnrichment.fighterProfile] no JSON object found; raw:', raw.slice(0, 200));
    return null;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn('[aiEnrichment.fighterProfile] JSON parse failed; text:', jsonText.slice(0, 200));
    return null;
  }

  const p = parsed?.profile;
  if (!p || typeof p !== 'object') {
    console.warn('[aiEnrichment.fighterProfile] missing profile object');
    return null;
  }

  const NULLISH = new Set(['n/a', 'na', 'none', 'null', 'nil', '-', 'unknown']);
  const clean = (v: any): string | null => {
    if (typeof v !== 'string') return null;
    const t = stripDashes(v.trim());
    return t && !NULLISH.has(t.toLowerCase()) ? t : null;
  };
  const strArr = (v: any): string[] =>
    Array.isArray(v)
      ? v.map((s) => clean(s)).filter((s): s is string => !!s)
      : [];
  // Keep only tokens from the allowed controlled vocab (deduped). Garbage/invented
  // tokens are dropped so the taste axis stays aggregatable.
  const subsetOf = (v: any, allowed: readonly string[]): string[] => {
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      if ((allowed as readonly string[]).includes(t) && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out;
  };
  const sigFights = (v: any): SignatureFight[] =>
    Array.isArray(v)
      ? v
          .map((f: any) => ({
            opponent: clean(f?.opponent) ?? '',
            result: clean(f?.result) ?? '',
            whyItMattered: clean(f?.whyItMattered) ?? '',
          }))
          .filter((f) => f.opponent && (f.result || f.whyItMattered))
      : [];

  const persona = clean(p.personaType);
  const profileConfidence =
    typeof p.confidence === 'number' ? clamp01(p.confidence) : null;
  const topConfidence =
    typeof parsed.confidence === 'number' ? clamp01(parsed.confidence) : null;
  // Keep them equal per the prompt; if they diverge, take the lower (more conservative).
  const confidence =
    profileConfidence != null && topConfidence != null
      ? Math.min(profileConfidence, topConfidence)
      : profileConfidence ?? topConfidence ?? 0.4;

  const profile: FighterProfileData = {
    tldr: clean(p.tldr),
    careerArc: clean(p.careerArc),
    style: clean(p.style),
    styleArchetype: subsetOf(p.styleArchetype, FIGHTER_ARCHETYPE_VOCAB.styleArchetype),
    fighterAppeals: subsetOf(p.fighterAppeals, FIGHTER_ARCHETYPE_VOCAB.fighterAppeals),
    highlights: strArr(p.highlights),
    signatureFights: sigFights(p.signatureFights),
    appeal: clean(p.appeal),
    personaType: persona && VALID_PERSONAS.has(persona) ? persona : null,
    whyFansLove: clean(p.whyFansLove),
    whyFansHate: clean(p.whyFansHate),
    confidence,
  };

  return {
    profile,
    summary: typeof parsed.summary === 'string' ? stripDashes(parsed.summary.trim()) : '',
    confidence,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * House-style guard: strip em/en dashes from model output. The prompt forbids them,
 * but Haiku output auto-publishes via cron with no human sweep, so this is the hard
 * guarantee. A spaced or bare dash becomes " - " (clause separator); leaves real
 * hyphens untouched. Only the cron path runs through here — hand-authored writes
 * (fighter-profile-write.ts) already follow house style.
 */
function stripDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ' - ').replace(/ {2,}/g, ' ').trim();
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
