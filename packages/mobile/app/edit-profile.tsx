import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { FontAwesome } from '@expo/vector-icons';

export default function EditProfileScreen() {
  const { user, refreshUserData } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, showInfo, hideAlert } = useCustomAlert();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Sync state with user data when it changes
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setAvatar(user.avatar || '');
      setSelectedImage(null); // Clear selected image when user data updates
      console.log('User data synced - avatar:', user.avatar);
    }
  }, [user?.displayName, user?.firstName, user?.lastName, user?.avatar]);

  const pickImage = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        showError('Permission to access camera roll is required!');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        // Upload image immediately
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showError('Failed to pick image');
    }
  };

  const uploadImage = async (imageUri: string) => {
    try {
      console.log('Starting upload for:', imageUri);
      setIsUploadingImage(true);

      // Create form data
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'profile.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      console.log('File info - name:', filename, 'type:', type);

      formData.append('file', {
        uri: imageUri,
        name: filename,
        type,
      } as any);

      // Upload to server
      console.log('Calling API uploadProfileImage...');
      const response = await api.uploadProfileImage(formData);
      console.log('Upload response:', response);

      if (response.imageUrl) {
        setAvatar(response.imageUrl);
        console.log('Avatar set to:', response.imageUrl);
        showSuccess('Profile picture uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Error uploading image:', error);
      showError(error.message || 'Failed to upload image');
      setSelectedImage(null);
    } finally {
      console.log('Upload complete, clearing spinner');
      setIsUploadingImage(false);
    }
  };

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
        avatar: avatar || undefined,
      };

      console.log('Saving profile with avatar:', avatar);
      await api.updateProfile(profileData);

      // Refresh user data
      await refreshUserData();
      console.log('User data refreshed, new avatar:', user?.avatar);

      showSuccess('Profile updated successfully!');

      // Navigate back after a short delay
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      showError(error.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const styles = createStyles(colors);

  const displayImageUri = selectedImage || (avatar ? `${api.baseURL}${avatar}` : null);

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Profile' }} />
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
            {/* Header */}
            <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={[styles.backButtonText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={isLoading} style={styles.saveButton}>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.saveButtonText, { color: colors.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

        {/* Profile Picture */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {displayImageUri ? (
              <Image source={{ uri: displayImageUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarText, { color: colors.textOnAccent }]}>
                  {firstName ? firstName.charAt(0).toUpperCase() :
                   displayName ? displayName.charAt(0).toUpperCase() :
                   user?.email ? user.email.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            )}
            {isUploadingImage && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color={colors.textOnAccent} />
              </View>
            )}
            <TouchableOpacity
              style={[styles.editImageButton, { backgroundColor: colors.primary }]}
              onPress={pickImage}
              disabled={isUploadingImage}
            >
              <FontAwesome name="pencil" size={14} color={colors.textOnAccent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Fields */}
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
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              This is how others will see you (minimum 3 characters)
            </Text>
          </View>

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
        </View>

        {/* Email (Read-only) */}
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
          </ScrollView>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
  },
  saveButton: {
    padding: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
});
