import posthog from 'posthog-js';
import { sendGAEvent } from '@next/third-parties/google';

/**
 * Fire a conversion/engagement event to both PostHog and GA4.
 * Safe to call from anywhere: no-ops on the server and when neither
 * analytics backend is configured.
 *
 * Canonical event names (keep these stable — GA4 key events and PostHog
 * insights are defined against them):
 *   rating_submitted     { fight_id, rating }
 *   hype_submitted       { fight_id, hype }
 *   app_download_click   { placement, platform? }
 */
export function trackEvent(name: string, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  try {
    if ((posthog as { __loaded?: boolean }).__loaded) posthog.capture(name, props);
  } catch {
    /* analytics must never break the product */
  }
  try {
    sendGAEvent('event', name, props);
  } catch {
    /* ditto */
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api';

/**
 * Like trackEvent, but survives an immediate page navigation. Use for events
 * fired by clicks on links that unload the page (download links, store links).
 *
 * Plain trackEvent loses these: gtag.js batches events for ~5s and drops the
 * unsent queue on unload (verified against prod 2026-07-17 — zero
 * app_download_click ever reached GA4). This variant sends via
 * navigator.sendBeacon, which the browser delivers after unload: PostHog
 * accepts a beacon directly; GA4 can't (the client has no API secret), so the
 * beacon goes to our backend relay which forwards to the GA4 Measurement
 * Protocol (packages/backend/src/routes/track.ts).
 *
 * The payload is a raw JSON string, NOT a JSON content type: sendBeacon may
 * only carry CORS-safelisted types — anything else needs a preflight, which
 * can't complete during unload.
 */
export function trackEventBeacon(name: string, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  try {
    if ((posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture(name, props, { transport: 'sendBeacon' });
    }
  } catch {
    /* analytics must never break the product */
  }
  try {
    const gaId = process.env.NEXT_PUBLIC_GA_ID;
    const clientId = document.cookie.match(/(?:^|;\s*)_ga=GA\d+\.\d+\.(\d+\.\d+)/)?.[1];
    if (!gaId || !clientId || typeof navigator.sendBeacon !== 'function') {
      // No GA cookie / no beacon support — fall back to the lossy path.
      sendGAEvent('event', name, props);
      return;
    }
    const sessionId = document.cookie.match(
      new RegExp(`(?:^|;\\s*)_ga_${gaId.replace(/^G-/, '')}=GS\\d+\\.\\d+\\.s?(\\d{9,11})`),
    )?.[1];
    navigator.sendBeacon(
      `${API_BASE_URL}/track/ga`,
      JSON.stringify({
        name,
        clientId,
        sessionId,
        pageLocation: window.location.href,
        params: props,
      }),
    );
  } catch {
    /* ditto */
  }
}
