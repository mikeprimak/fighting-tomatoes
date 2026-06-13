/**
 * Token → human phrase. These words ARE the product surface — every label is a
 * plural noun phrase that reads naturally in both copy frames the engine uses:
 *   "You love {X}"  and  "You rate {X} higher than most fans."
 *
 * Lookup order: exact `${dimension}.${token}` → dimension-generic builder
 * (weightClass, org) → humanized fallback (underscores to spaces + "fights").
 * The fallback keeps the engine vocab-agnostic: a token added to the taxonomy
 * tomorrow renders acceptably today and gets a hand-tuned label later.
 */

const LABELS: Record<string, string> = {
  // ── finish ──
  'finish.ko': 'clean knockouts',
  'finish.tko': 'TKO finishes',
  'finish.submission': 'submission finishes',
  'finish.decision': 'decisions',
  'finish.draw': 'draws',
  'finish.no_contest': 'no contests',
  'finish.dq': 'disqualification endings',

  // ── finishMoment ──
  'finishMoment.one_punch_ko': 'one-punch knockouts',
  'finishMoment.flurry_finish': 'flurry finishes',
  'finishMoment.ground_and_pound': 'ground-and-pound finishes',
  'finishMoment.slick_submission': 'slick submissions',
  'finishMoment.grinding_submission': 'grind-it-out submissions',
  'finishMoment.strikes_to_submission': 'strikes-into-submission finishes',
  'finishMoment.cut_stoppage': 'cut stoppages',
  'finishMoment.corner_stoppage': 'corner stoppages',
  'finishMoment.injury_tko': 'injury stoppages',
  'finishMoment.doctor_stoppage': 'doctor stoppages',
  'finishMoment.buzzer_beater': 'buzzer-beater finishes',
  'finishMoment.went_distance': 'fights that go the distance',

  // ── finishTiming ──
  'finishTiming.first_exchange': 'first-exchange finishes',
  'finishTiming.early': 'early finishes',
  'finishTiming.mid_fight': 'mid-fight finishes',
  'finishTiming.late': 'late finishes',
  'finishTiming.final_seconds': 'final-seconds finishes',
  'finishTiming.distance': 'full-distance fights',

  // ── competitiveness ──
  'competitiveness.blowout': 'blowouts',
  'competitiveness.one_sided': 'one-sided fights',
  'competitiveness.competitive': 'competitive fights',
  'competitiveness.back_and_forth': 'back-and-forth fights',
  'competitiveness.razor_thin': 'razor-thin fights',
  'competitiveness.controversial': 'controversial verdicts',
  'competitiveness.robbery': 'robberies',

  // ── momentum ──
  'momentum.wire_to_wire': 'wire-to-wire performances',
  'momentum.one_comeback': 'comeback fights',
  'momentum.multiple_swings': 'momentum-swing fights',
  'momentum.see_saw': 'see-saw battles',
  'momentum.late_surge': 'late-surge fights',
  'momentum.fading_finish': 'fade-down-the-stretch fights',

  // ── actionLevel ──
  'actionLevel.war': 'wars',
  'actionLevel.high_action': 'high-action fights',
  'actionLevel.moderate': 'middle-of-the-road fights',
  'actionLevel.measured': 'measured fights',
  'actionLevel.low_action': 'low-output fights',
  'actionLevel.dud': 'duds',

  // ── violence ──
  'violence.brutal': 'brutal fights',
  'violence.bloody': 'bloody fights',
  'violence.punishing': 'punishing fights',
  'violence.clean': 'clean technical fights',
  'violence.tame': 'tame fights',

  // ── pace ──
  'pace.relentless': 'relentless-pace fights',
  'pace.fast': 'fast-paced fights',
  'pace.steady': 'steady-pace fights',
  'pace.tactical': 'tactical fights',
  'pace.grinding': 'grinding fights',

  // ── phase ──
  'phase.striking_battle': 'striking battles',
  'phase.grappling_battle': 'grappling battles',
  'phase.scramble_heavy': 'scramble-heavy fights',
  'phase.clinch_war': 'clinch wars',
  'phase.ground_control': 'ground-control fights',
  'phase.wrestling_clinic': 'wrestling clinics',
  'phase.mixed': 'everywhere fights',

  // ── dominantSkill ──
  'dominantSkill.knockout_power': 'power-punching displays',
  'dominantSkill.volume_striking': 'volume-striking displays',
  'dominantSkill.technical_boxing': 'technical boxing displays',
  'dominantSkill.kicking': 'kicking clinics',
  'dominantSkill.jiu_jitsu': 'jiu-jitsu displays',
  'dominantSkill.wrestling': 'wrestling-led fights',
  'dominantSkill.scrambles': 'scramble showcases',
  'dominantSkill.clinch': 'clinch-craft fights',
  'dominantSkill.cardio': 'cardio showcases',
  'dominantSkill.heart': 'heart-on-display fights',
  'dominantSkill.fight_iq': 'fight-IQ displays',

  // ── drama ──
  'drama.comeback': 'comebacks',
  'drama.upset': 'upsets',
  'drama.dominance': 'dominant performances',
  'drama.gritty_survival': 'gritty survival fights',
  'drama.redemption': 'redemption stories',
  'drama.changing_of_the_guard': 'changing-of-the-guard fights',
  'drama.coronation': 'coronations',
  'drama.anticlimax': 'anticlimaxes',

  // ── upsetLevel ──
  'upsetLevel.none': 'fights that go to script',
  'upsetLevel.mild': 'mild upsets',
  'upsetLevel.major': 'major upsets',
  'upsetLevel.stunning': 'stunning upsets',

  // ── texture ──
  'texture.technical_masterclass': 'technical masterclasses',
  'texture.chaotic_brawl': 'chaotic brawls',
  'texture.methodical_grind': 'methodical grinds',
  'texture.high_iq_chess': 'high-IQ chess matches',
  'texture.sloppy': 'sloppy fights',
  'texture.awkward': 'awkward fights',

  // ── significance ──
  'significance.title_change': 'title changes',
  'significance.title_defense': 'title defenses',
  'significance.division_shakeup': 'division shakeups',
  'significance.star_is_born': 'star-is-born moments',
  'significance.statement_win': 'statement wins',
  'significance.gatekeeping': 'gatekeeper fights',
  'significance.stay_busy': 'stay-busy fights',
  'significance.career_crossroads': 'career-crossroads fights',

  // ── stakesLevel ──
  'stakesLevel.historic': 'historic-stakes fights',
  'stakesLevel.major': 'major-stakes fights',
  'stakesLevel.notable': 'notable-stakes fights',
  'stakesLevel.routine': 'routine fights',

  // ── appeals ──
  'appeals.knockout': 'knockouts',
  'appeals.submission': 'submissions',
  'appeals.violence': 'violent fights',
  'appeals.heart': 'shows of heart',
  'appeals.technique': 'technical displays',
  'appeals.drama': 'dramatic fights',
  'appeals.comeback': 'comebacks',
  'appeals.upset': 'upsets',
  'appeals.dominance': 'dominant performances',
  'appeals.controversy': 'controversial fights',
  'appeals.grudge_payoff': 'grudge-match payoffs',
  'appeals.stylistic_clash': 'style clashes',
  'appeals.underdog_story': 'underdog stories',
  'appeals.veteran_clinic': 'veteran clinics',
  'appeals.prospect_breakout': 'prospect breakouts',
  'appeals.title_stakes': 'title fights',
  'appeals.grappling_artistry': 'grappling artistry',
  'appeals.striking_clinic': 'striking clinics',
  'appeals.cardio_test': 'cardio tests',
  'appeals.finish_hunting': 'finish-hunting fights',
  'appeals.durability': 'durability displays',
  'appeals.trash_talk_delivered': 'trash-talk-delivered fights',
  'appeals.redemption': 'redemption stories',

  // ── letdowns ──
  'letdowns.point_fighting': 'point-fighting fights',
  'letdowns.stalling': 'stall-heavy fights',
  'letdowns.clinch_heavy': 'clinch-heavy fights',
  'letdowns.low_output': 'low-output fights',
  'letdowns.early_stoppage': 'early-stoppage endings',
  'letdowns.controversial_decision': 'controversial decisions',
  'letdowns.injury_ending': 'injury endings',
  'letdowns.anticlimactic': 'anticlimactic fights',
  'letdowns.showboating': 'showboating fights',
  'letdowns.gassed_out': 'gas-out fights',
  'letdowns.lay_and_pray': 'lay-and-pray fights',

  // ── vibe ──
  'vibe.instant_classic': 'instant classics',
  'vibe.great_scrap': 'great scraps',
  'vibe.solid': 'solid fights',
  'vibe.decent': 'decent fights',
  'vibe.forgettable': 'forgettable fights',
  'vibe.frustrating': 'frustrating fights',
  'vibe.controversial': 'controversial fights',

  // ── plain-DB dimensions ──
  'era.old_school': 'old-school fights',
  'era.modern_era': 'modern-era fights',
  'method.Knockout': 'knockouts',
  'method.Submission': 'submissions',
  'method.Decision': 'decisions',
  'gender.FEMALE': "women's fights",
  'gender.MALE': "men's fights",

  // ── fighter axis: styleArchetype ──
  'fighterStyle.knockout_artist': 'knockout artists',
  'fighterStyle.one_punch_power': 'one-punch power hitters',
  'fighterStyle.volume_striker': 'volume strikers',
  'fighterStyle.pressure_fighter': 'pressure fighters',
  'fighterStyle.counter_striker': 'counter strikers',
  'fighterStyle.technical_boxer': 'technical boxers',
  'fighterStyle.kickboxer': 'kickboxers',
  'fighterStyle.karate_stylist': 'karate stylists',
  'fighterStyle.muay_thai': 'Muay Thai fighters',
  'fighterStyle.wrestler': 'wrestlers',
  'fighterStyle.ground_and_pound': 'ground-and-pound fighters',
  'fighterStyle.submission_specialist': 'submission specialists',
  'fighterStyle.slick_grappler': 'slick grapplers',
  'fighterStyle.scrambler': 'scramblers',
  'fighterStyle.well_rounded': 'well-rounded fighters',
  'fighterStyle.brawler': 'brawlers',
  'fighterStyle.technician': 'technicians',
  'fighterStyle.finisher': 'finishers',
  'fighterStyle.point_fighter': 'point fighters',
  'fighterStyle.durable_chin': 'iron-chinned fighters',
  'fighterStyle.cardio_machine': 'cardio machines',
  'fighterStyle.southpaw': 'southpaws',
  'fighterStyle.defensive_wizard': 'defensive wizards',
  'fighterStyle.come_forward_killer': 'come-forward killers',

  // ── fighter axis: fighterAppeals ──
  'fighterAppeal.highlight_finishes': 'highlight-reel finishers',
  'fighterAppeal.nonstop_action': 'nonstop-action fighters',
  'fighterAppeal.knockout_power': 'heavy hitters',
  'fighterAppeal.submission_threat': 'submission threats',
  'fighterAppeal.technical_mastery': 'technical masters',
  'fighterAppeal.toughness': 'tough-as-nails fighters',
  'fighterAppeal.comeback_ability': 'comeback artists',
  'fighterAppeal.dominance': 'dominant fighters',
  'fighterAppeal.charisma': 'charismatic fighters',
  'fighterAppeal.trash_talk': 'trash talkers',
  'fighterAppeal.showmanship': 'showmen',
  'fighterAppeal.underdog_story': 'underdogs',
  'fighterAppeal.veteran_savvy': 'savvy veterans',
  'fighterAppeal.young_phenom': 'young phenoms',
  'fighterAppeal.rivalry_magnet': 'rivalry magnets',
  'fighterAppeal.title_contender': 'title contenders',
  'fighterAppeal.exciting_style': 'excitement-first fighters',
  'fighterAppeal.unpredictable': 'unpredictable fighters',
  'fighterAppeal.heart': 'all-heart fighters',
  'fighterAppeal.clutch': 'clutch performers',

  // ── fighter axis: personaType ──
  'fighterPersona.fan-favorite': 'fan favorites',
  'fighterPersona.heel': 'heels',
  'fighterPersona.respected-veteran': 'respected veterans',
  'fighterPersona.rising-prospect': 'rising prospects',
  'fighterPersona.polarizing': 'polarizing fighters',
  'fighterPersona.quiet-killer': 'quiet killers',
  'fighterPersona.gatekeeper': 'gatekeepers',
};

/**
 * Resolve a (dimension, token) to its human phrase.
 * Builders cover open-ended dimensions; the humanizer is the safety net that
 * keeps a brand-new token rendering acceptably instead of crashing copy.
 */
export function tokenPhrase(dimension: string, token: string): string {
  const exact = LABELS[`${dimension}.${token}`];
  if (exact) return exact;
  if (dimension === 'weightClass') return weightClassPhrase(token);
  if (dimension === 'org') return `${token} fights`;
  return `${humanize(token)} fights`;
}

/** "WOMENS_STRAWWEIGHT" → "women's strawweight fights". */
function weightClassPhrase(token: string): string {
  const t = token
    .toLowerCase()
    .replace(/^womens_?/, "women's ")
    .replace(/^mens_?/, "men's ")
    .replace(/_/g, ' ')
    .trim();
  return `${t} fights`;
}

/** "one_punch_ko" → "one punch ko". Last-resort readability. */
export function humanize(token: string): string {
  return token.replace(/[_-]+/g, ' ').trim().toLowerCase();
}

/** Capitalize the first letter (headline position). */
export function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
