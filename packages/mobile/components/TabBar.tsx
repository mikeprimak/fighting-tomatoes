import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useColorScheme, Text } from 'react-native';
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
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const pathname = usePathname();

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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Crews',
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
          headerTitle: 'Fight Crew',
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, focused }) => {
            // Only show as focused if on the events index page
            const isOnEventsIndex = pathname === '/(tabs)/events' || pathname === '/events';
            const iconColor = isOnEventsIndex ? color : colors.tabIconDefault;
            return <TabBarIcon name="calendar" color={iconColor} />;
          },
          tabBarLabel: ({ color, focused }) => {
            // Only show as focused if on the events index page
            const isOnEventsIndex = pathname === '/(tabs)/events' || pathname === '/events';
            return (
              <Text
                style={{
                  fontSize: 12,
                  color: isOnEventsIndex ? color : colors.tabIconDefault,
                }}
              >
                Events
              </Text>
            );
          },
          headerShown: pathname === '/(tabs)/events' || pathname === '/events',
          headerTitle: 'Events',
          tabBarStyle: {
            display: pathname.includes('/events/') ? 'none' : 'flex',
          },
        }}
        listeners={{
          tabPress: (e) => {
            // If already in events tab (anywhere in the stack), navigate to index
            if (pathname.startsWith('/(tabs)/events')) {
              e.preventDefault();
              router.push('/(tabs)/events');
            }
          },
        }}
      />
      <Tabs.Screen
        name="fights"
        options={{
          title: 'Fights',
          tabBarIcon: ({ color }) => <TabBarIcon name="star" color={color} />,
          headerTitle: 'Fights',
        }}
      />
      <Tabs.Screen
        name="fighters"
        options={{
          title: 'Fighters',
          tabBarIcon: ({ color, focused }) => {
            // Only show as focused if on the fighters index page
            const isOnFightersIndex = pathname === '/(tabs)/fighters' || pathname === '/fighters';
            const iconColor = isOnFightersIndex ? color : colors.tabIconDefault;
            return <TabBarIcon name="users" color={iconColor} />;
          },
          tabBarLabel: ({ color, focused }) => {
            // Only show as focused if on the fighters index page
            const isOnFightersIndex = pathname === '/(tabs)/fighters' || pathname === '/fighters';
            return (
              <Text
                style={{
                  fontSize: 12,
                  color: isOnFightersIndex ? color : colors.tabIconDefault,
                }}
              >
                Fighters
              </Text>
            );
          },
          headerShown: true,
          headerTitle: 'Fighters',
        }}
        listeners={{
          tabPress: (e) => {
            // If already in fighters tab (anywhere in the stack), navigate to index
            if (pathname.startsWith('/(tabs)/fighters')) {
              e.preventDefault();
              router.push('/(tabs)/fighters');
            }
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          headerTitle: 'Profile',
        }}
      />
    </Tabs>
  );
}

/**
 * Export types for external use
 */
export type { TabConfig, TabBarProps };