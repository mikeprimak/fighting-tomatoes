/**
 * Identity label — the noun under "Welcome back, Mike" ("KO Lover",
 * "Tension Watcher", "Cardio Junkie") plus, since 2026-07-04, its
 * plain-language explanation and concrete receipts (Mike: "it should explain
 * it... and also specific fights that lead to this insight").
 *
 * Honors the locked signature decision (identity-platform.md, 2026-06-09):
 * NO frozen "you are X" type — this is a *rotating* noun drawn from the
 * user's current top insights, salted like the rest of the rail so it
 * changes day to day but stays stable within one.
 *
 * Curated maps first (these words are product surface); a generic
 * "{Phrase} Lover" fallback for positive kinds keeps new vocab from
 * rendering as silence forever; null when nothing qualifies (silence >
 * filler — the mobile pill simply doesn't render).
 */
import { tokenPhrase } from './tokenLabels';
import type { TasteIdentity } from './types';

interface RankedInsightLike {
  kind: string;
  dimension: string;
  token: string;
  /** Rendered receipts from the insight ("Because you liked ..."). */
  evidence?: string;
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
  'actionLevel.war': 'War Junkie',
  'actionLevel.high_action': 'Action Junkie',
  'violence.punishing': 'Punishment Connoisseur',
  'violence.brutal': 'Bloodsport Fan',
  'texture.chaotic_brawl': 'Chaos Enjoyer',
  'appeals.striking_clinic': 'Striking Purist',
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
  'fighterPersona.fan-favorite': 'People’s-Champ Fan',
  'fighterPersona.quiet-killer': 'Quiet-Killer Admirer',
};

/**
 * Plain-language meaning per curated noun key (Mike, 2026-07-04: descriptive,
 * "you like fights that are high paced and go into later rounds"). Falls back
 * to a generic built from the token phrase when a key has no entry.
 */
const IDENTITY_EXPLANATIONS: Record<string, string> = {
  'dominantSkill.knockout_power': 'You like fights decided by real punching power.',
  'dominantSkill.cardio': 'You like fights that keep a high pace deep into the later rounds.',
  'dominantSkill.heart': 'You like fights where somebody digs deep and refuses to fold.',
  'dominantSkill.wrestling': 'You like fights built on wrestling and control.',
  'dominantSkill.grappling': 'You like fights that hit the mat and stay interesting there.',
  'dominantSkill.striking': 'You like clean, high-level striking battles.',
  'pace.relentless': 'You like fights where the pace never lets up.',
  'pace.explosive': 'You like fast, violent exchanges that can end a fight any second.',
  'actionLevel.war': 'You like all-out wars where both sides empty the tank.',
  'actionLevel.high_action': 'You like fights with nonstop output from bell to bell.',
  'violence.punishing': 'You like fights where somebody pays a real price.',
  'violence.brutal': 'You like the rough ones. The rougher, the higher your score.',
  'texture.chaotic_brawl': 'You like fights that go completely off the rails.',
  'appeals.striking_clinic': 'You like watching a clean striking lesson.',
  'competitiveness.back_and_forth': 'You like fights where both sides have their moments and it could go either way.',
  'competitiveness.razor_thin': 'You like fights so close the judges have to sweat.',
  'drama.comeback': 'You like fights where somebody survives the bad rounds and turns it around.',
  'drama.coronation': 'You like the nights a new champion gets made.',
  'drama.upset': 'You like watching a favorite get proven wrong.',
  'letdowns.point_fighting': 'You stay with slow, tense fights that most fans write off.',
  'finish.ko': 'You like fights that end with a clean knockout.',
  'finish.tko': 'You like fights the referee has to stop, not the scorecards.',
  'finish.submission': 'You like fights that end with a tap.',
  'finishMoment.one_punch_ko': 'You like the single clean shot that ends everything.',
  'finishMoment.buzzer_beater': 'You like finishes that land right before the bell.',
  'finishTiming.final_seconds': 'You like fights that get decided in the final seconds.',
  'fighterAppeal.trash_talk': 'You gravitate to fighters who talk big and then have to back it up.',
  'fighterAppeal.underdog_story': 'You gravitate to the underdogs.',
  'fighterAppeal.knockout_power': 'You gravitate to fighters who can end a night with one punch.',
  'fighterAppeal.highlight_finishes': 'You gravitate to fighters who end fights in highlight-reel fashion.',
  'fighterPersona.polarizing': 'You gravitate to the fighters everybody argues about.',
  'fighterPersona.heel': 'You gravitate to the villains.',
  'fighterPersona.fan-favorite': 'You gravitate to the fighters the crowd loves.',
  'fighterPersona.quiet-killer': 'You gravitate to the quiet ones who let the fighting do the talking.',
};

/** Small deterministic hash for salt-stable rotation. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface IdentityCandidate {
  label: string;
  explanation: string;
  evidence?: string;
}

/**
 * Pick the rotating identity from ranked insights (best-first order
 * expected): noun + plain-language explanation + the source insight's
 * receipts. Rotates across the top eligible labels by salt; null = no pill.
 */
export function pickIdentity(
  insights: RankedInsightLike[],
  salt: string,
): TasteIdentity | null {
  const candidates: IdentityCandidate[] = [];
  const seen = new Set<string>();
  for (const i of insights) {
    if (!POSITIVE_KINDS.has(i.kind)) continue;
    const key = `${i.dimension}.${i.token}`;
    const curated = IDENTITY_NOUNS[key];
    if (curated) {
      if (!seen.has(curated)) {
        seen.add(curated);
        candidates.push({
          label: curated,
          explanation:
            IDENTITY_EXPLANATIONS[key] ??
            `You keep scoring ${tokenPhrase(i.dimension, i.token)} high.`,
          evidence: i.evidence,
        });
      }
      continue;
    }
    // Generic fallback only for the plainly-positive kinds where "{X} Lover"
    // can't read wrong. Skip fighter tokens (uuid — no phrase to build from).
    if (
      (i.kind === 'loves' || i.kind === 'prefers' || i.kind === 'rates-high') &&
      i.dimension !== 'fighter'
    ) {
      const phrase = tokenPhrase(i.dimension, i.token);
      // "Lover of punishing fights" reads natural for any phrase; the old
      // "{Phrase} Lover" form produced "Punishing fights Lover".
      const generic = `Lover of ${phrase}`;
      if (!seen.has(generic)) {
        seen.add(generic);
        candidates.push({
          label: generic,
          explanation: `You keep scoring ${phrase} high.`,
          evidence: i.evidence,
        });
      }
    }
    if (candidates.length >= 4) break;
  }
  if (candidates.length === 0) return null;
  return candidates[hashStr(salt) % Math.min(candidates.length, 4)];
}

/** Back-compat: just the noun (greeting pill). */
export function pickIdentityLabel(
  insights: RankedInsightLike[],
  salt: string,
): string | null {
  return pickIdentity(insights, salt)?.label ?? null;
}
