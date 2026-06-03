'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    twttr?: { widgets?: { load?: (el?: HTMLElement) => void } };
  }
}

/**
 * Upgrades any `<blockquote class="twitter-tweet">` in the post body into a
 * rendered X/Twitter embed. The post HTML is injected via dangerouslySetInnerHTML,
 * so a <script> pasted into the markdown would never execute — we load X's
 * widgets.js here instead and call twttr.widgets.load() once it's ready (and on
 * client-side navigation between posts).
 *
 * To embed a tweet in a post, paste this into the markdown where you want it:
 *   <blockquote class="twitter-tweet" data-dnt="true"><a href="TWEET_URL"></a></blockquote>
 */
export function TweetEmbeds() {
  useEffect(() => {
    const SRC = 'https://platform.twitter.com/widgets.js';

    const load = () => window.twttr?.widgets?.load?.();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      load();
      return;
    }

    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.charset = 'utf-8';
    script.onload = load;
    document.body.appendChild(script);
  }, []);

  return null;
}
