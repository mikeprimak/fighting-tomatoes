import Link from 'next/link';

export interface ExploreLink {
  href: string;
  label: string;
}

/**
 * Server-rendered internal-link strip (Own The SERPs internal-linking pass,
 * 2026-07-17). Rendered from server components so every link is in the initial
 * HTML — this is crawl-graph plumbing (fight → fighters → division → best-of →
 * event → hubs), not navigation chrome, which is why it lives on the SEO
 * templates and not in the client components.
 */
export function ExploreLinks({ links, className = '' }: { links: ExploreLink[]; className?: string }) {
  const seen = new Set<string>();
  const deduped = links.filter((l) => {
    if (!l.href || !l.label || seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
  if (deduped.length === 0) return null;
  return (
    <nav aria-label="Explore" className={`text-sm text-text-secondary ${className}`}>
      <ul className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        {deduped.map((l, i) => (
          <li key={l.href} className="flex items-center gap-x-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            <Link href={l.href} className="underline-offset-2 hover:text-foreground hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
