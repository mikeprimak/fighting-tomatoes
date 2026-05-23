'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from './api';

// localStorage key — mirrors the mobile app's AsyncStorage key so terminology
// stays consistent across platforms.
const ORG_FILTER_STORAGE_KEY = 'events_org_filter';

// Bundled fallback list. The runtime list is hydrated from /api/promotions
// and falls back to this when offline or before the first fetch returns.
// Source of truth lives in packages/backend/src/config/promotionRegistry.ts.
export const ORGANIZATIONS = ['UFC', 'MVP', 'PFL', 'ONE', 'BKFC', 'OKTAGON', 'RIZIN', 'KARATE COMBAT', 'DIRTY BOXING', 'ZUFFA BOXING', 'TOP RANK', 'GOLDEN BOY', 'GOLD STAR', 'RAF', 'GAMEBRED'] as const;
export type Organization = string;

interface PromotionRegistryEntry {
  code: string;
  canonicalPromotion: string;
  shortLabel: string;
  fullLabel: string;
  logoKey: string;
  aliases: string[];
}

const ORG_GROUPS: Record<string, { exact?: string[]; contains?: string[]; excludes?: string[] }> = {
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
  /** Orgs to render as filter pills. Hydrated from /api/promotions, falls
   *  back to bundled ORGANIZATIONS until the fetch returns. */
  availableOrgs: readonly Organization[];
}

const OrgFilterContext = createContext<OrgFilterContextType | undefined>(undefined);

export function OrgFilterProvider({ children }: { children: ReactNode }) {
  const [selectedOrgs, setSelectedOrgs] = useState<Set<Organization>>(new Set());
  // Skip saving on the first render — initial state is always empty, and we
  // don't want to overwrite a persisted selection before the load effect runs.
  const [hydrated, setHydrated] = useState(false);

  // Load saved selection from localStorage on mount (client-only). First-time
  // visitors and fresh accounts default to UFC only — "All" is overwhelming
  // when most of the value (and most installs) come from UFC fans.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ORG_FILTER_STORAGE_KEY);
      if (saved) {
        const orgs = JSON.parse(saved) as Organization[];
        if (Array.isArray(orgs)) {
          setSelectedOrgs(new Set(orgs));
        }
      } else {
        setSelectedOrgs(new Set(['UFC']));
      }
    } catch (err) {
      console.error('[OrgFilter] Error loading saved filter:', err);
    }
    setHydrated(true);
  }, []);

  // Persist when the selection changes (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        ORG_FILTER_STORAGE_KEY,
        JSON.stringify(Array.from(selectedOrgs)),
      );
    } catch (err) {
      console.error('[OrgFilter] Error saving filter:', err);
    }
  }, [selectedOrgs, hydrated]);

  const { data: registryData } = useQuery({
    queryKey: ['promotions-registry'],
    queryFn: async (): Promise<{ promotions: PromotionRegistryEntry[] }> => {
      const res = await fetch(`${API_BASE_URL}/promotions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const availableOrgs: readonly Organization[] = registryData?.promotions
    ? registryData.promotions.map(p => p.shortLabel)
    : ORGANIZATIONS;

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
    <OrgFilterContext.Provider value={{ selectedOrgs, handleOrgPress, isAllSelected, filterByPromotion, filterEventsByOrg, availableOrgs }}>
      {children}
    </OrgFilterContext.Provider>
  );
}

export function useOrgFilter() {
  const context = useContext(OrgFilterContext);
  if (!context) throw new Error('useOrgFilter must be used within OrgFilterProvider');
  return context;
}
