/**
 * Copy pool for pace-affinity. Worms-tone.
 * Variables: {hype} or {rating} (depending on action), {pacePhrase}, {pace}.
 *
 * {pacePhrase} arrives as a noun phrase ("a fast one", "a tactical fight",
 * "a grinding match"). Templates never start with {pace} bare-quoted — that
 * would read as a label dump. {pacePhrase} is the only safe sentence-start
 * form, and even that is usually mid-sentence.
 *
 * 18 keys: 2 actions × 3 paces × 3 tiers. soft + humor variants per key.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    // ─── HYPE / FAST ──────────────────────────────────────────────────────
    'hype-pace-fast-high': {
      soft: [
        'A {hype} on {pacePhrase}. You came for the chaos.',
        '{hype} for {pacePhrase}. The brawler in you is awake.',
        'A {hype} on {pacePhrase}. No defense required.',
        '{hype} on {pacePhrase}. The action-junkie diagnostic is positive.',
        'A {hype} for {pacePhrase}. You like your fights LOUD.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The chaos department welcomes you back.',
        'A {hype} for {pacePhrase}. Defense is a personal choice.',
        '{hype}. {pacePhrase}. The pay-per-violence ratio looks correct to you.',
        'A {hype} on {pacePhrase}. You skipped the technique elective.',
        '{hype} for {pacePhrase}. The bell rings, you ring louder.',
      ],
    },
    'hype-pace-fast-mid': {
      soft: [
        'A {hype} on {pacePhrase}. Action-curious, not action-committed.',
        '{hype} for {pacePhrase}. The brawl pitch is being considered.',
        'A {hype} on {pacePhrase}. Measured enthusiasm for the chaos.',
        '{hype} on {pacePhrase}. Reserving the full reaction.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The chaos department awaits a second opinion.',
        'A {hype} for {pacePhrase}. The brawl quotient is acceptable.',
        '{hype}. {pacePhrase}. Politely uncommitted to the firefight.',
        'A {hype} on {pacePhrase}. The action seems fine. Probably.',
      ],
    },
    'hype-pace-fast-low': {
      soft: [
        'A {hype} on {pacePhrase}. The chaos did not call you.',
        '{hype} for {pacePhrase}. Volume isn\'t your love language.',
        'A {hype} on {pacePhrase}. The action pitch missed.',
        '{hype} on {pacePhrase}. You wanted craft, not chaos.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The brawl department received the email.',
        'A {hype} for {pacePhrase}. The fireworks budget is too generous.',
        '{hype}. {pacePhrase}. The noise complaint is filed.',
        'A {hype} on {pacePhrase}. You came for chess, not chaos.',
      ],
    },

    // ─── HYPE / TACTICAL ──────────────────────────────────────────────────
    'hype-pace-tactical-high': {
      soft: [
        'A {hype} on {pacePhrase}. You came for the chess.',
        '{hype} for {pacePhrase}. The technicians have your attention.',
        'A {hype} on {pacePhrase}. The slow burn is your tempo.',
        '{hype} on {pacePhrase}. Patient violence appreciated.',
        'A {hype} for {pacePhrase}. The craft sells, for you.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The technique committee approves.',
        'A {hype} for {pacePhrase}. The defense department issues a commendation.',
        '{hype}. {pacePhrase}. The chess crowd nods in unison.',
        'A {hype} on {pacePhrase}. You came for the footwork seminar.',
        '{hype} for {pacePhrase}. The "every round matters" caucus salutes.',
      ],
    },
    'hype-pace-tactical-mid': {
      soft: [
        'A {hype} on {pacePhrase}. Cautiously interested in the chess.',
        '{hype} for {pacePhrase}. Reading the matchup, not married to it.',
        'A {hype} on {pacePhrase}. Measured curiosity for a measured fight.',
        '{hype} on {pacePhrase}. Awaiting more developments.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The chess crowd registers a maybe.',
        'A {hype} for {pacePhrase}. The technique pitch is under review.',
        '{hype}. {pacePhrase}. Politely uncommitted to the slow burn.',
        'A {hype} on {pacePhrase}. The patient violence is on probation.',
      ],
    },
    'hype-pace-tactical-low': {
      soft: [
        'A {hype} on {pacePhrase}. The chess did not move you.',
        '{hype} for {pacePhrase}. You wanted fireworks, not footwork.',
        'A {hype} on {pacePhrase}. The slow burn did not catch.',
        '{hype} on {pacePhrase}. Craft acknowledged, interest withheld.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The chess club is taking it personally.',
        'A {hype} for {pacePhrase}. The technique department is back to the drawing board.',
        '{hype}. {pacePhrase}. The patience budget is unfunded.',
        'A {hype} on {pacePhrase}. The slow burn burned slow without you.',
      ],
    },

    // ─── HYPE / GRINDING ──────────────────────────────────────────────────
    'hype-pace-grinding-high': {
      soft: [
        'A {hype} on {pacePhrase}. You respect the grind.',
        '{hype} for {pacePhrase}. The attrition aficionado approves.',
        'A {hype} on {pacePhrase}. Wars of will are your kind of fight.',
        '{hype} on {pacePhrase}. The mat returns appreciated.',
        'A {hype} for {pacePhrase}. The control crowd has its champion.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The wrestling department welcomes a sympathizer.',
        'A {hype} for {pacePhrase}. The cardio committee approves.',
        '{hype}. {pacePhrase}. The "ride out the round" caucus is pleased.',
        'A {hype} on {pacePhrase}. Top control is, in fact, control.',
        '{hype} for {pacePhrase}. The grind respecters\' union accepts your dues.',
      ],
    },
    'hype-pace-grinding-mid': {
      soft: [
        'A {hype} on {pacePhrase}. Open to the grind, not sold yet.',
        '{hype} for {pacePhrase}. Reserving judgement on the attrition.',
        'A {hype} on {pacePhrase}. Tentative interest in the war.',
        '{hype} on {pacePhrase}. Considering the long fight.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The wrestling department awaits a second look.',
        'A {hype} for {pacePhrase}. The grind quotient is under audit.',
        '{hype}. {pacePhrase}. Politely uncommitted to the war of attrition.',
        'A {hype} on {pacePhrase}. The mat-time forecast looks fine. Probably.',
      ],
    },
    'hype-pace-grinding-low': {
      soft: [
        'A {hype} on {pacePhrase}. The grind is not your love.',
        '{hype} for {pacePhrase}. You came for fights, not folkstyle.',
        'A {hype} on {pacePhrase}. Attrition is not the pitch.',
        '{hype} on {pacePhrase}. The control game lost you.',
      ],
      humor: [
        '{hype} on {pacePhrase}. The wrestling department received the boos.',
        'A {hype} for {pacePhrase}. Top control failed to convert you.',
        '{hype}. {pacePhrase}. "Stand them up" is the requested ruling.',
        'A {hype} on {pacePhrase}. The grind respecters\' union is disappointed.',
      ],
    },

    // ─── RATE / FAST ──────────────────────────────────────────────────────
    'rate-pace-fast-high': {
      soft: [
        'A {rating} on {pacePhrase}. The chaos delivered.',
        '{rating} for {pacePhrase}. The fireworks paid off.',
        'A {rating} on {pacePhrase}. Loud fight, loud number.',
        '{rating} on {pacePhrase}. The action committee approves.',
        'A {rating} for {pacePhrase}. The brawl earned every point.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The chaos department closes the case.',
        'A {rating} for {pacePhrase}. Defense remains a personal choice.',
        '{rating}. {pacePhrase}. The pay-per-violence ratio: vindicated.',
        'A {rating} on {pacePhrase}. The technique elective: still skipped.',
        '{rating} for {pacePhrase}. The fireworks budget paid dividends.',
      ],
    },
    'rate-pace-fast-mid': {
      soft: [
        'A {rating} on {pacePhrase}. The chaos, only partial.',
        '{rating} for {pacePhrase}. The brawl arrived in pieces.',
        'A {rating} on {pacePhrase}. Loud fight, modest number.',
        '{rating} on {pacePhrase}. Action acknowledged, not crowned.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The chaos department: it tried.',
        'A {rating} for {pacePhrase}. The brawl committee logs a draw.',
        '{rating}. {pacePhrase}. The fireworks were mostly sparklers.',
        'A {rating} on {pacePhrase}. The volume was there. The verdict, lukewarm.',
      ],
    },
    'rate-pace-fast-low': {
      soft: [
        'A {rating} on {pacePhrase}. The chaos did not land.',
        '{rating} for {pacePhrase}. Action without enough else.',
        'A {rating} on {pacePhrase}. Loud, not memorable.',
        '{rating} on {pacePhrase}. The brawl did not earn it.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The brawl department apologizes.',
        'A {rating} for {pacePhrase}. The fireworks were, in fact, sparklers.',
        '{rating}. {pacePhrase}. The noise was the only thing.',
        'A {rating} on {pacePhrase}. The chaos department refunds.',
      ],
    },

    // ─── RATE / TACTICAL ──────────────────────────────────────────────────
    'rate-pace-tactical-high': {
      soft: [
        'A {rating} on {pacePhrase}. The chess delivered.',
        '{rating} for {pacePhrase}. Patient violence, well-paid.',
        'A {rating} on {pacePhrase}. The technicians did the work.',
        '{rating} on {pacePhrase}. The slow burn caught flame.',
        'A {rating} for {pacePhrase}. The craft earned the score.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The technique committee issues a citation.',
        'A {rating} for {pacePhrase}. The defense department: vindicated.',
        '{rating}. {pacePhrase}. The chess crowd has its number.',
        'A {rating} on {pacePhrase}. The footwork seminar was worth the price.',
        '{rating} for {pacePhrase}. The "every round matters" caucus rests its case.',
      ],
    },
    'rate-pace-tactical-mid': {
      soft: [
        'A {rating} on {pacePhrase}. The chess, half-finished.',
        '{rating} for {pacePhrase}. Technique was there. The fight wasn\'t.',
        'A {rating} on {pacePhrase}. Craft acknowledged, scored modestly.',
        '{rating} on {pacePhrase}. Tactical fight, tactical reaction.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The chess club calls it a draw.',
        'A {rating} for {pacePhrase}. The technique was beautiful and tepid.',
        '{rating}. {pacePhrase}. The patience paid in nickels.',
        'A {rating} on {pacePhrase}. The slow burn stayed slow.',
      ],
    },
    'rate-pace-tactical-low': {
      soft: [
        'A {rating} on {pacePhrase}. The chess did not move it.',
        '{rating} for {pacePhrase}. Footwork without payoff.',
        'A {rating} on {pacePhrase}. The slow burn never lit.',
        '{rating} on {pacePhrase}. Craft alone wasn\'t enough.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The chess club takes the L.',
        'A {rating} for {pacePhrase}. The technique department reviews film.',
        '{rating}. {pacePhrase}. The patience went unrewarded.',
        'A {rating} on {pacePhrase}. The slow burn burned out.',
      ],
    },

    // ─── RATE / GRINDING ──────────────────────────────────────────────────
    'rate-pace-grinding-high': {
      soft: [
        'A {rating} on {pacePhrase}. The grind earned it.',
        '{rating} for {pacePhrase}. The attrition paid off.',
        'A {rating} on {pacePhrase}. War of will, well-rewarded.',
        '{rating} on {pacePhrase}. The control game converted.',
        'A {rating} for {pacePhrase}. The mat-time was the fight.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The wrestling department issues a commendation.',
        'A {rating} for {pacePhrase}. The cardio committee: vindicated.',
        '{rating}. {pacePhrase}. The "ride out the round" caucus celebrates.',
        'A {rating} on {pacePhrase}. Top control was, in fact, control.',
        '{rating} for {pacePhrase}. The grind respecters\' union banks a win.',
      ],
    },
    'rate-pace-grinding-mid': {
      soft: [
        'A {rating} on {pacePhrase}. The grind, half-earned.',
        '{rating} for {pacePhrase}. Attrition got there. Slowly.',
        'A {rating} on {pacePhrase}. The war was there. The reward, modest.',
        '{rating} on {pacePhrase}. Grinding fight, grinding score.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The wrestling department logs a maybe.',
        'A {rating} for {pacePhrase}. The grind quotient was middling.',
        '{rating}. {pacePhrase}. Top control did some, not all.',
        'A {rating} on {pacePhrase}. The war was small.',
      ],
    },
    'rate-pace-grinding-low': {
      soft: [
        'A {rating} on {pacePhrase}. The grind did not pay.',
        '{rating} for {pacePhrase}. Attrition without reward.',
        'A {rating} on {pacePhrase}. Control without consequence.',
        '{rating} on {pacePhrase}. The war was a stalemate.',
      ],
      humor: [
        '{rating} on {pacePhrase}. The wrestling department hears you.',
        'A {rating} for {pacePhrase}. Top control failed to convert.',
        '{rating}. {pacePhrase}. The "stand them up" ruling is requested.',
        'A {rating} on {pacePhrase}. The grind respecters\' union concedes.',
      ],
    },
  },
};

export default copy;
