import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../services/api';

// Bundled fallback list. The runtime list is hydrated from /api/promotions
// and falls back to this when offline or before the first fetch returns.
// Source of truth lives in packages/backend/src/config/promotionRegistry.ts.
export const ORGANIZATIONS = ['UFC', 'PFL', 'ONE', 'BKFC', 'OKTAGON', 'RIZIN', 'KARATE COMBAT', 'DIRTY BOXING', 'ZUFFA BOXING', 'TOP RANK', 'GOLDEN BOY', 'GOLD STAR', 'MVP', 'RAF', 'GAMEBRED'] as const;
export type Organization = string;

interface PromotionRegistryEntry {
  code: string;
  canonicalPromotion: string;
  shortLabel: string;
  fullLabel: string;
  logoKey: string;
  aliases: string[];
}

// Organization matching rules
// - exact: promotion must equal one of these exactly
// - contains: promotion must contain one of these substrings
const ORG_GROUPS: Partial<Record<Organization, { exact?: string[]; contains?: string[]; excludes?: string[] }>> = {
  'DIRTY BOXING': {
    contains: ['DIRTY BOXING'],
  },
  'TOP RANK': {
    contains: ['TOP RANK', 'TOP_RANK'],
  },
  'GOLDEN BOY': {
    contains: ['GOLDEN BOY', 'GOLDEN_BOY'],
  },
  'ZUFFA BOXING': {
    contains: ['ZUFFA BOXING', 'ZUFFA_BOXING', 'ZUFFA'],
    excludes: ['DIRTY BOXING'],
  },
};

// Organizations to completely hide from all screens
const HIDDEN_ORGS = ['MATCHROOM'];

// AsyncStorage key for persisting filter preference
const ORG_FILTER_STORAGE_KEY = 'events_org_filter';

interface OrgFilterContextType {
  selectedOrgs: Set<Organization>;
  setSelectedOrgs: React.Dispatch<React.SetStateAction<Set<Organization>>>;
  handleOrgPress: (org: Organization | 'ALL') => void;
  isAllSelected: boolean;
  filterEventsByOrg: <T extends { promotion?: string }>(events: T[]) => T[];
  filterByPromotion: (promotion: string | undefined) => boolean;
  /** Orgs to render as filter pills. Hydrated from /api/promotions, falls
   *  back to bundled ORGANIZATIONS until the fetch returns. */
  availableOrgs: readonly Organization[];
}

const OrgFilterContext = createContext<OrgFilterContextType | undefined>(undefined);

export function OrgFilterProvider({ children }: { children: ReactNode }) {
  // Organization filter state - empty set means "ALL" (show everything)
  const [selectedOrgs, setSelectedOrgs] = useState<Set<Organization>>(new Set());

  // Hydrate the available org pills from the backend registry. 24h stale
  // tolerance — the list rarely changes; on miss we fall back to bundled.
  const { data: registryData } = useQuery({
    queryKey: ['promotions-registry'],
    queryFn: async (): Promise<{ promotions: PromotionRegistryEntry[] }> => {
      const res = await fetch(`${API_BASE_URL}/promotions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
    cacheTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const availableOrgs: readonly Organization[] = registryData?.promotions
    ? registryData.promotions.map(p => p.shortLabel)
    : ORGANIZATIONS;

  // Load saved organization filter on mount
  useEffect(() => {
    const loadSavedFilter = async () => {
      try {
        const saved = await AsyncStorage.getItem(ORG_FILTER_STORAGE_KEY);
        if (saved) {
          const orgs = JSON.parse(saved) as Organization[];
          setSelectedOrgs(new Set(orgs));
        }
      } catch (error) {
        console.error('[OrgFilter] Error loading saved filter:', error);
      }
    };
    loadSavedFilter();
  }, []);

  // Save organization filter when it changes
  useEffect(() => {
    const saveFilter = async () => {
      try {
        const orgsArray = Array.from(selectedOrgs);
        await AsyncStorage.setItem(ORG_FILTER_STORAGE_KEY, JSON.stringify(orgsArray));
      } catch (error) {
        console.error('[OrgFilter] Error saving filter:', error);
      }
    };
    saveFilter();
  }, [selectedOrgs]);

  // Handler for organization filter tap
  const handleOrgPress = useCallback((org: Organization | 'ALL') => {
    if (org === 'ALL') {
      // Clear all selections to show all events
      setSelectedOrgs(new Set());
    } else {
      setSelectedOrgs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(org)) {
          // Remove if already selected
          newSet.delete(org);
        } else {
          // Add to selection
          newSet.add(org);
        }
        return newSet;
      });
    }
  }, []);

  // Check if "ALL" should be highlighted (when no specific orgs selected)
  const isAllSelected = selectedOrgs.size === 0;

  // Helper to check if a promotion matches the filter
  const filterByPromotion = useCallback((promotion: string | undefined): boolean => {
    const eventPromotion = promotion?.toUpperCase() || '';
    // Always hide events from hidden organizations
    if (HIDDEN_ORGS.some(org => eventPromotion.includes(org))) return false;
    if (selectedOrgs.size === 0) return true; // ALL selected

    // Check each selected org - return true if ANY org matches
    for (const org of Array.from(selectedOrgs)) {
      const group = ORG_GROUPS[org];
      if (group) {
        // Check excludes first - skip this org if event matches an exclusion
        if (group.excludes?.some(promo => eventPromotion.includes(promo))) continue;
        // Check exact matches
        if (group.exact?.some(promo => eventPromotion === promo)) return true;
        // Check contains matches
        if (group.contains?.some(promo => eventPromotion.includes(promo))) return true;
      } else {
        // Default: handle both space and underscore variants (e.g., "KARATE COMBAT" matches "KARATE_COMBAT")
        const orgWithUnderscore = org.replace(/ /g, '_');
        if (eventPromotion.includes(org) || eventPromotion.includes(orgWithUnderscore)) {
          return true;
        }
      }
    }
    return false;
  }, [selectedOrgs]);

  // Filter events by selected organizations (always excludes hidden orgs)
  const filterEventsByOrg = useCallback(<T extends { promotion?: string }>(events: T[]): T[] => {
    return events.filter(event => filterByPromotion(event.promotion));
  }, [filterByPromotion]);

  return (
    <OrgFilterContext.Provider
      value={{
        selectedOrgs,
        setSelectedOrgs,
        handleOrgPress,
        isAllSelected,
        filterEventsByOrg,
        filterByPromotion,
        availableOrgs,
      }}
    >
      {children}
    </OrgFilterContext.Provider>
  );
}

export function useOrgFilter() {
  const context = useContext(OrgFilterContext);
  if (context === undefined) {
    throw new Error('useOrgFilter must be used within an OrgFilterProvider');
  }
  return context;
}
