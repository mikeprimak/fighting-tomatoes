import React from 'react';
import { Text, StyleSheet, TouchableOpacity, useColorScheme, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { WEB_URL } from '../services/api';

/**
 * "Add to calendar" for an upcoming event.
 *
 * Deliberately no `expo-calendar`: the web app serves an .ics per event, and
 * handing that URL to the OS gets us the native add-to-calendar sheet on iOS
 * and the calendar app on Android with no new native dependency — so this ships
 * over the air instead of waiting for a store build.
 *
 * The .ics path is NOT in the universal-link path list (only /fights,
 * /verify-email, /reset-password are), so this can't be captured back by the
 * app itself.
 */
export function AddToCalendarButton({ eventId }: { eventId: string }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? 'dark'];

  const onPress = async () => {
    const url = `${WEB_URL}/events/${eventId}/calendar.ics`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open calendar', 'Your device would not open the calendar file.');
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, { borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel="Add this event to your calendar"
    >
      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
      <Text style={[styles.label, { color: colors.textSecondary }]}>Add to calendar</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default AddToCalendarButton;
