import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useColorScheme, Text, View, Image } from 'react-native';
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
 * Header Logo Component
 */
function HeaderLogo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('../assets/Fight-Crew-Logo-No-Background-fills-space.png')}
        style={{ width: 32, height: 32, marginRight: 8 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#F5C518' }}>
        Fight Crew
      </Text>
    </View>
  );
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
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Upcoming Events',
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
                  fontSize: 10,
                  color: isOnEventsIndex ? color : colors.tabIconDefault,
                  textAlign: 'center',
                }}
              >
                Upcoming Events
              </Text>
            );
          },
          headerShown: pathname === '/(tabs)/events' || pathname === '/events',
          headerTitle: 'Upcoming Events',
          tabBarStyle: {
            display: pathname.includes('/events/') ? 'none' : 'flex',
          },
        }}
      />
      <Tabs.Screen
        name="past-events"
        options={{
          title: 'Past Events',
          tabBarLabel: ({ color }) => (
            <Text style={{ fontSize: 10, color, textAlign: 'center' }}>
              Past Events
            </Text>
          ),
          tabBarIcon: ({ color }) => <TabBarIcon name="history" color={color} />,
          headerTitle: 'Past Events',
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Good Fights',
          tabBarLabel: ({ color }) => (
            <Text style={{ fontSize: 10, color, textAlign: 'center' }}>
              Good Fights
            </Text>
          ),
          tabBarIcon: ({ color }) => <TabBarIcon name="fire" color={color} />,
          headerTitle: 'Good Fights',
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'News',
          tabBarIcon: ({ color }) => <TabBarIcon name="newspaper-o" color={color} />,
          headerTitle: 'News',
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