'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export const ORGANIZATIONS = ['UFC', 'PFL', 'ONE', 'BKFC', 'OKTAGON', 'RIZIN', 'KARATE COMBAT', 'DIRTY BOXING', 'ZUFFA BOXING', 'TOP RANK', 'GOLDEN BOY', 'MVP', 'RAF'] as const;
export type Organization = typeof ORGANIZATIONS[number];

const ORG_GROUPS: Partial<Record<Organization, { exact?: string[]; contains?: string[]; excludes?: string[] }>> = {
  'DIRTY BOXING': { contains: ['DIRTY BOXING'] },
  'TOP RANK': { contains: ['TOP RANK', 'TOP_RANK'] },
  'GOLDEN BOY': { contains: ['GOLDEN BOY', 'GOLDEN_BOY'] },
  'ZUFFA BOXING': { contains: ['ZUFFA BOXING', 'ZUFFA_BOXING', 'ZUFFA'], excludes: ['DIRTY BOXING'] },
};

const HIDDEN_ORGS = ['MATCHROOM'];

interface OrgFilterContextType {
  selectedOrgs: Set<Organization>;
  handleOrgPress: (org: Organization | 'ALL') => void;
  isAllSelected: boolean;
  filterByPromotion: (promotion: string | undefined) => boolean;
  filterEventsByOrg: <T extends { promotion?: string }>(events: T[]) => T[];
}

const OrgFilterContext = createContext<OrgFilterContextType | undefined>(undefined);

export function OrgFilterProvider({ children }: { children: ReactNode }) {
  const [selectedOrgs, setSelectedOrgs] = useState<Set<Organization>>(new Set());

  const handleOrgPress = useCallback((org: Organization | 'ALL') => {
    if (org === 'ALL') {
      setSelectedOrgs(new Set());
    } else {
      setSelectedOrgs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(org)) {
          newSet.delete(org);
        } else {
          newSet.add(org);
        }
        return newSet;
      });
    }
  }, []);

  const isAllSelected = selectedOrgs.size === 0;

  const filterByPromotion = useCallback((promotion: string | undefined): boolean => {
    const eventPromotion = promotion?.toUpperCase() || '';
    if (HIDDEN_ORGS.some(org => eventPromotion.includes(org))) return false;
    if (selectedOrgs.size === 0) return true;

    for (const org of Array.from(selectedOrgs)) {
      const group = ORG_GROUPS[org];
      if (group) {
        if (group.excludes?.some(promo => eventPromotion.includes(promo))) continue;
        if (group.exact?.some(promo => eventPromotion === promo)) return true;
        if (group.contains?.some(promo => eventPromotion.includes(promo))) return true;
      } else {
        const orgWithUnderscore = org.replace(/ /g, '_');
        if (eventPromotion.includes(org) || eventPromotion.includes(orgWithUnderscore)) return true;
      }
    }
    return false;
  }, [selectedOrgs]);

  const filterEventsByOrg = useCallback(<T extends { promotion?: string }>(events: T[]): T[] => {
    return events.filter(event => filterByPromotion(event.promotion));
  }, [filterByPromotion]);

  return (
    <OrgFilterContext.Provider value={{ selectedOrgs, handleOrgPress, isAllSelected, filterByPromotion, filterEventsByOrg }}>
      {children}
    </OrgFilterContext.Provider>
  );
}

export function useOrgFilter() {
  const context = useContext(OrgFilterContext);
  if (!context) throw new Error('useOrgFilter must be used within OrgFilterProvider');
  return context;
}
