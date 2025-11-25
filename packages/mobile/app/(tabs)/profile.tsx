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
  // OR if distributions are empty (to get real data)
  useEffect(() => {
    console.log('=== User Profile Data ===');
    console.log('User:', JSON.stringify(user, null, 2));

    if (user && (
      !user.hasOwnProperty('averageRating') ||
      !user.hasOwnProperty('averageHype') ||
      !user.ratingDistribution ||
      Object.keys(user.ratingDistribution || {}).length === 0 ||
      !user.hypeDistribution ||
      Object.keys(user.hypeDistribution || {}).length === 0
    )) {
      console.log('Profile: Missing data or empty distributions, refreshing user data...');
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
  // Rounds to nearest whole number
  const renderStarRating = (rating: number) => {
    const stars = [];
    const maxStars = 10;
    const fullStars = Math.round(rating);

    for (let i = 0; i < maxStars; i++) {
      const starValue = i + 1;
      const starColor = getHypeHeatmapColor(starValue);

      if (i < fullStars) {
        // Full star
        stars.push(
          <FontAwesome key={i} name="star" size={28} color={starColor} />
        );
      } else {
        // Empty star
        stars.push(
          <FontAwesome key={i} name="star-o" size={28} color={colors.textSecondary} />
        );
      }
    }
    return stars;
  };

  // Render flame hype display (out of 10) with heatmap colors
  // Rounds to nearest whole number
  const renderFlameRating = (rating: number) => {
    const flames = [];
    const maxFlames = 10;
    const fullFlames = Math.round(rating);

    for (let i = 0; i < maxFlames; i++) {
      const flameValue = i + 1;
      const flameColor = getHypeHeatmapColor(flameValue);

      if (i < fullFlames) {
        // Full flame
        flames.push(
          <FontAwesome6 key={i} name="fire-flame-curved" size={28} color={flameColor} solid />
        );
      } else {
        // Empty flame
        flames.push(
          <FontAwesome6 key={i} name="fire-flame-curved" size={28} color={colors.textSecondary} />
        );
      }
    }
    return flames;
  };

  // Render distribution bar chart
  const renderDistributionChart = (distribution: Record<string, number>, type: 'rating' | 'hype') => {
    const ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Use real distribution data only
    const dataToUse = distribution || {};

    // If there's no data, show empty chart with message
    const hasData = Object.keys(dataToUse).length > 0;
    const maxCount = hasData ? Math.max(...Object.values(dataToUse), 1) : 1;
    const maxBarHeight = 45; // Maximum bar height in pixels

    return (
      <View>
        {!hasData && (
          <Text style={[styles.emptyChartMessage, { color: colors.textSecondary }]}>
            No {type === 'rating' ? 'ratings' : 'hype scores'} yet
          </Text>
        )}
        <View style={styles.chartContainer}>
          {ratings.map((rating) => {
            const count = dataToUse[rating] || 0;
            const barHeight = count > 0 ? Math.max((count / maxCount) * maxBarHeight, 4) : 0;
            const barColor = getHypeHeatmapColor(rating);

            return (
              <View key={rating} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>
                
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Predictions Section */}
        <View style={[styles.predictionsCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, marginBottom: 8 }}>
            <FontAwesome
              name="trophy"
              size={40}
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
              style={{ opacity: 0.4 }}
            />
            <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: 8, marginBottom: 0 }]}>My Fight Predictions</Text>
          </View>

          {/* Winner Predictions */}
          <View style={styles.predictionRow}>
            <View style={styles.predictionInfo}>
              <FontAwesome name="trophy" size={20} color={colors.primary} />
              <Text style={[styles.predictionLabel, { color: colors.text, marginLeft: 8 }]}>Winner Predictions:</Text>
            </View>
            <Text style={[styles.predictionValue, { color: colors.text }]}>
              {user?.winnerAccuracy ? `${user.winnerAccuracy.toFixed(0)}%` : '0%'} ({user?.correctWinnerPredictions || 0}/{user?.completedWinnerPredictions || 0})
            </Text>
          </View>

          {/* Method Predictions */}
          <View style={styles.predictionRow}>
            <View style={styles.predictionInfo}>
              <FontAwesome6 name="bullseye" size={20} color={colors.primary} />
              <Text style={[styles.predictionLabel, { color: colors.text, marginLeft: 8 }]}>Winner + Method Predictions:</Text>
            </View>
            <Text style={[styles.predictionValue, { color: colors.text }]}>
              {user?.methodAccuracy ? `${user.methodAccuracy.toFixed(0)}%` : '0%'} ({user?.correctMethodPredictions || 0}/{user?.completedMethodPredictions || 0})
            </Text>
          </View>
        </View>

        {/* Average Hype */}
        <View style={[styles.averageRatingCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, marginBottom: 8 }}>
            <FontAwesome6
              name="fire-flame-curved"
              size={40}
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
              style={{ opacity: 0.4 }}
            />
            <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: 8, marginBottom: 0 }]}>My Average Hype</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginLeft: 8 }}>({user?.totalHype || 0} fights)</Text>
          </View>
          {/* Hype Box + Distribution Chart - Horizontal Layout */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {/* Colored Hype Box */}
            <View style={{
              width: 40,
              height: 40,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 8,
              backgroundColor: getHypeHeatmapColor(Math.round(user?.averageHype || 0)),
            }}>
              <FontAwesome6
                name="fire-flame-curved"
                size={24}
                color={getHypeHeatmapColor(Math.round(user?.averageHype || 0))}
                style={{ position: 'absolute', opacity: 0.5 }}
              />
              <Text style={{
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 'bold',
                textAlign: 'center',
              }}>
                {user?.averageHype ? user.averageHype.toFixed(1) : '0.0'}
              </Text>
            </View>

            {/* Distribution Chart */}
            <View style={{ flex: 1, marginTop: -12 }}>
              {renderDistributionChart(user?.hypeDistribution || {}, 'hype')}
            </View>
          </View>

          
        </View>

        {/* Average Rating */}
        <View style={[styles.averageRatingCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, marginBottom: 8 }}>
            <FontAwesome
              name="star"
              size={40}
              color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
              style={{ opacity: 0.4 }}
            />
            <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: 8, marginBottom: 0 }]}>My Average Rating</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginLeft: 8 }}>({user?.totalRatings || 0} fights)</Text>
          </View>
          {/* Rating Box + Distribution Chart - Horizontal Layout */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {/* Colored Rating Box */}
            <View style={{
              width: 40,
              height: 40,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 8,
              backgroundColor: getHypeHeatmapColor(Math.round(user?.averageRating || 0)),
            }}>
              <FontAwesome
                name="star"
                size={24}
                color={getHypeHeatmapColor(Math.round(user?.averageRating || 0))}
                style={{ position: 'absolute', opacity: 0.5 }}
              />
              <Text style={{
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 'bold',
                textAlign: 'center',
              }}>
                {user?.averageRating ? user.averageRating.toFixed(1) : '0.0'}
              </Text>
            </View>

            {/* Distribution Chart */}
            <View style={{ flex: 1, marginTop: -12 }}>
              {renderDistributionChart(user?.ratingDistribution || {}, 'rating')}
            </View>
          </View>

          
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/activity/ratings')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="history" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>My Activity</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/settings')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="bell" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Notifications</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/edit-profile')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="user" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Edit Profile</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/send-feedback')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="comment" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Send Feedback</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.primary }]}
            onPress={handleLogout}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="sign-out" size={18} color={colors.textOnAccent} />
              <Text style={[styles.logoutButtonText, { color: colors.textOnAccent }]}>Sign Out</Text>
            </View>
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
    paddingHorizontal: 16,
    paddingTop: 25,
    paddingBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 0,
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
    paddingVertical: 16,
    marginBottom: 24,
  },
  predictionsCard: {
    paddingVertical: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  predictionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  predictionLabel: {
    fontSize: 14,
  },
  predictionValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  flamesContainer: {
    flexDirection: 'row',
    gap: 13,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  fightsRatedText: {
    fontSize: 12,
  },
  distributionContainer: {
    width: '100%',
  },
  distributionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyChartMessage: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 55,
    paddingHorizontal: 4,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barWrapper: {
    width: '100%',
    height: 45,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 14,
    borderRadius: 1,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  barCount: {
    fontSize: 9,
    marginTop: 1,
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
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
