import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

/**
 * Tab Bar Icon Component
 */
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

/**
 * Tab Configuration Interface
 */
interface TabConfig {
  name: string;
  title: string;
  iconName: React.ComponentProps<typeof FontAwesome>['name'];
  headerTitle?: string;
}

/**
 * Tab Bar Props Interface
 */
interface TabBarProps {
  tabs: TabConfig[];
  defaultHeaderTitle?: string;
}

/**
 * Reusable Tab Bar Component
 *
 * Usage:
 * ```tsx
 * const tabs = [
 *   { name: 'index', title: 'Events', iconName: 'calendar', headerTitle: '🍅 Fighting Tomatoes' },
 *   { name: 'fights', title: 'Fights', iconName: 'star' },
 *   { name: 'profile', title: 'Profile', iconName: 'user' }
 * ];
 *
 * <TabBar tabs={tabs} defaultHeaderTitle="Fighting Tomatoes" />
 * ```
 */
export default function TabBar({ tabs, defaultHeaderTitle, children }: TabBarProps & { children?: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <TabBarIcon name={tab.iconName} color={color} />,
            headerTitle: tab.headerTitle || defaultHeaderTitle || tab.title,
          }}
        />
      ))}
      {children}
    </Tabs>
  );
}

/**
 * Pre-configured FightCrewApp Tab Bar
 */
export function FightCrewAppTabBar() {
  const tabs: TabConfig[] = [
    {
      name: 'index',
      title: 'Crews',
      iconName: 'comments',
      headerTitle: '🥊 FightCrewApp'
    },
    {
      name: 'events',
      title: 'Events',
      iconName: 'calendar',
      headerTitle: 'Events'
    },
    {
      name: 'fights',
      title: 'Fights',
      iconName: 'star'
    },
    {
      name: 'fighters',
      title: 'Fighters',
      iconName: 'users'
    },
    {
      name: 'profile',
      title: 'Profile',
      iconName: 'user'
    }
  ];

  return <TabBar tabs={tabs} defaultHeaderTitle="FightCrewApp" />;
}

/**
 * Export types for external use
 */
export type { TabConfig, TabBarProps };