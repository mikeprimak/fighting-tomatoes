import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useColorScheme, Text, View, Image } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';

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
 * Header Logo Component - Boxing glove icon to the left of the title
 */
function HeaderLogo({ title }: { title: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('../assets/logo-hand-down-thicker.png')}
        style={{ width: 48, height: 48, marginRight: 14 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>
        {title}
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
  const { user } = useAuth();

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
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6
              name="fire-flame-curved"
              size={24}
              style={{ marginBottom: -3 }}
              color={color}
            />
          ),
          tabBarLabel: ({ color }) => (
            <Text
              style={{
                fontSize: 10,
                color,
                textAlign: 'center',
              }}
            >
              Upcoming
            </Text>
          ),
          headerTitle: () => <HeaderLogo title="Upcoming Events" />,
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
          tabBarIcon: ({ color }) => <FontAwesome name="star" size={24} style={{ marginBottom: -3 }} color={color} />,
          headerTitle: () => <HeaderLogo title="Past Events" />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Good Fights',
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <Image
              source={
                focused
                  ? require('../assets/GOOD-FIGHTS-WORD-LOGO-SQUARE-FULL-YELLOW-SIZED.png')
                  : require('../assets/GOOD-FIGHTS-WORD-LOGO-SQUARE-FULL-GREY-SIZED.png')
              }
              style={{ width: 84, height: 36, marginTop: 14 }}
              resizeMode="contain"
            />
          ),
          headerTitle: () => <HeaderLogo title="Good Fights" />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'News',
          tabBarIcon: ({ color }) => <TabBarIcon name="newspaper-o" color={color} />,
          headerTitle: () => <HeaderLogo title="News" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          headerTitle: () => <HeaderLogo title={user?.displayName || 'Profile'} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Export types for external use
 */
export type { TabConfig, TabBarProps };