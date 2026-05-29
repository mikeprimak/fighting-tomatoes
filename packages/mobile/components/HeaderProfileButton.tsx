import React from 'react';
import { TouchableOpacity, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';

/**
 * Profile entry point shown in the top-right of tab headers.
 *
 * The Profile screen no longer has its own bottom-tab button; this icon is the
 * way users reach it from anywhere. The profile route still exists in the
 * (tabs) group (registered with `href: null`), so router navigation works.
 */
export default function HeaderProfileButton() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile' as any)}
      style={{ padding: 8, marginRight: 8 }}
      accessibilityLabel="Open your profile"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <FontAwesome name="user-circle" size={22} color={colors.text} />
    </TouchableOpacity>
  );
}
