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
