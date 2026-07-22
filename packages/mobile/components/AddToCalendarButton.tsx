import React from 'react';
import { Text, StyleSheet, TouchableOpacity, useColorScheme, Alert, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { WEB_URL } from '../services/api';

/**
 * "Add to calendar" for an upcoming event. No `expo-calendar` — so this ships
 * over the air instead of waiting for a store build.
 *
 * - iOS: open the web app's per-event `.ics`. iOS opens it in the native
 *   add-to-calendar sheet directly.
 * - Android: opening an `.ics` URL just downloads the file to Downloads (it does
 *   NOT hand off to the calendar app), so instead we open a Google Calendar
 *   "template" URL pre-filled with the event. That opens the Google Calendar app
 *   (or calendar.google.com in a browser) on a save-event screen. Requires the
 *   `event` prop; without it we fall back to the `.ics` download.
 *
 * The `.ics` path is NOT in the universal-link path list (only /fights,
 * /verify-email, /reset-password are), so this can't be captured back by the
 * app itself.
 */
type CalEvent = {
  name?: string | null;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
  date?: string | null;
  venue?: string | null;
  location?: string | null;
};

// UTC instant → Google Calendar basic format: YYYYMMDDTHHMMSSZ
function fmtInstantUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
// UTC date only → YYYYMMDD (for all-day events with no known start time)
function fmtDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function googleCalendarUrl(eventId: string, event: CalEvent): string {
  const startIso = event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime;
  const loc = [event.venue, event.location].filter(Boolean).join(', ');
  const details = `See the full card: ${WEB_URL}/events/${eventId}`;

  let dates = '';
  if (startIso) {
    const start = new Date(startIso);
    // Mirror the web .ics default: assume a 5-hour block.
    const end = new Date(start.getTime() + 5 * 60 * 60 * 1000);
    dates = `${fmtInstantUTC(start)}/${fmtInstantUTC(end)}`;
  } else if (event.date) {
    const d = new Date(event.date);
    const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    dates = `${fmtDateUTC(d)}/${fmtDateUTC(next)}`;
  }

  const params = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(event.name || 'Fight event')}`,
    `details=${encodeURIComponent(details)}`,
  ];
  if (dates) params.push(`dates=${dates}`);
  if (loc) params.push(`location=${encodeURIComponent(loc)}`);
  return `https://calendar.google.com/calendar/render?${params.join('&')}`;
}

export function AddToCalendarButton({ eventId, event }: { eventId: string; event?: CalEvent }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? 'dark'];

  const onPress = async () => {
    const url =
      Platform.OS === 'android' && event
        ? googleCalendarUrl(eventId, event)
        : `${WEB_URL}/events/${eventId}/calendar.ics`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open calendar', 'Your device would not open the calendar.');
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
