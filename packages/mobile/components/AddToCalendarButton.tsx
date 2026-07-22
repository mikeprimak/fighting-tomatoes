import React from 'react';
import { Text, StyleSheet, TouchableOpacity, useColorScheme, Alert, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { WEB_URL } from '../services/api';

/**
 * "Add to calendar" for an upcoming event.
 *
 * - Android: open the phone's native "new event" editor via
 *   `Calendar.createEventInCalendarAsync` — pre-filled, no permission needed,
 *   and the user picks whichever calendar app/account to save into (works with
 *   ANY calendar app, not just Google). This needs the expo-calendar native
 *   module, so it only works in a real build; if the module isn't present (e.g.
 *   an OTA that landed on an older binary) we fall back to a Google Calendar
 *   template URL. Requires the `event` prop.
 * - iOS: open the web app's per-event `.ics`. iOS opens it in the native
 *   add-to-calendar sheet directly, so there's no reason to route it through a
 *   native module.
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

// Fallback only: a Google Calendar template URL, used when the native editor
// isn't available (OTA landed on an older binary).
function googleCalendarUrl(eventId: string, event: CalEvent): string {
  const startIso = event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime;
  const loc = [event.venue, event.location].filter(Boolean).join(', ');
  const details = `See the full card: ${WEB_URL}/events/${eventId}`;

  let dates = '';
  if (startIso) {
    const start = new Date(startIso);
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

  const openIcs = async () => {
    try {
      await Linking.openURL(`${WEB_URL}/events/${eventId}/calendar.ics`);
    } catch {
      Alert.alert('Could not open calendar', 'Your device would not open the calendar.');
    }
  };

  const onPress = async () => {
    // iOS (and Android with no event data): the web .ics opens the native sheet.
    if (Platform.OS !== 'android' || !event) {
      await openIcs();
      return;
    }

    // Android: present the native new-event editor (any calendar app).
    const startIso = event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime;
    const allDay = !startIso;
    const baseIso = startIso || event.date;
    const loc = [event.venue, event.location].filter(Boolean).join(', ');
    const notes = `See the full card: ${WEB_URL}/events/${eventId}`;

    if (baseIso) {
      try {
        const start = new Date(baseIso);
        const end = allDay
          ? new Date(start.getTime() + 24 * 60 * 60 * 1000)
          : new Date(start.getTime() + 5 * 60 * 60 * 1000);
        await Calendar.createEventInCalendarAsync({
          title: event.name || 'Fight event',
          startDate: start,
          endDate: end,
          allDay,
          location: loc || undefined,
          notes,
        });
        return;
      } catch {
        // Native module missing (OTA on an older binary) or no calendar app —
        // fall through to the Google Calendar template URL.
      }
    }

    try {
      await Linking.openURL(googleCalendarUrl(eventId, event));
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
