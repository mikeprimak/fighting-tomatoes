import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { apiService } from '../services/api';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';

interface NotificationPreferences {
  notificationsEnabled: boolean;
  notifyFollowedFighterFights: boolean;
  notifyPreEventReport: boolean;
  notifyHypedFights: boolean;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notificationsEnabled: true,
    notifyFollowedFighterFights: true,
    notifyPreEventReport: true,
    notifyHypedFights: true,
  });

  useEffect(() => {
    loadPreferences();
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

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

  const requestPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);

    if (status === 'granted') {
      showSuccess('Notification permissions granted!');
    } else if (status === 'denied') {
      // On iOS, once denied, user must go to settings
      if (Platform.OS === 'ios') {
        showError('Please enable notifications in Settings app', 'Permission Denied');
      }
    }
  };

  const openAppSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
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
        trackColor={{ false: colors.textSecondary, true: colors.tint }}
        thumbColor="#B0B5BA"
        style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
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
        {/* Permission Warning Banner */}
        {permissionStatus !== 'granted' && (
          <View style={[styles.permissionBanner, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
            <FontAwesome name="exclamation-triangle" size={20} color={colors.warning} />
            <View style={styles.permissionTextContainer}>
              <Text style={[styles.permissionTitle, { color: colors.text }]}>
                Notification Permissions Required
              </Text>
              <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
                {permissionStatus === 'denied'
                  ? 'You denied notification permissions. Please enable them in your device settings.'
                  : 'Grant permission to receive push notifications.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.permissionButton, { backgroundColor: colors.primary }]}
              onPress={permissionStatus === 'denied' ? openAppSettings : requestPermissions}
            >
              <Text style={styles.permissionButtonText}>
                {permissionStatus === 'denied' ? 'Open Settings' : 'Enable'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* General Notifications Toggle */}
        <View style={[styles.section, styles.sectionWithPadding, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>
            <Switch
              value={preferences.notificationsEnabled}
              onValueChange={(value) => updatePreference('notificationsEnabled', value)}
              trackColor={{ false: colors.textSecondary, true: colors.tint }}
              thumbColor="#B0B5BA"
              style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
            />
          </View>

          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Turn on to receive app notifications
          </Text>
        </View>

        {/* Fighter Notifications */}
        <View style={[styles.section, styles.sectionWithPadding, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Fighter Notifications</Text>
          </View>

          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            You will receive notifications 15 minutes before these fighters fight.
          </Text>

          <TouchableOpacity
            style={[styles.viewFollowedButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/followed-fighters')}
          >
            <Text style={[styles.viewFollowedButtonText, { color: colors.text }]}>
              See the fighters I follow
            </Text>
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Hyped Fights */}
        <View style={[styles.section, styles.sectionWithPadding, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Hyped Fights</Text>
            <Switch
              value={preferences.notifyHypedFights}
              onValueChange={(value) => updatePreference('notifyHypedFights', value)}
              trackColor={{ false: colors.textSecondary, true: colors.tint }}
              thumbColor="#B0B5BA"
              style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
            />
          </View>

          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Get notified 15 minutes before fights with 8.5+ hype
          </Text>
        </View>

        {/* Pre-Event Report */}
        <View style={[styles.section, styles.sectionWithPadding, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Pre-Event Report</Text>
            <Switch
              value={preferences.notifyPreEventReport}
              onValueChange={(value) => updatePreference('notifyPreEventReport', value)}
              trackColor={{ false: colors.textSecondary, true: colors.tint }}
              thumbColor="#B0B5BA"
              style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
            />
          </View>

          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Get a notification the morning of events breaking down which fights are most hyped and whether any fighters you follow are fighting.
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
    sectionWithPadding: {
      paddingTop: 12,
      paddingBottom: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
    },
    sectionDescription: {
      fontSize: 14,
      paddingHorizontal: 16,
      paddingBottom: 12,
      lineHeight: 20,
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
    permissionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 16,
      gap: 12,
    },
    permissionTextContainer: {
      flex: 1,
    },
    permissionTitle: {
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    permissionText: {
      fontSize: 13,
      lineHeight: 18,
    },
    permissionButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    permissionButtonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
    },
    viewFollowedButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 16,
      borderRadius: 8,
      borderWidth: 1,
    },
    viewFollowedButtonText: {
      fontSize: 15,
      fontWeight: '500',
    },
  });
