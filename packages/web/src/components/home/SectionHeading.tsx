'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared heading for the web home sections: an optional icon, the section title,
 * an optional subtitle (e.g. the date under a per-day events heading), and an
 * optional "see all" link on the right. Keeps every band visually aligned.
 */
export function SectionHeading({
  title,
  subtitle,
  icon: Icon,
  href,
  linkLabel = 'See all',
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={18} className="shrink-0 text-primary" />}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-text-secondary transition-colors hover:text-primary"
        >
          {linkLabel}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}
