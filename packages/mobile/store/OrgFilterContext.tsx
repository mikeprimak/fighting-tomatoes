import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Available organizations for filtering
export const ORGANIZATIONS = ['UFC', 'PFL', 'ONE', 'BKFC', 'OKTAGON', 'MATCHROOM', 'TOP RANK', 'GOLDEN BOY'] as const;
export type Organization = typeof ORGANIZATIONS[number];

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
    return Array.from(selectedOrgs).some(org => {
      // Handle both space and underscore variants (e.g., "TOP RANK" matches "TOP_RANK")
      const orgWithUnderscore = org.replace(/ /g, '_');
      return eventPromotion.includes(org) || eventPromotion.includes(orgWithUnderscore);
    });
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
