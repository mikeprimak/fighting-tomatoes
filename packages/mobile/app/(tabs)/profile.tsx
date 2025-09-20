import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
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
            <Text style={styles.avatarText}>
              {user?.firstName ? user.firstName.charAt(0).toUpperCase() : user?.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>
            {user?.firstName && user?.lastName 
              ? `${user.firstName} ${user.lastName}`
              : user?.username
            }
          </Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>
            @{user?.username}
          </Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>
            {user?.email}
          </Text>
        </View>

        {/* Profile Stats */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>0</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Fights Rated</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>0</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Rating</Text>
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
                { backgroundColor: user?.isActive ? colors.success : colors.danger }
              ]} />
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {user?.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Email Verified</Text>
            <Text style={[styles.infoValue, { 
              color: user?.isVerified ? colors.success : colors.warning 
            }]}>
              {user?.isVerified ? 'Verified' : 'Not Verified'}
            </Text>
          </View>
        </View>

        {/* App Info */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About Fighting Tomatoes</Text>
          
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
            onPress={() => Alert.alert('Coming Soon', 'Profile editing will be available in a future update')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => Alert.alert('Coming Soon', 'Settings will be available in a future update')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.danger }]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
