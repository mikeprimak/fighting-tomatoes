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
    const parse = () => window.FB?.XFBML?.parse?.();

    const existing = document.querySelector<HTMLScriptElement>('script[data-fb-sdk]');
    if (existing) {
      parse();
      return;
    }

    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-fb-sdk', 'true');
    script.onload = parse;
    document.body.appendChild(script);
  }, []);

  return null;
}
