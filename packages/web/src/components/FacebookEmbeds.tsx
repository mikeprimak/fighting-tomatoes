'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    FB?: { XFBML?: { parse?: (el?: HTMLElement) => void } };
  }
}

/**
 * Upgrades any `<div class="fb-post">` in the post body into a rendered
 * Facebook embed. Authors paste a post div into the markdown:
 *
 *   <div class="fb-post" data-href="https://www.facebook.com/photo.php?fbid=...&set=...&type=3" data-show-text="false"></div>
 *
 * We load Facebook's SDK here and let it (re)parse XFBML. Using the SDK rather
 * than a raw plugins/post.php <iframe> matters because the SDK sizes each embed
 * to its actual content height, so there's no large empty gap below short
 * image posts (a fixed-height iframe leaves blank space when show_text is off).
 * No-op when a post has no Facebook embeds.
 */
export function FacebookEmbeds() {
  useEffect(() => {
    if (!document.querySelector('.fb-post')) return;

    // The SDK requires an #fb-root element on the page.
    if (!document.getElementById('fb-root')) {
      const root = document.createElement('div');
      root.id = 'fb-root';
      document.body.prepend(root);
    }

    const SRC = 'https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v21.0';

    // The post plugin renders at a fixed data-width (default 500), which
    // overflows narrow phones. Size each embed to its column width (FB clamps
    // to a 350px minimum; the CSS max-width rule absorbs the few px of excess
    // on the smallest screens) before letting the SDK render it.
    const sizeAndParse = () => {
      document.querySelectorAll<HTMLElement>('.fb-post').forEach((el) => {
        const w = el.parentElement?.offsetWidth || 500;
        el.setAttribute('data-width', String(Math.round(Math.max(350, Math.min(w, 500)))));
      });
      window.FB?.XFBML?.parse?.();
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-fb-sdk]');
    if (existing) {
      sizeAndParse();
      return;
    }

    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-fb-sdk', 'true');
    script.onload = sizeAndParse;
    document.body.appendChild(script);
  }, []);

  return null;
}
