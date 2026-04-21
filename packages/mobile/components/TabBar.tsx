import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useColorScheme, Text, View, Image, TouchableOpacity, Platform } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import { useHasLiveEvent } from '../hooks/useHasLiveEvent';
import { useSearch } from '../store/SearchContext';

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
        source={require('../assets/app-icon-internal.png')}
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
 * @param skipHeaderSafeArea - When true, removes top safe area from header (used when banner is above)
 */
export function FightCrewAppTabBar({ skipHeaderSafeArea }: { skipHeaderSafeArea?: boolean }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const hasLiveEvent = useHasLiveEvent();
  const { toggleSearch, isSearchVisible } = useSearch();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F5C518',
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 65 : 85,  // iOS: smaller (physical home button), Android: larger (gesture bar)
          paddingBottom: Platform.OS === 'ios' ? 5 : 15,  // Less padding on iOS
          paddingTop: Platform.OS === 'ios' ? 0 : 10,  // Extra top padding on Android
        },
        tabBarItemStyle: {
          justifyContent: 'center',
        },
        tabBarIconStyle: {
          marginTop: Platform.OS === 'ios' ? 3 : 0,
        },
        tabBarLabelStyle: {
          marginBottom: 5,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleAlign: 'left',  // Force left alignment on iOS (matches Android)
        headerTitleContainerStyle: {
          // Ensure title container takes full width and aligns left on iOS
          flex: 1,
          justifyContent: 'flex-start',
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
        // When banner is visible above, skip top safe area (banner already handles it)
        ...(skipHeaderSafeArea && { headerStatusBarHeight: 0 }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null, // Hide from tab bar
          headerShown: false, // Redirect-only route; avoid flashing "index" header before redirect
          title: '', // Safety net — if the header ever does render, don't fall back to the route name "index"
          headerTitle: '',
          tabBarStyle: { display: 'none' }, // Hide tab bar on the blank redirect screen so nothing chrome flashes
        }}
      />
      <Tabs.Screen
        name="live-events"
        options={{
          href: '/(tabs)/live-events', // Always show live events tab
          title: 'Live Events',
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome
              name="podcast"
              size={24}
              style={{ marginBottom: -3 }}
              color={focused ? colors.primary : color}
            />
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={{ fontSize: 10, color: focused ? colors.primary : colors.tabIconDefault, textAlign: 'center' }}>
              Live Events
            </Text>
          ),
          tabBarActiveTintColor: colors.primary,
          headerTitle: () => <HeaderLogo title="Live Events" />,
          headerRight: () => (
            <TouchableOpacity
              onPress={toggleSearch}
              style={{ marginRight: 16, padding: 8, marginTop: -16 }}
            >
              <FontAwesome
                name="search"
                size={20}
                color={isSearchVisible ? colors.tint : colors.text}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Upcoming Events',
          tabBarIcon: ({ color }) => (
            <FontAwesome6
              name="fire-flame-curved"
              size={24}
              style={{ marginBottom: -3 }}
              color={color}
            />
          ),
          tabBarLabel: ({ color }) => (
            <Text style={{ fontSize: 10, color, textAlign: 'center' }}>
              {hasLiveEvent ? 'Upcoming' : 'Upcoming Events'}
            </Text>
          ),
          headerTitle: () => <HeaderLogo title="Upcoming Events" />,
          headerRight: () => (
            <TouchableOpacity
              onPress={toggleSearch}
              style={{ marginRight: 16, padding: 8, marginTop: -16 }}
            >
              <FontAwesome
                name="search"
                size={20}
                color={isSearchVisible ? colors.tint : colors.text}
              />
            </TouchableOpacity>
          ),
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
          headerRight: () => (
            <TouchableOpacity
              onPress={toggleSearch}
              style={{ marginRight: 16, padding: 8, marginTop: -16 }}
            >
              <FontAwesome
                name="search"
                size={20}
                color={isSearchVisible ? colors.tint : colors.text}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="top-fights"
        options={{
          title: 'Good Fights',
          tabBarLabel: ({ color }) => (
            <Text style={{ fontSize: 10, color, textAlign: 'center' }}>
              Good Fights
            </Text>
          ),
          tabBarIcon: ({ color }) => (
            <Image
              source={require('../assets/tab-icon-hand.png')}
              style={{ width: 24, height: 24, marginBottom: -3, tintColor: color }}
              resizeMode="contain"
            />
          ),
          headerTitle: () => <HeaderLogo title="Good Fights" />,
          headerRight: () => (
            <TouchableOpacity
              onPress={toggleSearch}
              style={{ marginRight: 16, padding: 8, marginTop: -16 }}
            >
              <FontAwesome
                name="search"
                size={20}
                color={isSearchVisible ? colors.tint : colors.text}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: user?.displayName || 'Me',
          tabBarIcon: ({ color }) => (
            <FontAwesome6
              name="user-ninja"
              size={24}
              style={{ marginBottom: -3 }}
              color={color}
            />
          ),
          headerTitle: () => <HeaderLogo title={user?.displayName || 'Me'} />,
        }}
      />
    </Tabs>
  );
}

/**
 * Export types for external use
 */
export type { TabConfig, TabBarProps };