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
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';
import { api } from '../services/api';
import { FontAwesome } from '@expo/vector-icons';

export default function EditProfileScreen() {
  const { user, refreshUserData, logout } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, showInfo, hideAlert } = useCustomAlert();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingDisplayName, setIsCheckingDisplayName] = useState(false);
  const [displayNameAvailable, setDisplayNameAvailable] = useState<boolean | null>(null);
  const originalDisplayNameRef = useRef<string>('');
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state with user data when it changes (only on mount or when user ID changes)
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      originalDisplayNameRef.current = user.displayName || '';
      console.log('User data synced - displayName:', user.displayName);
    }
  }, [user?.id]); // Only sync when user ID changes, not on every prop change

  // Check displayName availability with debouncing
  useEffect(() => {
    console.log('DisplayName effect triggered:', {
      displayName,
      trimmed: displayName.trim(),
      original: originalDisplayNameRef.current,
      originalTrimmed: originalDisplayNameRef.current.trim(),
      length: displayName.trim().length
    });

    // Clear any existing timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }

    // Reset availability state if displayName is too short or unchanged
    if (!displayName || displayName.trim().length < 3 || displayName.trim() === originalDisplayNameRef.current.trim()) {
      console.log('Resetting availability state - too short or unchanged');
      setDisplayNameAvailable(null);
      setIsCheckingDisplayName(false);
      return;
    }

    console.log('Setting timeout to check displayName...');

    // Start checking after 500ms delay
    checkTimeoutRef.current = setTimeout(async () => {
      console.log('Timeout fired! Checking displayName availability:', displayName);
      setIsCheckingDisplayName(true);
      console.log('Set isCheckingDisplayName to TRUE');
      try {
        const result = await api.checkDisplayNameAvailability(displayName.trim());
        console.log('DisplayName check result:', result);
        setDisplayNameAvailable(result.available);
        console.log('Set displayNameAvailable to:', result.available);
      } catch (error) {
        console.error('Error checking displayName:', error);
        setDisplayNameAvailable(null);
        showError('Failed to check availability');
      } finally {
        setIsCheckingDisplayName(false);
        console.log('Set isCheckingDisplayName to FALSE');
      }
    }, 500);

    // Cleanup
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

      // Validate display name
      if (displayName && displayName.length < 3) {
        showError('Display name must be at least 3 characters');
        return;
      }

      // Update profile
      const profileData = {
        displayName: displayName || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      };

      await api.updateProfile(profileData);

      // Refresh user data
      await refreshUserData();

      showSuccess('Profile updated successfully!');

      // Navigate back after a short delay
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Error updating profile:', error);

      // Handle specific error codes
      if (error.code === 'DISPLAY_NAME_TAKEN') {
        showError('This display name is already taken. Please choose a different one.');
      } else {
        showError(error.message || 'Failed to update profile');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      showError('Please type DELETE to confirm');
      return;
    }

    try {
      setIsDeleting(true);
      await api.deleteAccount(deleteConfirmation);
      setShowDeleteModal(false);
      showSuccess('Account deleted successfully');

      // Log out and redirect to login screen
      setTimeout(async () => {
        await logout();
        router.replace('/(auth)/welcome');
      }, 1500);
    } catch (error: any) {
      console.error('Error deleting account:', error);
      showError(error.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  const styles = createStyles(colors);

  console.log('RENDER - Availability state:', {
    isCheckingDisplayName,
    displayNameAvailable,
    displayName,
    originalDisplayName: originalDisplayNameRef.current
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Profile',
          headerBackTitleVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 16 }}>
              <FontAwesome name="chevron-left" size={20} color={colors.text} />
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
        {/* Account (Email - Read-only) */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, {
                backgroundColor: colors.backgroundSecondary,
                color: colors.textSecondary,
                borderColor: colors.border
              }]}
              value={user?.email}
              editable={false}
            />
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              Email cannot be changed
            </Text>
          </View>
        </View>

        {/* Profile Information */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Information</Text>

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
            {/* Display name availability feedback */}
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

          {/* Hidden for launch - first/last name not needed */}
          {false && (
          <>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>First Name</Text>
            <TextInput
              style={[styles.input, {
                backgroundColor: colors.backgroundSecondary,
                color: colors.text,
                borderColor: colors.border
              }]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter first name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Last Name</Text>
            <TextInput
              style={[styles.input, {
                backgroundColor: colors.backgroundSecondary,
                color: colors.text,
                borderColor: colors.border
              }]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter last name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
            />
          </View>
          </>
          )}
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, { color: '#DC2626' }]}>Danger Zone</Text>
          <Text style={[styles.dangerDescription, { color: colors.textSecondary }]}>
            Permanently delete your account. Your ratings and reviews will be anonymized but preserved.
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => setShowDeleteModal(true)}
          >
            <FontAwesome name="trash" size={16} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
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

        {/* Delete Account Confirmation Modal */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Account</Text>
              <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                This action cannot be undone. Your account will be permanently deleted, but your ratings and reviews will be anonymized and preserved.
              </Text>
              <Text style={[styles.modalDescription, { color: colors.textSecondary, marginTop: 12 }]}>
                Type <Text style={{ fontWeight: 'bold', color: '#DC2626' }}>DELETE</Text> to confirm:
              </Text>
              <TextInput
                style={[styles.modalInput, {
                  backgroundColor: colors.backgroundSecondary,
                  color: colors.text,
                  borderColor: deleteConfirmation === 'DELETE' ? '#DC2626' : colors.border
                }]}
                value={deleteConfirmation}
                onChangeText={setDeleteConfirmation}
                placeholder="Type DELETE"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmation('');
                  }}
                  disabled={isDeleting}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmDeleteButton, {
                    opacity: deleteConfirmation === 'DELETE' ? 1 : 0.5
                  }]}
                  onPress={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmation !== 'DELETE'}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmDeleteButtonText}>Delete Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
  section: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
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
  // Danger Zone styles
  dangerSection: {
    borderColor: '#DC2626',
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
  },
  dangerDescription: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    padding: 14,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmDeleteButton: {
    backgroundColor: '#DC2626',
  },
  confirmDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
