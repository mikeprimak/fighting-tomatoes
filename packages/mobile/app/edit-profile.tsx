import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';
import { api } from '../services/api';
import { FontAwesome, Ionicons } from '@expo/vector-icons';

export default function EditProfileScreen() {
  const { user, refreshUserData } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingDisplayName, setIsCheckingDisplayName] = useState(false);
  const [displayNameAvailable, setDisplayNameAvailable] = useState<boolean | null>(null);
  const originalDisplayNameRef = useRef<string>('');
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state with user data when it changes (only on mount or when user ID changes)
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      originalDisplayNameRef.current = user.displayName || '';
    }
  }, [user?.id]);

  // Check displayName availability with debouncing
  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }

    // Reset availability state if displayName is too short or unchanged
    if (!displayName || displayName.trim().length < 3 || displayName.trim() === originalDisplayNameRef.current.trim()) {
      setDisplayNameAvailable(null);
      setIsCheckingDisplayName(false);
      return;
    }

    checkTimeoutRef.current = setTimeout(async () => {
      setIsCheckingDisplayName(true);
      try {
        const result = await api.checkDisplayNameAvailability(displayName.trim());
        setDisplayNameAvailable(result.available);
      } catch (error) {
        console.error('Error checking displayName:', error);
        setDisplayNameAvailable(null);
        showError('Failed to check availability');
      } finally {
        setIsCheckingDisplayName(false);
      }
    }, 500);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  const handleSave = async () => {
    try {
      setIsLoading(true);

      if (displayName && displayName.length < 3) {
        showError('Display name must be at least 3 characters');
        return;
      }

      await api.updateProfile({ displayName: displayName || undefined });
      await refreshUserData();

      showSuccess('Display name updated!');

      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      if (error.code === 'DISPLAY_NAME_TAKEN') {
        showError('This display name is already taken. Please choose a different one.');
      } else {
        showError(error.message || 'Failed to update display name');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Display Name',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }} style={{ paddingVertical: 10, paddingHorizontal: 16, marginLeft: -8 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={100}
          enabled
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
          >
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Display Name</Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: colors.backgroundSecondary,
                  color: colors.text,
                  borderColor: colors.border
                }]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter display name"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
              />
              {isCheckingDisplayName && (
                <View style={styles.availabilityContainer}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={[styles.availabilityText, { color: colors.textSecondary }]}>
                    Checking availability...
                  </Text>
                </View>
              )}
              {!isCheckingDisplayName && displayNameAvailable === true && (
                <View style={styles.availabilityContainer}>
                  <FontAwesome name="check-circle" size={16} color="#4CAF50" />
                  <Text style={[styles.availabilityText, { color: '#4CAF50' }]}>
                    Username available
                  </Text>
                </View>
              )}
              {!isCheckingDisplayName && displayNameAvailable === false && (
                <View style={styles.availabilityContainer}>
                  <FontAwesome name="times-circle" size={16} color="#F44336" />
                  <Text style={[styles.availabilityText, { color: '#F44336' }]}>
                    Username unavailable
                  </Text>
                </View>
              )}
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                This is how others will see you (minimum 3 characters)
              </Text>
            </View>
          </ScrollView>

          {/* Full-width Save Button */}
          <View style={styles.saveButtonContainer}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isLoading}
              style={[styles.fullWidthSaveButton, { backgroundColor: colors.primary }]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.textOnAccent} />
              ) : (
                <Text style={[styles.fullWidthSaveButtonText, { color: colors.textOnAccent }]}>
                  Save Changes
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        <CustomAlert {...alertState} onDismiss={hideAlert} />
      </SafeAreaView>
    </>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 0,
  },
  saveButtonContainer: {
    padding: 16,
    paddingTop: 8,
  },
  fullWidthSaveButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  fullWidthSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  availabilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  availabilityText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
