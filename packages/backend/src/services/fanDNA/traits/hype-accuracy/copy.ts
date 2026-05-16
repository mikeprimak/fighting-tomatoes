/**
 * Copy pool for hype-accuracy. Worms-tone (see docs/brand/voice.md — TBD).
 *
 * Per-key pools have soft + humor variants. Engine picks at fire time using
 * the global HUMOR_RATIO and 30-day per-line cooldown. Lines may use the
 * placeholders {hype}, {rating}, {community}, {delta}.
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
        'Hot take landed. You hyped this {hype}, the room agreed at {community}.',
        'You called it. {hype} hype, {community} community — and you were right to be loud.',
        'Outlier-correct. The {hype} hype matched a {community} room.',
        'Confident bet, paid out. {hype} vs {community} is the right kind of bold.',
        'You saw it before they did. {hype} hype, room landed at {community}.',
        "That's a hot take that earned its loudness. {hype} hype, {community} community.",
      ],
      humor: [
        '{hype}? In this economy? And then the room agreed at {community}. We salute the prophecy.',
        'You hyped a {hype} and the crowd actually showed up at {community}. The bookies are sweating.',
        'Hot take, room temperature {community}. Splendid call.',
        'You and the room walked into the same restaurant tonight. {hype} for two, please.',
        'We had you down as a contrarian and you came back with the consensus. Bewildering. Beautiful.',
        'Hype {hype}, community {community}. The committee finds you insufferably correct.',
      ],
    },
    'closure-spot-on': {
      soft: [
        'Spot on. {hype} hype, {community} community.',
        'Called it. Your {hype} sat right on top of {community}.',
        "Your {hype} and the room's {community} are practically holding hands.",
        'Neat work. {hype} hype, {community} community, delta {delta}.',
        'The room agrees with you. {hype} vs {community}.',
        'Right on the nose. {hype} hype, {community} community.',
      ],
      humor: [
        '{hype} hype, {community} community. You and the room are sharing a brain again.',
        'Delta {delta}. Suspiciously tidy work.',
        'You and the consensus, holding hands at {community}. Adorable.',
        'Hype {hype}, room {community}. The fight gods are starting to ask questions.',
        'Your {hype} hype landed on {community} like it had GPS.',
        "We checked your math. It's still right. {hype} vs {community}.",
      ],
    },
    'closure-close': {
      soft: [
        'Close call. {hype} hype, {community} community — delta {delta}.',
        'Near miss in the right direction. {hype} vs {community}.',
        'In the neighborhood. {hype} hype, room landed at {community}.',
        'Within reach. {hype} hype, {community} community, off by {delta}.',
        'Reasonable. {hype} hype, {community} room.',
        'Half a beat from a bullseye. {hype} vs {community}.',
      ],
      humor: [
        "Off by {delta}. We'll allow it.",
        '{hype} hype, {community} community — you grazed the consensus.',
        'Delta {delta}. Some would say close. Some would say tantalizingly close.',
        'You and the room are in the same zip code. {hype} vs {community}.',
        'Not quite a kiss. {hype} hype, {community} community, delta {delta}.',
        'Almost. {hype} vs {community}. The slider is rooting for you.',
      ],
    },
    'closure-off': {
      soft: [
        'Different vibe than the room. {hype} hype, {community} community, delta {delta}.',
        '{hype} hype, but the room landed at {community}.',
        'Off by {delta}. You saw something else in this one.',
        "Your read and the room's read parted ways. {hype} vs {community}.",
        '{hype} hype, {community} community. Honest disagreement.',
        'Slight divergence. {hype} vs {community}.',
      ],
      humor: [
        'Delta {delta}. You and the room watched different fights.',
        '{hype} hype, {community} community. Someone has explaining to do.',
        "Off by {delta}. We won't say who's wrong. (Probably the room.)",
        'You saw {hype}, the room saw {community}. One of you is having a different night.',
        'Delta {delta}. The consensus is, politely, somewhere else.',
        'Mild divergence. {hype} vs {community}. We respect the independence.',
      ],
    },
    'closure-way-off': {
      soft: [
        'Big gap. {hype} hype, {community} community — delta {delta}.',
        'Wide swing. You hyped {hype}, room landed at {community}.',
        '{hype} hype, {community} community. The room and you are not talking right now.',
        "Off by {delta}. That's a different fight you watched.",
        'Substantial disagreement. {hype} vs {community}.',
        '{hype} hype against {community} community — that\'s a story.',
      ],
      humor: [
        'Delta {delta}. You and the room are not currently on speaking terms.',
        '{hype} hype, {community} community. Bold of you. Possibly correct.',
        'Off by {delta}. We respect a strong position, no matter how lonely.',
        'You saw {hype}, the room saw {community}. History will sort it out.',
        "Delta {delta}. Either you're early, or you're you.",
        "{hype} vs {community}. We're not saying who's wrong. We're saying it's interesting.",
      ],
    },
  },
};

export default copy;
