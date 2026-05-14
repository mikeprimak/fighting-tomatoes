'use client';

import { useOrgFilter } from '@/lib/orgFilter';

export function OrgFilterTabs() {
  const { selectedOrgs, handleOrgPress, isAllSelected, availableOrgs } = useOrgFilter();

  return (
    <div className="flex flex-wrap gap-1.5 pb-2">
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
      {availableOrgs.map(org => (
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
