import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../constants/Colors';
import { useOrgFilter, Organization } from '../store/OrgFilterContext';

interface OrgFilterTabsProps {
  onFilterChange?: () => void;
}

export default function OrgFilterTabs({ onFilterChange }: OrgFilterTabsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { selectedOrgs, handleOrgPress, isAllSelected, availableOrgs, orgTouchOrder } = useOrgFilter();

  // Frozen display order. We re-sort only on screen focus (not on every tap)
  // so pills don't jump under the user's finger mid-interaction. Selected
  // orgs float to the front; within each group, most-recently-toggled first;
  // untouched orgs keep registry order.
  const [orderedOrgs, setOrderedOrgs] = useState<readonly Organization[]>(availableOrgs);

  // Live values read at focus time without making them sort deps (deps would
  // re-run the effect on every toggle, defeating focus-only re-sorting).
  const selectedOrgsRef = useRef(selectedOrgs);
  selectedOrgsRef.current = selectedOrgs;
  const orgTouchOrderRef = useRef(orgTouchOrder);
  orgTouchOrderRef.current = orgTouchOrder;

  useFocusEffect(
    useCallback(() => {
      const selected = selectedOrgsRef.current;
      const touchOrder = orgTouchOrderRef.current;
      const touchIndex = (o: Organization) => {
        const i = touchOrder.indexOf(o);
        return i === -1 ? Number.POSITIVE_INFINITY : i;
      };
      const registryIndex = new Map(availableOrgs.map((o, i) => [o, i]));
      const next = [...availableOrgs].sort((a, b) => {
        const aSel = selected.has(a) ? 0 : 1;
        const bSel = selected.has(b) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel; // selected block first
        const aTouch = touchIndex(a);
        const bTouch = touchIndex(b);
        if (aTouch !== bTouch) return aTouch - bTouch; // recent toggles first
        return (registryIndex.get(a) ?? 0) - (registryIndex.get(b) ?? 0); // stable fallback
      });
      setOrderedOrgs(next);
      // availableOrgs in deps re-sorts once the registry hydrates; selection
      // and touch order are read via refs so taps don't trigger a live re-sort.
    }, [availableOrgs]),
  );

  const styles = createStyles(colors);

  const handlePress = (org: Organization | 'ALL') => {
    handleOrgPress(org);
    onFilterChange?.();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
      >
        {/* ALL Tab */}
        <TouchableOpacity
          style={[styles.tab, isAllSelected && styles.tabActive]}
          onPress={() => handlePress('ALL')}
        >
          <Text style={[styles.tabText, isAllSelected && styles.tabTextActive]}>
            ALL
          </Text>
        </TouchableOpacity>

        {/* Organization Tabs */}
        {orderedOrgs.map(org => {
          const isSelected = selectedOrgs.has(org);
          return (
            <TouchableOpacity
              key={org}
              style={[styles.tab, isSelected && styles.tabActive]}
              onPress={() => handlePress(org)}
            >
              <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                {org}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* Fade gradient to indicate more content */}
      <LinearGradient
        colors={['transparent', colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeGradient}
        pointerEvents="none"
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
  },
  tabsContent: {
    flexDirection: 'row',
    paddingLeft: 16,
    paddingRight: 36,
    paddingVertical: 10,
    gap: 8,
  },
  fadeGradient: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#000000',
  },
});
