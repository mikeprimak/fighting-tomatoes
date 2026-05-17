/**
 * Copy pool for rematch-fan. Worms-tone.
 * Variables: {hype} or {rating}, {rematchPhrase} ("a rematch" / "a trilogy
 * fight"), {rematchKind} ("rematch" / "trilogy").
 *
 * Tone: rematches carry historical weight. Soft variants lean editorial
 * ("unfinished business", "the score is settled"). Humor variants lean toward
 * the meta-fan voice we use elsewhere ("the committee remembers").
 *
 * 6 keys: 2 actions × 3 tiers.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    // ─── HYPE ─────────────────────────────────────────────────────────────
    'hype-rematch-high': {
      soft: [
        'A {hype} on {rematchPhrase}. You came for the unfinished business.',
        '{hype} for {rematchPhrase}. The score wants settling.',
        'A {hype} on {rematchPhrase}. History is a hell of a hook.',
        '{hype} on {rematchPhrase}. The first fight earned this one.',
        'A {hype} for {rematchPhrase}. Sequels are your weakness.',
      ],
      humor: [
        '{hype} on {rematchPhrase}. The continuity committee approves.',
        'A {hype} for {rematchPhrase}. The grudge department welcomes you back.',
        '{hype}. {rematchPhrase}. You\'ve read the previous chapter.',
        'A {hype} on {rematchPhrase}. The rewatch club has its new president.',
        '{hype} for {rematchPhrase}. The "but last time though" caucus assembles.',
      ],
    },
    'hype-rematch-mid': {
      soft: [
        'A {hype} on {rematchPhrase}. Curious about the do-over, not sold.',
        '{hype} for {rematchPhrase}. Reserving judgement on the second look.',
        'A {hype} on {rematchPhrase}. The first one was fine; you\'ll see.',
        '{hype} on {rematchPhrase}. Measured interest in the encore.',
      ],
      humor: [
        '{hype} on {rematchPhrase}. The continuity committee logs a maybe.',
        'A {hype} for {rematchPhrase}. The grudge department awaits more data.',
        '{hype}. {rematchPhrase}. The sequel pitch is under review.',
        'A {hype} on {rematchPhrase}. Politely interested in the do-over.',
      ],
    },
    'hype-rematch-low': {
      soft: [
        'A {hype} on {rematchPhrase}. Once was enough.',
        '{hype} for {rematchPhrase}. The first fight didn\'t sell you on a second.',
        'A {hype} on {rematchPhrase}. The unfinished business stays unfinished, for you.',
        '{hype} on {rematchPhrase}. The encore pitch did not land.',
      ],
      humor: [
        '{hype} on {rematchPhrase}. The "we already saw this" caucus signs in.',
        'A {hype} for {rematchPhrase}. The grudge department received your indifference.',
        '{hype}. {rematchPhrase}. The sequel got the bad review.',
        'A {hype} on {rematchPhrase}. The continuity committee notes the disinterest.',
      ],
    },

    // ─── RATE ─────────────────────────────────────────────────────────────
    'rate-rematch-high': {
      soft: [
        'A {rating} on {rematchPhrase}. The score is settled.',
        '{rating} for {rematchPhrase}. The unfinished business, finished.',
        'A {rating} on {rematchPhrase}. Worth the wait.',
        '{rating} on {rematchPhrase}. The second look delivered.',
        'A {rating} for {rematchPhrase}. Sequels can hit.',
      ],
      humor: [
        '{rating} on {rematchPhrase}. The continuity committee closes the case.',
        'A {rating} for {rematchPhrase}. The grudge department: paid in full.',
        '{rating}. {rematchPhrase}. The rewatch club logs a victory.',
        'A {rating} on {rematchPhrase}. The "but last time though" caucus rests.',
        '{rating} for {rematchPhrase}. The encore was worth the price of admission.',
      ],
    },
    'rate-rematch-mid': {
      soft: [
        'A {rating} on {rematchPhrase}. The score is half-settled.',
        '{rating} for {rematchPhrase}. The encore was uneven.',
        'A {rating} on {rematchPhrase}. The second look came in pieces.',
        '{rating} on {rematchPhrase}. Worth seeing, not worth replaying.',
      ],
      humor: [
        '{rating} on {rematchPhrase}. The continuity committee logs a draw.',
        'A {rating} for {rematchPhrase}. The sequel was fine. Probably.',
        '{rating}. {rematchPhrase}. The rewatch club is on the fence.',
        'A {rating} on {rematchPhrase}. The grudge gets partial closure.',
      ],
    },
    'rate-rematch-low': {
      soft: [
        'A {rating} on {rematchPhrase}. The score did not get settled.',
        '{rating} for {rematchPhrase}. The encore underwhelmed.',
        'A {rating} on {rematchPhrase}. The first one was better.',
        '{rating} on {rematchPhrase}. Some scores should stay open.',
      ],
      humor: [
        '{rating} on {rematchPhrase}. The "we already saw this" caucus is louder now.',
        'A {rating} for {rematchPhrase}. The grudge department issues a refund.',
        '{rating}. {rematchPhrase}. The sequel rating is in.',
        'A {rating} on {rematchPhrase}. The rewatch club downgrades the rewatch.',
      ],
    },
  },
};

export default copy;
