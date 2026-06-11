/**
 * Commonness priors — the "everyone likes knockouts" filter.
 *
 * Each entry says how UNSURPRISING a preference is, per direction, 0..1:
 *   high = how expected it is to LIKE this token (rate it above your baseline)
 *   low  = how expected it is to be COLD on it
 * High commonness → heavy score dampening; "you love knockouts" is true of
 * nearly every fan and should almost never headline. Rare tastes (clinch wars,
 * grinding fights, decisions) get amplified — they're the screenshot material.
 *
 * Hand-set at current scale (we KNOW these without data); replaced by measured
 * population stats once the user base can support them. Unlisted tokens get
 * DEFAULT_COMMONNESS. Deliberately reversible — tune freely from pilot output.
 */

export const DEFAULT_COMMONNESS = 0.45;

type Prior = { high?: number; low?: number };

const PRIORS: Record<string, Prior> = {
  // Near-universal loves — dampen hard in the high direction. Being COLD on
  // these is genuinely distinctive, so the low direction stays interesting.
  'appeals.knockout': { high: 0.95, low: 0.1 },
  'method.Knockout': { high: 0.92, low: 0.1 },
  'finish.ko': { high: 0.9, low: 0.12 },
  'finishMoment.one_punch_ko': { high: 0.85, low: 0.15 },
  'actionLevel.war': { high: 0.8, low: 0.1 },
  'actionLevel.high_action': { high: 0.8, low: 0.12 },
  'vibe.instant_classic': { high: 0.92, low: 0.08 },
  'vibe.great_scrap': { high: 0.8, low: 0.15 },
  'drama.comeback': { high: 0.8, low: 0.15 },
  'appeals.comeback': { high: 0.8, low: 0.15 },
  'momentum.one_comeback': { high: 0.75, low: 0.2 },
  'competitiveness.back_and_forth': { high: 0.78, low: 0.15 },
  'momentum.see_saw': { high: 0.7, low: 0.2 },
  'finishMoment.buzzer_beater': { high: 0.75, low: 0.2 },
  'drama.upset': { high: 0.65, low: 0.25 },
  'appeals.upset': { high: 0.65, low: 0.25 },
  'upsetLevel.stunning': { high: 0.65, low: 0.25 },
  'appeals.violence': { high: 0.7, low: 0.2 },
  'violence.brutal': { high: 0.65, low: 0.25 },
  'violence.bloody': { high: 0.6, low: 0.3 },
  'texture.chaotic_brawl': { high: 0.6, low: 0.3 },

  // Near-universal dislikes — being cold on them is boring; LIKING them is
  // fascinating. Mirror image of the block above.
  'actionLevel.dud': { high: 0.02, low: 0.97 },
  'actionLevel.low_action': { high: 0.05, low: 0.9 },
  'vibe.forgettable': { high: 0.05, low: 0.9 },
  'vibe.frustrating': { high: 0.08, low: 0.85 },
  'letdowns.stalling': { high: 0.05, low: 0.92 },
  'letdowns.lay_and_pray': { high: 0.06, low: 0.92 },
  'letdowns.point_fighting': { high: 0.08, low: 0.85 },
  'letdowns.low_output': { high: 0.05, low: 0.9 },
  'letdowns.gassed_out': { high: 0.08, low: 0.85 },
  'drama.anticlimax': { high: 0.05, low: 0.9 },
  'letdowns.anticlimactic': { high: 0.05, low: 0.9 },
  'violence.tame': { high: 0.1, low: 0.8 },

  // Rare tastes — amplify. A fan who loves these is a genuine character.
  'pace.grinding': { high: 0.1, low: 0.7 },
  'texture.methodical_grind': { high: 0.12, low: 0.65 },
  'phase.clinch_war': { high: 0.1, low: 0.65 },
  'phase.ground_control': { high: 0.12, low: 0.65 },
  'phase.wrestling_clinic': { high: 0.18, low: 0.55 },
  'dominantSkill.wrestling': { high: 0.2, low: 0.5 },
  'dominantSkill.clinch': { high: 0.12, low: 0.6 },
  'finish.decision': { high: 0.15, low: 0.6 },
  'method.Decision': { high: 0.15, low: 0.6 },
  'finishTiming.distance': { high: 0.18, low: 0.55 },
  'finishMoment.went_distance': { high: 0.18, low: 0.55 },
  'pace.tactical': { high: 0.25, low: 0.5 },
  'texture.high_iq_chess': { high: 0.25, low: 0.5 },
  'competitiveness.one_sided': { high: 0.25, low: 0.45 },
  'competitiveness.blowout': { high: 0.3, low: 0.4 },
  'texture.sloppy': { high: 0.15, low: 0.6 },
  'texture.awkward': { high: 0.12, low: 0.55 },
  'stakesLevel.routine': { high: 0.12, low: 0.5 },
  'significance.stay_busy': { high: 0.12, low: 0.5 },
  'letdowns.clinch_heavy': { high: 0.08, low: 0.8 },
  'letdowns.showboating': { high: 0.2, low: 0.5 },
  'competitiveness.robbery': { high: 0.2, low: 0.5 },
  'appeals.controversy': { high: 0.3, low: 0.4 },

  // Moderately expected — mild dampening.
  'appeals.submission': { high: 0.55, low: 0.3 },
  'method.Submission': { high: 0.55, low: 0.3 },
  'finish.submission': { high: 0.55, low: 0.3 },
  'finishMoment.slick_submission': { high: 0.55, low: 0.3 },
  'phase.grappling_battle': { high: 0.35, low: 0.4 },
  'appeals.grappling_artistry': { high: 0.35, low: 0.4 },
  'dominantSkill.jiu_jitsu': { high: 0.4, low: 0.4 },
  'phase.striking_battle': { high: 0.65, low: 0.25 },
  'appeals.technique': { high: 0.5, low: 0.35 },
  'texture.technical_masterclass': { high: 0.5, low: 0.35 },
  'appeals.heart': { high: 0.7, low: 0.2 },
  'dominantSkill.heart': { high: 0.7, low: 0.2 },
  'drama.dominance': { high: 0.5, low: 0.35 },
  'appeals.dominance': { high: 0.5, low: 0.35 },
  'appeals.title_stakes': { high: 0.6, low: 0.3 },
  'significance.title_change': { high: 0.6, low: 0.3 },
  'appeals.underdog_story': { high: 0.7, low: 0.2 },

  // Fighter axis. Loving knockout artists is expected; loving point fighters,
  // gatekeepers, or heels is a personality.
  'fighterStyle.knockout_artist': { high: 0.85, low: 0.15 },
  'fighterStyle.one_punch_power': { high: 0.8, low: 0.2 },
  'fighterStyle.finisher': { high: 0.8, low: 0.2 },
  'fighterStyle.brawler': { high: 0.7, low: 0.25 },
  'fighterStyle.pressure_fighter': { high: 0.6, low: 0.3 },
  'fighterStyle.wrestler': { high: 0.25, low: 0.5 },
  'fighterStyle.point_fighter': { high: 0.08, low: 0.7 },
  'fighterStyle.defensive_wizard': { high: 0.25, low: 0.45 },
  'fighterStyle.counter_striker': { high: 0.35, low: 0.4 },
  'fighterStyle.submission_specialist': { high: 0.45, low: 0.35 },
  'fighterStyle.slick_grappler': { high: 0.35, low: 0.4 },
  'fighterStyle.cardio_machine': { high: 0.35, low: 0.4 },
  'fighterAppeal.highlight_finishes': { high: 0.9, low: 0.12 },
  'fighterAppeal.knockout_power': { high: 0.88, low: 0.12 },
  'fighterAppeal.nonstop_action': { high: 0.8, low: 0.15 },
  'fighterAppeal.exciting_style': { high: 0.85, low: 0.12 },
  'fighterAppeal.charisma': { high: 0.6, low: 0.3 },
  'fighterAppeal.trash_talk': { high: 0.4, low: 0.4 },
  'fighterAppeal.showmanship': { high: 0.5, low: 0.35 },
  'fighterAppeal.technical_mastery': { high: 0.45, low: 0.35 },
  'fighterAppeal.veteran_savvy': { high: 0.3, low: 0.4 },
  'fighterAppeal.dominance': { high: 0.5, low: 0.35 },
  'fighterPersona.fan-favorite': { high: 0.8, low: 0.15 },
  'fighterPersona.heel': { high: 0.25, low: 0.45 },
  'fighterPersona.quiet-killer': { high: 0.4, low: 0.4 },
  'fighterPersona.gatekeeper': { high: 0.12, low: 0.5 },
  'fighterPersona.polarizing': { high: 0.35, low: 0.4 },
  'fighterPersona.respected-veteran': { high: 0.4, low: 0.4 },
  'fighterPersona.rising-prospect': { high: 0.55, low: 0.3 },

  // Demographics: liking women's MMA reads as a distinctive, positive taste.
  'gender.FEMALE': { high: 0.3, low: 0.45 },
  'gender.MALE': { high: 0.7, low: 0.3 },
};

/** How expected this (token, direction) preference is, 0..1. */
export function commonness(
  dimension: string,
  token: string,
  direction: 'high' | 'low',
): number {
  const p = PRIORS[`${dimension}.${token}`];
  const v = direction === 'high' ? p?.high : p?.low;
  return v ?? DEFAULT_COMMONNESS;
}

/**
 * Score multiplier from commonness: common tastes are dampened, never zeroed
 * (a HUGE knockout gap can still surface), rare tastes amplified toward 1.
 */
export function rarityMultiplier(c: number): number {
  return 0.35 + 0.65 * (1 - c);
}
