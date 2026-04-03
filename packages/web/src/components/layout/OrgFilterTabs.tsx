'use client';

import { useOrgFilter, ORGANIZATIONS, type Organization } from '@/lib/orgFilter';

export function OrgFilterTabs() {
  const { selectedOrgs, handleOrgPress, isAllSelected } = useOrgFilter();

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
      <button
        onClick={() => handleOrgPress('ALL')}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          isAllSelected
            ? 'bg-primary text-text-on-accent'
            : 'bg-card text-text-secondary hover:text-foreground'
        }`}
      >
        ALL
      </button>
      {ORGANIZATIONS.map(org => (
        <button
          key={org}
          onClick={() => handleOrgPress(org)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedOrgs.has(org)
              ? 'bg-primary text-text-on-accent'
              : 'bg-card text-text-secondary hover:text-foreground'
          }`}
        >
          {org}
        </button>
      ))}
    </div>
  );
}
