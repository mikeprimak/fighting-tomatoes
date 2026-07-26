/**
 * Brand kit — LOCKED, mirrors the app design tokens.
 * Source of truth: private/marketing/video-production.md §9.0
 */
export const COLORS = {
  gold: '#F5C518',   // rating numbers, key words, watermark, bars, wordmark
  bg: '#181818',     // background fill (matches the dark-only app)
  panel: '#202020',  // cards / lower-third strips
  white: '#FFFFFF',  // fighter names, body text, captions
  gray: '#9CA3AF',   // secondary text (event, vote counts, "fans")
  red: '#EF4444',    // sparingly — the "VS", danger/energy accents
} as const;

/** Restrained slant that echoes the wordmark (spec: Shear X ~= -0.08). */
export const SHEAR = 'skewX(-4.6deg)';

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/**
 * Safe zones — TikTok / Shorts / Reels UI eats the edges (spec §9.2).
 * Keep every critical number and word inside these margins.
 */
export const SAFE = {
  top: 120,     // clock / back button
  bottom: 420,  // caption + handle + "more"
  right: 140,   // like/comment/share rail
  left: 60,
} as const;

/** Timing, in frames @30fps. One easing everywhere (spec §9.6). */
export const TIMING = {
  hook: 3 * VIDEO.fps,
  tease: 4 * VIDEO.fps,
  perCard: 10 * VIDEO.fps,
  payoff: 10 * VIDEO.fps,
  cta: 5 * VIDEO.fps,
  transition: 12, // ~0.4s whoosh slide
} as const;
