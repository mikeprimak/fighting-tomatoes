import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';
import { api } from '../../services/api';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showConfirm, showError, hideAlert } = useCustomAlert();

  const handleLogout = () => {
    showConfirm(
      'Are you sure you want to sign out?',
      async () => {
        try {
          console.log('Logout button pressed - calling logout function');
          await logout();
          console.log('Logout completed successfully');
        } catch (error) {
          console.error('Logout error:', error);
          showConfirm(
            'Failed to sign out. Force logout?',
            async () => {
              try {
                // Force clear all storage
                const AsyncStorage = await import('@react-native-async-storage/async-storage');
                await AsyncStorage.default.clear();
                // Force navigation
                const { router } = await import('expo-router');
                router.replace('/(auth)/login');
              } catch (e) {
                console.error('Force logout error:', e);
              }
            },
            'Error',
            'Force Logout',
            'Cancel',
            true
          );
        }
      },
      'Sign Out',
      'Sign Out',
      'Cancel',
      true
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {user?.avatar ? (
              <Image
                source={{ uri: `${api.baseURL}${user.avatar}` }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={[styles.avatarText, { color: colors.textOnAccent }]}>
                {user?.firstName ? user.firstName.charAt(0).toUpperCase() :
                 user?.displayName ? user.displayName.charAt(0).toUpperCase() :
                 user?.email ? user.email.charAt(0).toUpperCase() : '?'}
              </Text>
            )}
          </View>
          <Text style={[styles.name, { color: colors.text }]}>
            {user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : user?.displayName || 'User'
            }
          </Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>
            {user?.displayName && `@${user.displayName}`}
          </Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>
            {user?.email}
          </Text>
        </View>

        {/* Profile Stats */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{user?.totalRatings || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Fights Rated</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{user?.totalReviews || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Reviews Written</Text>
          </View>
        </View>

        {/* Account Info */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Member Since</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {formatDate(user?.createdAt || '')}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Account Status</Text>
            <View style={styles.statusContainer}>
              <View style={[
                styles.statusDot,
                { backgroundColor: colors.success }
              ]} />
              <Text style={[styles.infoValue, { color: colors.text }]}>
                Active
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Email Verified</Text>
            <Text style={[styles.infoValue, { 
              color: user?.isEmailVerified ? colors.success : colors.warning
            }]}>
              {user?.isEmailVerified ? 'Verified' : 'Not Verified'}
            </Text>
          </View>
        </View>

        {/* App Info */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About FightCrewApp</Text>
          
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
            Rate and discover the most entertaining fights in combat sports. 
            Share your opinions and see how they compare with other fans.
          </Text>

          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            Version 1.0.0
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/activity')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>My Activity</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/edit-profile')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/settings')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.primary }]}
            onPress={handleLogout}
          >
            <Text style={[styles.logoutButtonText, { color: colors.textOnAccent }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
  },
  actionsContainer: {
    marginTop: 8,
  },
  actionButton: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
}); 
