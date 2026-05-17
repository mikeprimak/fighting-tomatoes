/**
 * Copy pool for hype-accuracy. Worms-tone (see docs/brand/voice.md — TBD).
 *
 * Per-key pools have soft + humor variants. Engine picks at fire time using
 * the global HUMOR_RATIO and 30-day per-line cooldown. Lines may use the
 * placeholders {hype}, {rating}, {community}, {delta}.
 *
 * IMPORTANT — closure framing:
 *   This is the CLOSURE-LOOP trait. {hype} is the user's pre-fight hype from
 *   weeks ago; {community} is what the room ended up rating the fight;
 *   {rating} is the rating the user JUST submitted. Every line MUST make the
 *   closure context explicit — never a bare "{hype} vs {community}" because
 *   the user reads it as "my just-given rating vs the room" and gets confused
 *   when the numbers don't match what they just tapped.
 *
 * Promotion path for new lines: write soft + humor variants here, ship, review
 * impression telemetry, prune underperformers. Best LLM-generated lines (Layer
 * 2, Phase 2) get promoted up into these pools after manual review.
 */
import type { CopyVariants } from '../../types';

const copy: CopyVariants = {
  lines: {
    'closure-hot-take': {
      soft: [
        'Hot take landed. You hyped this {hype} pre-fight; the room rated it {community}.',
        'You called it. Hyped {hype}, room rated {community} — you were right to be loud.',
        'Outlier-correct. Your {hype} hype matched a {community} room.',
        'Confident pre-fight bet, paid out. Your {hype} hype, room\'s {community} rating.',
        'You saw it before they did. Hyped {hype}, room landed at {community}.',
        'A hot take that earned its loudness. Hyped {hype}, room said {community}.',
      ],
      humor: [
        'You hyped this a {hype}? In this economy? And the room came in at {community}. We salute the prophecy.',
        'Pre-fight hype of {hype} and the crowd actually showed up at {community}. The bookies are sweating.',
        'Hot take, room temperature {community}. Splendid call.',
        'Pre-fight, you saw {hype}. Post-fight, room said {community}. Bewildering. Beautiful.',
        'Your pre-fight {hype} hype, the room\'s {community} verdict. The committee finds you insufferably correct.',
        'You hyped {hype}. Room rated {community}. The fight gods are taking notes.',
      ],
    },
    'closure-spot-on': {
      soft: [
        'Spot on. You hyped {hype}, room rated {community}.',
        'Pre-fight call: {hype}. Room\'s verdict: {community}. Nailed it.',
        'Your {hype} hype sat right on top of the room\'s {community} rating.',
        'Neat work. Hyped {hype}, room said {community} (delta {delta}).',
        'The room agreed with your hype. You said {hype}, they said {community}.',
        'Right on the nose. {hype} hype, {community} verdict.',
      ],
      humor: [
        'Your {hype} hype and the room\'s {community} rating are sharing a brain again.',
        'Delta {delta} between your pre-fight read and the room. Suspiciously tidy work.',
        'You and the consensus, holding hands at {community}. Your {hype} hype called it.',
        'Hyped {hype}, room landed at {community}. The fight gods are starting to ask questions.',
        'Your {hype} hype landed on the room\'s {community} like it had GPS.',
        'We checked your math. Pre-fight hype {hype}, room rating {community}. Still right.',
      ],
    },
    'closure-close': {
      soft: [
        'Close call on the closure. You hyped {hype}, room rated {community} — off by {delta}.',
        'Near miss in the right direction. Hyped {hype}, room said {community}.',
        'In the neighborhood. Your {hype} hype, room\'s {community} rating.',
        'Within reach. Hyped {hype}, room landed at {community}, off by {delta}.',
        'Reasonable closure. {hype} hype, {community} room rating.',
        'Half a beat from a bullseye. Hyped {hype}, room rated {community}.',
      ],
      humor: [
        'Your pre-fight {hype} was off the room\'s {community} by {delta}. We\'ll allow it.',
        'Hyped {hype}, room rated {community} — you grazed the consensus.',
        'Delta {delta} between your hype and the room\'s rating. Tantalizingly close.',
        'Your pre-fight {hype} and the room\'s {community} verdict are in the same zip code.',
        'Not quite a kiss. {hype} hype, {community} room rating, delta {delta}.',
        'Almost. Hyped {hype}, room said {community}. The slider is rooting for you.',
      ],
    },
    'closure-off': {
      soft: [
        'Different vibe than the room. You hyped {hype}, room rated {community} — delta {delta}.',
        'You hyped {hype}, but the room landed at {community}.',
        'Off by {delta}. Your pre-fight read of {hype} saw something else in this one.',
        'Your hype and the room\'s rating parted ways. Hyped {hype}, room said {community}.',
        '{hype} hype, {community} room verdict. Honest disagreement.',
        'Slight divergence. Pre-fight {hype}, post-fight room {community}.',
      ],
      humor: [
        'Delta {delta}. You and the room watched different fights — you hyped {hype}, they rated {community}.',
        'Hyped {hype}, room rated {community}. Someone has explaining to do.',
        'Off by {delta} between your hype and the room. We won\'t say who\'s wrong. (Probably the room.)',
        'You hyped {hype}, the room rated {community}. One of you was having a different night.',
        'Delta {delta} between your pre-fight read and the room. The consensus is, politely, somewhere else.',
        'Mild divergence. Hyped {hype}, room said {community}. We respect the independence.',
      ],
    },
    'closure-way-off': {
      soft: [
        'Big gap on the closure. You hyped {hype}, room rated {community} — delta {delta}.',
        'Wide swing. You hyped {hype} pre-fight, the room landed at {community}.',
        'Your {hype} hype and the room\'s {community} rating are not talking right now.',
        'Off by {delta}. That\'s a different fight you hyped vs what the room rated.',
        'Substantial disagreement. Hyped {hype}, room said {community}.',
        'Hyped {hype}, room rated {community} — that\'s a story.',
      ],
      humor: [
        'Delta {delta}. Your {hype} hype and the room\'s {community} rating are not currently on speaking terms.',
        'You hyped {hype}, room rated {community}. Bold of you. Possibly correct.',
        'Off by {delta} between your hype and the room. We respect a strong position, no matter how lonely.',
        'You hyped {hype}, the room rated {community}. History will sort it out.',
        'Delta {delta} between your pre-fight call and the room. Either you\'re early, or you\'re you.',
        'Hyped {hype}, room said {community}. We\'re not saying who\'s wrong. We\'re saying it\'s interesting.',
      ],
    },
  },
};

export default copy;
