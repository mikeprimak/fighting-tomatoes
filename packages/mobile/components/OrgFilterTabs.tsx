import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useOrgFilter, ORGANIZATIONS, Organization } from '../store/OrgFilterContext';

interface OrgFilterTabsProps {
  onFilterChange?: () => void;
}

export default function OrgFilterTabs({ onFilterChange }: OrgFilterTabsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { selectedOrgs, handleOrgPress, isAllSelected } = useOrgFilter();

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
        {ORGANIZATIONS.map(org => {
          const isSelected = isAllSelected || selectedOrgs.has(org);
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
