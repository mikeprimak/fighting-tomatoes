import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import { getBiometricLabel } from '../utils/biometricAuth';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';
import { api } from '../services/api';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

export default function AdvancedSettingsScreen() {
  const {
    logout,
    user,
    biometricAvailable,
    biometricEnabled,
    enableBiometricLogin,
    disableBiometricLogin,
  } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
  const [enablingBiometric, setEnablingBiometric] = useState(false);

  useEffect(() => {
    getBiometricLabel().then(setBiometricLabel);
  }, []);

  const handleToggleBiometric = async (value: boolean) => {
    if (!value) {
      await disableBiometricLogin();
      showSuccess(`${biometricLabel} sign-in turned off`);
      return;
    }
    // Enabling needs the password (we don't keep it after login), so confirm it.
    setBiometricPassword('');
    setShowBiometricModal(true);
  };

  const handleConfirmEnableBiometric = async () => {
    if (!biometricPassword) {
      showError('Please enter your password');
      return;
    }
    setEnablingBiometric(true);
    try {
      const ok = await enableBiometricLogin(user?.email ?? '', biometricPassword);
      if (ok) {
        setShowBiometricModal(false);
        setBiometricPassword('');
        showSuccess(`${biometricLabel} sign-in enabled`);
      } else {
        showError('Could not enable. Try again.');
      }
    } catch (error: any) {
      showError(error?.message || 'Could not enable biometric sign-in');
    } finally {
      setEnablingBiometric(false);
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

      // Don't leave a deleted account's credentials in the keychain.
      await disableBiometricLogin();

      setTimeout(async () => {
        await logout();
        router.replace('/(auth)/login');
      }, 1500);
    } catch (error: any) {
      console.error('Error deleting account:', error);
      showError(error.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  const styles = createStyles(colors);

  // Build/update provenance — lets us tell a store-native build apart from an OTA
  // bundle at a glance (e.g. vc38 embedded vs vc37 + OTA) when diagnosing "why
  // isn't my change showing." channel/runtime/updateId come from expo-updates.
  const appVersion = Application.nativeApplicationVersion ?? '—';
  const buildNumber = Application.nativeBuildVersion ?? '—';
  const otaChannel = Updates.channel ?? 'dev';
  const otaRuntime = Updates.runtimeVersion ?? '—';
  const otaOrigin = Updates.isEmbeddedLaunch
    ? 'embedded'
    : Updates.updateId
      ? `OTA ${Updates.updateId.slice(0, 8)}`
      : 'OTA';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Advanced Settings',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }} style={{ paddingVertical: 10, paddingHorizontal: 16, marginLeft: -8 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Security */}
          {biometricAvailable && (
            <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Security</Text>
              <View style={styles.biometricRow}>
                <View style={styles.biometricInfo}>
                  <Text style={[styles.biometricLabel, { color: colors.text }]}>
                    Sign in with {biometricLabel}
                  </Text>
                  <Text style={[styles.biometricSublabel, { color: colors.textSecondary }]}>
                    Skip typing your password — unlock with {biometricLabel} instead.
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleToggleBiometric}
                  trackColor={{ false: colors.textSecondary, true: colors.tint }}
                  thumbColor="#B0B5BA"
                  style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
                />
              </View>
            </View>
          )}

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

          {/* Build info — diagnostic footer */}
          <View style={styles.buildFooter}>
            <Text style={[styles.buildText, { color: colors.textSecondary }]}>
              Good Fights v{appVersion} ({buildNumber}) · {otaChannel}
            </Text>
            <Text style={[styles.buildTextDim, { color: colors.textSecondary }]}>
              runtime {otaRuntime} · {otaOrigin}
            </Text>
          </View>
        </ScrollView>

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

        {/* Enable Biometric Confirmation Modal */}
        <Modal
          visible={showBiometricModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBiometricModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Enable {biometricLabel}
              </Text>
              <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                Confirm your password to turn on {biometricLabel} sign-in. We store it securely on this device only.
              </Text>
              <TextInput
                style={[styles.modalInput, {
                  backgroundColor: colors.backgroundSecondary,
                  color: colors.text,
                  borderColor: colors.border,
                  textAlign: 'left',
                  letterSpacing: 0,
                }]}
                value={biometricPassword}
                onChangeText={setBiometricPassword}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowBiometricModal(false);
                    setBiometricPassword('');
                  }}
                  disabled={enablingBiometric}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary, opacity: biometricPassword ? 1 : 0.5 }]}
                  onPress={handleConfirmEnableBiometric}
                  disabled={enablingBiometric || !biometricPassword}
                >
                  {enablingBiometric ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmDeleteButtonText}>Enable</Text>
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
  dangerSection: {
    borderColor: '#DC2626',
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricInfo: {
    flex: 1,
    marginRight: 16,
  },
  biometricLabel: {
    fontSize: 16,
    marginBottom: 2,
  },
  biometricSublabel: {
    fontSize: 13,
    lineHeight: 18,
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
  buildFooter: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
    gap: 2,
  },
  buildText: {
    fontSize: 12,
    fontWeight: '500',
  },
  buildTextDim: {
    fontSize: 11,
    opacity: 0.7,
  },
});
