'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * The clickable shell shared by the fight cards. A real <a> to the fight's
 * deep page so crawlers get an internal-link graph to /fights/<slug> (the
 * pages were sitemap-only orphans — see programmatic-SEO plan, step 6) and
 * middle/modifier clicks open the fight page natively. A plain click keeps
 * the existing in-place rate/hype modal UX.
 */
export function FightCardLink({
  fight,
  onOpen,
  children,
}: {
  fight: { id: string; slug?: string | null };
  onOpen: () => void;
  children: ReactNode;
}) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  };

  return (
    <a
      href={`/fights/${fight.slug || fight.id}`}
      onClick={handleClick}
      className="block w-full text-left"
    >
      {children}
    </a>
  );
}
