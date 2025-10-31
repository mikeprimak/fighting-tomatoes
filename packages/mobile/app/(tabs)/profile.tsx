import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';
import { getHypeHeatmapColor } from '../../utils/heatmap';

export default function ProfileScreen() {
  const { user, logout, refreshUserData } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showConfirm, showError, hideAlert } = useCustomAlert();

  // Auto-refresh user data if averageRating or averageHype is missing (from old cached data)
  useEffect(() => {
    if (user && (!user.hasOwnProperty('averageRating') || !user.hasOwnProperty('averageHype'))) {
      console.log('Profile: averageRating or averageHype missing, refreshing user data...');
      refreshUserData();
    }
  }, [user?.id]); // Only run when user ID changes (mount/login)

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

  const styles = createStyles(colors);

  // Render star rating display (out of 10) with heatmap colors
  const renderStarRating = (rating: number) => {
    const stars = [];
    const maxStars = 10;
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < maxStars; i++) {
      const starValue = i + 1;
      const starColor = getHypeHeatmapColor(starValue);

      if (i < fullStars) {
        stars.push(
          <FontAwesome key={i} name="star" size={16} color={starColor} />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <FontAwesome key={i} name="star-half-o" size={16} color={starColor} />
        );
      } else {
        stars.push(
          <FontAwesome key={i} name="star-o" size={16} color={colors.textSecondary} style={{ opacity: 0.3 }} />
        );
      }
    }
    return stars;
  };

  // Render flame hype display (out of 10) with heatmap colors
  const renderFlameRating = (rating: number) => {
    const flames = [];
    const maxFlames = 10;
    const fullFlames = Math.floor(rating);

    for (let i = 0; i < maxFlames; i++) {
      const flameValue = i + 1;
      const flameColor = getHypeHeatmapColor(flameValue);

      if (i < fullFlames) {
        flames.push(
          <FontAwesome6 key={i} name="fire-flame-curved" size={16} color={flameColor} solid />
        );
      } else {
        flames.push(
          <FontAwesome6 key={i} name="fire-flame-curved" size={16} color={colors.textSecondary} style={{ opacity: 0.3 }} />
        );
      }
    }
    return flames;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Profile Header */}
        <View style={styles.header}>
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

        {/* Average Rating */}
        <View style={[styles.averageRatingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Average Rating</Text>
          <View style={styles.starsContainer}>
            {renderStarRating(user?.averageRating || 0)}
          </View>
          <Text style={[styles.ratingValue, { color: colors.text, marginTop: 8 }]}>
            {user?.averageRating ? user.averageRating.toFixed(1) : '0.0'} / 10
          </Text>
        </View>

        {/* Average Hype */}
        <View style={[styles.averageRatingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Average Hype</Text>
          <View style={styles.starsContainer}>
            {renderFlameRating(user?.averageHype || 0)}
          </View>
          <Text style={[styles.ratingValue, { color: colors.text, marginTop: 8 }]}>
            {user?.averageHype ? user.averageHype.toFixed(1) : '0.0'} / 10
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
            onPress={() => router.push('/settings')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/edit-profile')}
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Edit Profile</Text>
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
  averageRatingCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
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
