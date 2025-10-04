import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';

interface NotificationPreferences {
  notificationsEnabled: boolean;
  notifyEventStart: boolean;
  notifyFightStart: boolean;
  notifyMainCardOnly: boolean;
  notifyUFCOnly: boolean;
  notifyCrewMessages: boolean;
  notifyCrewInvites: boolean;
  notifyRoundChanges: boolean;
  notifyFightResults: boolean;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notificationsEnabled: true,
    notifyEventStart: true,
    notifyFightStart: true,
    notifyMainCardOnly: false,
    notifyUFCOnly: false,
    notifyCrewMessages: true,
    notifyCrewInvites: true,
    notifyRoundChanges: false,
    notifyFightResults: true,
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await apiService.getNotificationPreferences();
      setPreferences(response.preferences);
    } catch (error) {
      console.error('Error loading preferences:', error);
      showError('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    // Optimistically update UI
    const oldValue = preferences[key];
    setPreferences(prev => ({ ...prev, [key]: value }));

    try {
      await apiService.updateNotificationPreferences({ [key]: value });
    } catch (error) {
      // Revert on error
      setPreferences(prev => ({ ...prev, [key]: oldValue }));
      showError('Failed to update preference');
    }
  };

  const sendTestNotification = async () => {
    setSaving(true);
    try {
      await apiService.sendTestNotification();
      showSuccess('Test notification sent! Check your device.');
    } catch (error) {
      showError('Failed to send test notification');
    } finally {
      setSaving(false);
    }
  };

  const SettingRow = ({
    label,
    value,
    onValueChange,
    disabled,
    sublabel,
  }: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    sublabel?: string;
  }) => (
    <View
      style={[
        styles.settingRow,
        { borderBottomColor: colors.border },
        disabled && styles.disabledRow,
      ]}
    >
      <View style={styles.settingInfo}>
        <Text style={[styles.settingLabel, { color: disabled ? colors.textSecondary : colors.text }]}>
          {label}
        </Text>
        {sublabel && (
          <Text style={[styles.settingSublabel, { color: colors.textSecondary }]}>
            {sublabel}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={value ? colors.textOnAccent : colors.textSecondary}
        disabled={disabled}
      />
    </View>
  );

  const styles = createStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Settings',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Master Toggle */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Push Notifications</Text>

          <SettingRow
            label="Enable Notifications"
            value={preferences.notificationsEnabled}
            onValueChange={(value) => updatePreference('notificationsEnabled', value)}
            sublabel="Receive push notifications from the app"
          />
        </View>

        {/* Event Notifications */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Events</Text>

          <SettingRow
            label="Event Starts"
            value={preferences.notifyEventStart}
            onValueChange={(value) => updatePreference('notifyEventStart', value)}
            disabled={!preferences.notificationsEnabled}
            sublabel="Notify when an event begins"
          />

          <SettingRow
            label="UFC Events Only"
            value={preferences.notifyUFCOnly}
            onValueChange={(value) => updatePreference('notifyUFCOnly', value)}
            disabled={!preferences.notificationsEnabled || !preferences.notifyEventStart}
            sublabel="Only notify for UFC events"
          />
        </View>

        {/* Fight Notifications */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Fights</Text>

          <SettingRow
            label="Fight Starts"
            value={preferences.notifyFightStart}
            onValueChange={(value) => updatePreference('notifyFightStart', value)}
            disabled={!preferences.notificationsEnabled}
            sublabel="Notify when fights begin"
          />

          <SettingRow
            label="Main Card Only"
            value={preferences.notifyMainCardOnly}
            onValueChange={(value) => updatePreference('notifyMainCardOnly', value)}
            disabled={!preferences.notificationsEnabled || !preferences.notifyFightStart}
            sublabel="Only notify for main card fights"
          />

          <SettingRow
            label="Round Changes"
            value={preferences.notifyRoundChanges}
            onValueChange={(value) => updatePreference('notifyRoundChanges', value)}
            disabled={!preferences.notificationsEnabled}
            sublabel="Notify when rounds change (live fights)"
          />

          <SettingRow
            label="Fight Results"
            value={preferences.notifyFightResults}
            onValueChange={(value) => updatePreference('notifyFightResults', value)}
            disabled={!preferences.notificationsEnabled}
            sublabel="Notify when fights end with results"
          />
        </View>

        {/* Crew Notifications */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Crews</Text>

          <SettingRow
            label="Crew Messages"
            value={preferences.notifyCrewMessages}
            onValueChange={(value) => updatePreference('notifyCrewMessages', value)}
            disabled={!preferences.notificationsEnabled}
            sublabel="Notify for new crew messages"
          />

          <SettingRow
            label="Crew Invites"
            value={preferences.notifyCrewInvites}
            onValueChange={(value) => updatePreference('notifyCrewInvites', value)}
            disabled={!preferences.notificationsEnabled}
            sublabel="Notify when invited to a crew"
          />
        </View>

        {/* Test Notification */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: colors.primary }]}
            onPress={sendTestNotification}
            disabled={saving || !preferences.notificationsEnabled}
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <FontAwesome name="bell" size={16} color="white" />
                <Text style={styles.testButtonText}>Send Test Notification</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Notifications help you stay updated on events, fights, and crew activity.
            You can customize which notifications you receive above.
          </Text>
        </View>
      </ScrollView>

      {/* Custom Alert */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 16,
      borderRadius: 12,
      overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      padding: 16,
      paddingBottom: 8,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
    },
    disabledRow: {
      opacity: 0.5,
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingLabel: {
      fontSize: 16,
      marginBottom: 2,
    },
    settingSublabel: {
      fontSize: 13,
      marginTop: 2,
    },
    testButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 8,
      gap: 8,
      margin: 16,
    },
    testButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    infoSection: {
      marginTop: 8,
      paddingHorizontal: 4,
    },
    infoText: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
