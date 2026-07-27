/**
 * Alert when the residential proxy stops answering.
 *
 * On 2026-07-26 the DataImpulse balance hit zero mid-card. Zuffa Boxing 9 went
 * LIVE, Tapology showed the opening three bouts finished, and the app showed all
 * eight upcoming — for hours. Nothing surfaced it: systemd stayed `active`, the
 * event stayed LIVE, and the only evidence was consecutive scrape errors in the
 * journal. The failure is invisible exactly when it matters most.
 *
 * The proxy returns `407 TRAFFIC_EXHAUSTED` on the CONNECT, which Chrome
 * surfaces as ERR_PROXY_AUTH_UNSUPPORTED (it can't render a 407 body), so that
 * string — not a balance API — is the reliable signal.
 *
 * Delivery reuses the endpoint the GitHub scraper workflows already call. Email
 * can't be sent from here: EmailService needs SMTP credentials that live on
 * Render, and this process runs on the VPS with a minimal env.
 */

// Chrome's rendering of a proxy 407, plus the tunnel-level failures a dead or
// unfunded proxy also produces.
const PROXY_DEAD_RE = /ERR_PROXY_AUTH_UNSUPPORTED|ERR_TUNNEL_CONNECTION_FAILED|TRAFFIC_EXHAUSTED|Proxy Authentication Required|\b407\b/i;

const ALERT_BASE_URL =
  process.env.ALERT_API_BASE_URL || 'https://fightcrewapp-backend.onrender.com';
// Same shared key the *-scraper.yml workflows use for their failure alerts.
const ALERT_KEY = process.env.SCRAPER_ALERT_KEY || 'fightcrew-test-2026';

// One alert per incident, not one per poll. A dead proxy fails every 150s and an
// 8-hour card would otherwise send ~190 identical emails.
const ALERT_COOLDOWN_MS = Number(process.env.PROXY_ALERT_COOLDOWN_MS || 60 * 60 * 1000);

let lastAlertAt = 0;

export function isProxyDeadError(message: string | undefined | null): boolean {
  if (!message) return false;
  return PROXY_DEAD_RE.test(message);
}

/**
 * Fire a proxy-down alert, at most once per cooldown window. Never throws and
 * never rejects — this runs inside a scraper's catch block and must not be able
 * to turn a recoverable scrape failure into an unhandled rejection.
 */
export async function alertProxyDown(context: string, errorMessage: string): Promise<void> {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;

  const detail =
    `Tapology proxy is not answering (${context}). Live tracking is DOWN and will stay ` +
    `down silently until this is fixed. Most likely the DataImpulse balance is exhausted ` +
    `- verify with: curl -sv -x "$TAPOLOGY_PROXY" https://api.ipify.org (look for ` +
    `"407 TRAFFIC_EXHAUSTED"). Underlying error: ${errorMessage}`;

  const url =
    `${ALERT_BASE_URL}/api/admin/test-alert?key=${encodeURIComponent(ALERT_KEY)}` +
    `&type=scraper&org=${encodeURIComponent('TAPOLOGY-PROXY')}&error=${encodeURIComponent(detail)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.error(
      `[PROXY-ALERT] proxy-down alert sent (${context}) - HTTP ${res.status}`
    );
  } catch (e: any) {
    // Deliberately swallowed: if the alert can't go out we still want the
    // scraper's own retry/backoff to proceed, and the journal line below is the
    // fallback record.
    console.error(`[PROXY-ALERT] FAILED to send proxy-down alert (${context}): ${e?.message}`);
  }
}

/** Reset the cooldown once a scrape succeeds, so the next outage alerts immediately. */
export function noteProxyHealthy(): void {
  lastAlertAt = 0;
}
