import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Available organizations for filtering
export const ORGANIZATIONS = ['UFC', 'PFL', 'ONE', 'BKFC', 'OKTAGON', 'RIZIN', 'KARATE COMBAT', 'DIRTY BOXING', 'ZUFFA BOXING', 'MATCHROOM', 'TOP RANK', 'GOLDEN BOY'] as const;
export type Organization = typeof ORGANIZATIONS[number];

// Organization matching rules
// - exact: promotion must equal one of these exactly
// - contains: promotion must contain one of these substrings
const ORG_GROUPS: Partial<Record<Organization, { exact?: string[]; contains?: string[]; excludes?: string[] }>> = {
  'DIRTY BOXING': {
    contains: ['DIRTY BOXING'],
  },
  'MATCHROOM': {
    contains: ['MATCHROOM'],
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

// AsyncStorage key for persisting filter preference
const ORG_FILTER_STORAGE_KEY = 'events_org_filter';

interface OrgFilterContextType {
  selectedOrgs: Set<Organization>;
  setSelectedOrgs: React.Dispatch<React.SetStateAction<Set<Organization>>>;
  handleOrgPress: (org: Organization | 'ALL') => void;
  isAllSelected: boolean;
  filterEventsByOrg: <T extends { promotion?: string }>(events: T[]) => T[];
  filterByPromotion: (promotion: string | undefined) => boolean;
}

const OrgFilterContext = createContext<OrgFilterContextType | undefined>(undefined);

export function OrgFilterProvider({ children }: { children: ReactNode }) {
  // Organization filter state - empty set means "ALL" (show everything)
  const [selectedOrgs, setSelectedOrgs] = useState<Set<Organization>>(new Set());

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
    if (selectedOrgs.size === 0) return true; // ALL selected
    const eventPromotion = promotion?.toUpperCase() || '';

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

  // Filter events by selected organizations
  const filterEventsByOrg = useCallback(<T extends { promotion?: string }>(events: T[]): T[] => {
    if (selectedOrgs.size === 0) return events; // ALL selected
    return events.filter(event => filterByPromotion(event.promotion));
  }, [selectedOrgs, filterByPromotion]);

  return (
    <OrgFilterContext.Provider
      value={{
        selectedOrgs,
        setSelectedOrgs,
        handleOrgPress,
        isAllSelected,
        filterEventsByOrg,
        filterByPromotion,
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
