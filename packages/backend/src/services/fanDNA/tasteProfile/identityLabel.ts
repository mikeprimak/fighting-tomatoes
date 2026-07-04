/**
 * Identity label — the noun under "Welcome back, Mike" ("KO Lover",
 * "Tension Watcher", "War Junkie").
 *
 * Honors the locked signature decision (identity-platform.md, 2026-06-09):
 * NO frozen "you are X" type — this is a *rotating* noun drawn from the
 * user's current top insights, salted like the rest of the rail so it
 * changes day to day but stays stable within one.
 *
 * Curated map first (these words are product surface); a generic
 * "{Phrase} Lover" fallback for positive kinds keeps new vocab from
 * rendering as silence forever; null when nothing qualifies (silence >
 * filler — the mobile pill simply doesn't render).
 */
import { tokenPhrase, cap } from './tokenLabels';

interface RankedInsightLike {
  kind: string;
  dimension: string;
  token: string;
}

/** Kinds that can speak AS an identity (never the negative ones). */
const POSITIVE_KINDS = new Set([
  'loves',
  'prefers',
  'rates-high',
  'community-high',
  'fighter-appeal',
  'fighter-persona',
]);

/** Hand-tuned nouns for the tokens that actually surface at current scale. */
const IDENTITY_NOUNS: Record<string, string> = {
  // fight character — skills / pace / drama
  'dominantSkill.knockout_power': 'KO Lover',
  'dominantSkill.cardio': 'Cardio Junkie',
  'dominantSkill.heart': 'Heart-and-Guts Fan',
  'dominantSkill.wrestling': 'Wrestling Appreciator',
  'dominantSkill.grappling': 'Grappling Head',
  'dominantSkill.striking': 'Striking Purist',
  'pace.relentless': 'Pace Junkie',
  'pace.explosive': 'Firefight Fan',
  'competitiveness.back_and_forth': 'War Junkie',
  'competitiveness.razor_thin': 'Split-Decision Sicko',
  'drama.comeback': 'Comeback Believer',
  'drama.coronation': 'Coronation Chaser',
  'drama.upset': 'Upset Hunter',
  'letdowns.point_fighting': 'Tension Watcher',
  // finishes
  'finish.ko': 'KO Lover',
  'finish.tko': 'Stoppage Fan',
  'finish.submission': 'Submission Hunter',
  'finishMoment.one_punch_ko': 'One-Punch Devotee',
  'finishMoment.buzzer_beater': 'Buzzer-Beater Fan',
  'finishTiming.final_seconds': 'Late-Drama Lover',
  // fighter character
  'fighterAppeal.trash_talk': 'Trash Talk Connoisseur',
  'fighterAppeal.underdog_story': 'Underdog Rider',
  'fighterAppeal.knockout_power': 'KO Lover',
  'fighterAppeal.highlight_finishes': 'Highlight Hunter',
  'fighterPersona.polarizing': 'Lightning-Rod Loyalist',
  'fighterPersona.heel': 'Heel Enjoyer',
  'fighterPersona.fan_favorite': 'People’s-Champ Fan',
  'fighterPersona.quiet_killer': 'Quiet-Killer Admirer',
};

/** Small deterministic hash for salt-stable rotation. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Pick the rotating identity noun from ranked insights (best-first order
 * expected). Rotates across the top eligible labels by salt; null = no pill.
 */
export function pickIdentityLabel(
  insights: RankedInsightLike[],
  salt: string,
): string | null {
  const candidates: string[] = [];
  for (const i of insights) {
    if (!POSITIVE_KINDS.has(i.kind)) continue;
    const key = `${i.dimension}.${i.token}`;
    const curated = IDENTITY_NOUNS[key];
    if (curated) {
      if (!candidates.includes(curated)) candidates.push(curated);
      continue;
    }
    // Generic fallback only for the plainly-positive kinds where "{X} Lover"
    // can't read wrong. Skip fighter tokens (uuid — no phrase to build from).
    if (
      (i.kind === 'loves' || i.kind === 'prefers' || i.kind === 'rates-high') &&
      i.dimension !== 'fighter'
    ) {
      const generic = `${cap(tokenPhrase(i.dimension, i.token))} Lover`;
      if (!candidates.includes(generic)) candidates.push(generic);
    }
    if (candidates.length >= 4) break;
  }
  if (candidates.length === 0) return null;
  return candidates[hashStr(salt) % Math.min(candidates.length, 4)];
}
