import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { useSpoilerFree } from '../../store/SpoilerFreeContext';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';
import { CommentCard, PreFightCommentCard, SearchBar } from '../../components';
import { getHypeHeatmapColor } from '../../utils/heatmap';
import { api, apiService } from '../../services/api';
import { markOnboardingPending } from '../../services/onboarding';
import { notificationService } from '../../services/notificationService';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import PredictionAccuracyChart from '../../components/PredictionAccuracyChart';

interface EventAccuracy {
  eventId: string;
  eventName: string;
  eventDate: string;
  promotion?: string;
  correct: number;
  incorrect: number;
}

interface TopReview {
  id: string;
  fightId: string;
  content: string;
  rating: number | null;
  upvotes: number;
  userHasUpvoted: boolean;
  createdAt: string;
  isReply: boolean;
  fight: {
    id: string;
    fightStatus?: string;
    fighter1Name: string;
    fighter2Name: string;
    eventName: string;
    eventDate: string;
    promotion?: string;
  };
}

interface TopPreflightComment {
  id: string;
  fightId: string;
  content: string;
  hypeRating: number | null;
  predictedWinner: string | null;
  upvotes: number;
  userHasUpvoted: boolean;
  createdAt: string;
  isReply: boolean;
  fight: {
    id: string;
    fightStatus?: string;
    fighter1Id: string;
    fighter2Id: string;
    fighter1Name: string;
    fighter2Name: string;
    eventName: string;
    eventDate: string;
    promotion?: string;
  };
}

// Helper to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
const getOrdinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Alternating grey bands, matching the fight-list cards (#222222 / #181818).
const SECTION_BG_EVEN = '#222222';
const SECTION_BG_ODD = '#181818';

// Title-less, border-less activity section. Replaces the old colored
// SectionContainer header bars — each section is just a flat grey band with
// an optional top-right "See All" link.
function ActivitySection({
  bgColor,
  title,
  headerRight,
  children,
  onPress,
}: {
  bgColor: string;
  title?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 54,
    backgroundColor: bgColor,
  };
  const inner = (
    <>
      <View style={{ flex: 1, marginRight: 12 }}>
        {title ?? null}
        {children}
      </View>
      {headerRight ?? null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={rowStyle} onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}

export default function ProfileScreen() {
  const { user, logout, refreshUserData, isAuthenticated } = useAuth();
  const { spoilerFreeMode, setSpoilerFreeMode } = useSpoilerFree();
  const queryClient = useQueryClient();

  // Notification permission state (master + per-lane toggles all live on /settings)
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const hasPermission = await notificationService.requestNotificationPermissions();
        setPermissionStatus(hasPermission ? 'granted' : 'denied');
      } catch {}
    })();
  }, [isAuthenticated]);

  const requestPermissions = async () => {
    const hasPermission = await notificationService.requestNotificationPermissions();
    setPermissionStatus(hasPermission ? 'granted' : 'denied');
  };

  const openAppSettings = () => {
    if (Platform.OS === 'ios') Linking.openURL('app-settings:');
    else Linking.openSettings();
  };

  // Refresh user data on auth (org filtering removed from this screen).
  useEffect(() => {
    if (isAuthenticated) {
      refreshUserData();
    }
  }, [isAuthenticated]);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showConfirm, showError, hideAlert } = useCustomAlert();
  const [upvotingReviewId, setUpvotingReviewId] = useState<string | null>(null);

  // Prediction accuracy data state
  const [predictionAccuracy, setPredictionAccuracy] = useState<{
    accuracyByEvent: EventAccuracy[];
    totalCorrect: number;
    totalIncorrect: number;
  }>({ accuracyByEvent: [], totalCorrect: 0, totalIncorrect: 0 });

  // Track if user has ANY predictions (for showing time filter)
  const [hasAnyPredictions, setHasAnyPredictions] = useState<boolean>(false);

  // Number of fighters the user follows (shown as a subtitle on the row)
  const [followedCount, setFollowedCount] = useState<number | null>(null);

  // Global standing data state
  const [globalStanding, setGlobalStanding] = useState<{
    position: number | null;
    totalUsers: number;
    hasRanking: boolean;
  }>({ position: null, totalUsers: 0, hasRanking: false });

  // Top reviews data state
  const [topReviews, setTopReviews] = useState<{
    reviews: TopReview[];
    totalWithUpvotes: number;
  }>({ reviews: [], totalWithUpvotes: 0 });

  // Top pre-flight comments data state
  const [topPreflightComments, setTopPreflightComments] = useState<{
    comments: TopPreflightComment[];
    totalWithUpvotes: number;
  }>({ comments: [], totalWithUpvotes: 0 });
  const [upvotingPreflightId, setUpvotingPreflightId] = useState<string | null>(null);

  // Fan DNA trait cards — ordered by weight, populated lazily by the
  // backend's batchCompute path. Empty array = either no traits met their
  // floor yet or the fetch failed (silent — section just stays hidden).
  type FanDNACard = {
    traitId: string;
    family: 'affinity' | 'behaviour' | 'prediction' | 'identity';
    headline: string;
    body?: string;
    primaryStat?: string;
    secondaryStat?: string;
    weight: number;
    confidence: number;
    computedAt: string;
  };
  const [fanDNACards, setFanDNACards] = useState<FanDNACard[]>([]);
  const [fanDNALoading, setFanDNALoading] = useState<boolean>(false);
  type FanDNAPersonalityType = {
    id: string;
    label: string;
    body: string;
    primaryStat?: string;
    secondaryStat?: string;
  };
  const [fanDNAType, setFanDNAType] = useState<FanDNAPersonalityType | null>(null);

  // Time filter state - default to 'allTime' to show all predictions
  const [timeFilter, setTimeFilter] = useState<string>('allTime');
  const timeFilterOptions = [
    { key: 'week', label: 'Past Week' },
    { key: 'month', label: 'Month' },
    { key: '3months', label: '3 mo.' },
    { key: 'year', label: 'Year' },
    { key: 'allTime', label: 'All Time' },
  ];

  // Check if user has ANY predictions (once on mount)
  useEffect(() => {
    const checkForAnyPredictions = async () => {
      try {
        const data = await api.getPredictionAccuracyByEvent('allTime');
        setHasAnyPredictions((data.totalCorrect + data.totalIncorrect) > 0);
      } catch (error) {
        console.error('Failed to check for predictions:', error);
      }
    };

    if (user) {
      checkForAnyPredictions();
    }
  }, [user?.id]);

  // Fetch prediction accuracy and global standing data
  useEffect(() => {
    const fetchPredictionData = async () => {
      try {
        const [accuracyData, standingData] = await Promise.all([
          api.getPredictionAccuracyByEvent(timeFilter),
          api.getGlobalStanding(timeFilter),
        ]);

        setPredictionAccuracy({
          accuracyByEvent: accuracyData.accuracyByEvent,
          totalCorrect: accuracyData.totalCorrect,
          totalIncorrect: accuracyData.totalIncorrect,
        });

        setGlobalStanding({
          position: standingData.position,
          totalUsers: standingData.totalUsers,
          hasRanking: standingData.hasRanking,
        });
      } catch (error) {
        console.error('Failed to fetch prediction data:', error);
      }
    };

    if (user) {
      fetchPredictionData();
    }
  }, [user?.id, timeFilter]);

  // Refresh the followed-fighters count when the screen comes into focus,
  // so it stays accurate after following/unfollowing elsewhere.
  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        if (!user) return;

        try {
          const followed = await api.getFollowedFighters();
          setFollowedCount(followed?.fighters?.length ?? 0);
        } catch (error) {
          console.log('Error fetching followed fighters count:', error);
        }
      };

      fetchData();
    }, [user?.id])
  );

  // Fetch Fan DNA. First call after login triggers a lazy batchCompute on the
  // backend, so it can take a few seconds for users with lots of ratings —
  // hence the separate loading flag and the silent on-error path.
  useEffect(() => {
    const fetchFanDNA = async () => {
      if (!user) return;
      setFanDNALoading(true);
      try {
        const data = await apiService.getFanDNAProfile();
        setFanDNACards(data.cards ?? []);
        setFanDNAType(data.personalityType ?? null);
      } catch (error) {
        console.log('Fan DNA fetch failed (silent):', error);
        setFanDNACards([]);
        setFanDNAType(null);
      } finally {
        setFanDNALoading(false);
      }
    };
    fetchFanDNA();
  }, [user?.id]);

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

  // Handle upvote on a review
  const handleUpvote = async (fightId: string, reviewId: string) => {
    if (upvotingReviewId) return;

    setUpvotingReviewId(reviewId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await apiService.toggleReviewUpvote(fightId, reviewId);
      // Refresh the top reviews to get updated upvote counts
      const data = await api.getMyTopReviews(3);
      if (data && data.reviews) {
        setTopReviews(data);
      }
    } catch (error) {
      console.error('Failed to upvote review:', error);
    } finally {
      setUpvotingReviewId(null);
    }
  };

  // Pull-to-refresh: reload user data + prediction accuracy + top reviews/comments
  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshUserData(),
        (async () => {
          try {
            const [accuracyData, standingData] = await Promise.all([
              api.getPredictionAccuracyByEvent(timeFilter),
              api.getGlobalStanding(timeFilter),
            ]);
            setPredictionAccuracy({
              accuracyByEvent: accuracyData.accuracyByEvent,
              totalCorrect: accuracyData.totalCorrect,
              totalIncorrect: accuracyData.totalIncorrect,
            });
            setGlobalStanding({
              position: standingData.position,
              totalUsers: standingData.totalUsers,
              hasRanking: standingData.hasRanking,
            });
          } catch (error) {
            console.error('Failed to refresh prediction data:', error);
          }
        })(),
        (async () => {
          try {
            const [reviewsData, commentsData] = await Promise.all([
              api.getMyTopReviews(3),
              api.getMyTopPreflightComments(3),
            ]);
            if (reviewsData?.reviews) setTopReviews(reviewsData);
            if (commentsData?.comments) setTopPreflightComments(commentsData);
          } catch (error) {
            console.error('Failed to refresh profile comments:', error);
          }
        })(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [user, refreshUserData, timeFilter]);

  // Handle upvote on a pre-flight comment
  const handleUpvotePreflight = async (fightId: string, commentId: string) => {
    if (upvotingPreflightId) return;

    setUpvotingPreflightId(commentId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await apiService.togglePreFightCommentUpvote(fightId, commentId);
      // Refresh the top pre-flight comments to get updated upvote counts
      const data = await api.getMyTopPreflightComments(3);
      if (data && data.comments) {
        setTopPreflightComments(data);
      }
    } catch (error) {
      console.error('Failed to upvote pre-flight comment:', error);
    } finally {
      setUpvotingPreflightId(null);
    }
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
    const maxBarHeight = 82; // Maximum bar height to match colored box height

    const handleBarPress = (score: number) => {
      const route = type === 'hype' ? '/activity/my-hype' : '/activity/my-ratings';
      router.push(`${route}?filter=${score}` as any);
    };

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
              <TouchableOpacity
                key={rating}
                style={styles.barContainer}
                onPress={() => handleBarPress(rating)}
                activeOpacity={0.7}
              >
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
                <Text style={styles.barLabel}>{rating}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Guest user view - show login prompt
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <FontAwesome name="user-circle-o" size={80} color={colors.textSecondary} />
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 24, textAlign: 'center' }}>
            Log in to track your activity
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            See your predictions, ratings, comments, and more
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, marginTop: 24 }}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={{ color: colors.textOnAccent, fontSize: 16, fontWeight: '600' }}>Log In / Sign Up</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Pinned search bar — shown when the header magnifying glass is toggled */}
      <SearchBar />
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor="#181818"
          />
        }
      >
        {/* Settings — ordered: account, display name, my hype, my ratings,
            followed fighters, fan DNA, spoiler-free, notifications, advanced. */}
        <View style={styles.settingsContainer}>
          {/* Account (email) */}
          <View style={[styles.settingsRow, { backgroundColor: SECTION_BG_EVEN }]}>
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Account</Text>
            <Text
              style={[styles.settingsRowValue, { color: colors.textSecondary, marginTop: 0, flexShrink: 1, textAlign: 'right' }]}
              numberOfLines={1}
            >
              {user?.email || '—'}
            </Text>
          </View>

          {/* Display Name */}
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: SECTION_BG_ODD }]}
            onPress={() => router.push('/edit-profile')}
          >
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Display Name</Text>
              <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {user?.displayName || '—'}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* My Hype */}
        <ActivitySection
          bgColor={SECTION_BG_EVEN}
          onPress={user?.totalHype ? () => router.push('/activity/my-hype' as any) : undefined}
          title={<Text style={[styles.settingsRowLabel, { color: colors.text }]}>My Hype</Text>}
          headerRight={user?.totalHype ? (
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          ) : undefined}
        >
          {!user?.totalHype ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8 }}>
              Hype fights on{' '}
              <Text
                style={{ color: colors.primary, fontWeight: '600' }}
                onPress={() => router.push('/(tabs)')}
              >
                Upcoming Events
              </Text>
              .
            </Text>
          ) : (
            <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>
              My Average Hype: <Text style={{ color: colors.text, fontWeight: '600' }}>{(user?.averageHype || 0).toFixed(1)}</Text>
              {'   '}·{'   '}{user?.totalHype || 0} fights hyped
            </Text>
          )}
        </ActivitySection>

        {/* My Ratings */}
        <ActivitySection
          bgColor={SECTION_BG_ODD}
          onPress={user?.totalRatings ? () => router.push('/activity/my-ratings' as any) : undefined}
          title={<Text style={[styles.settingsRowLabel, { color: colors.text }]}>My Ratings</Text>}
          headerRight={user?.totalRatings ? (
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          ) : undefined}
        >
          {!user?.totalRatings ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8 }}>
              Rate fights on{' '}
              <Text
                style={{ color: colors.primary, fontWeight: '600' }}
                onPress={() => router.push('/(tabs)/past-events')}
              >
                Past Events
              </Text>
              .
            </Text>
          ) : (
            <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>
              My Average Rating: <Text style={{ color: colors.text, fontWeight: '600' }}>{(user?.averageRating || 0).toFixed(1)}</Text>
              {'   '}·{'   '}{user?.totalRatings || 0} fights rated
            </Text>
          )}
        </ActivitySection>

        <View style={styles.settingsContainer}>
          {/* My Followed Fighters */}
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: SECTION_BG_EVEN }]}
            onPress={() => router.push('/followed-fighters' as any)}
          >
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>My Followed Fighters</Text>
              {followedCount !== null && (
                <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>
                  Following {followedCount} {followedCount === 1 ? 'fighter' : 'fighters'}
                </Text>
              )}
            </View>
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Your Fan DNA — condensed to title + personality type line. */}
        {(fanDNALoading || fanDNAType) && (
          <ActivitySection
            bgColor={SECTION_BG_ODD}
            onPress={fanDNAType ? () => router.push('/activity/fan-dna' as any) : undefined}
            title={<Text style={[styles.settingsRowLabel, { color: colors.text }]}>Your Fan DNA</Text>}
            headerRight={fanDNAType ? (
              <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
            ) : undefined}
          >
            {fanDNAType ? (
              <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>
                Your Type: <Text style={{ color: colors.text, fontWeight: '600' }}>{fanDNAType.label}</Text>
              </Text>
            ) : (
              <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>Computing your DNA…</Text>
            )}
          </ActivitySection>
        )}

        <View style={styles.settingsContainer}>
          {/* Spoiler-Free Mode */}
          <View style={[styles.settingsRow, { backgroundColor: SECTION_BG_EVEN }]}>
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>
                Spoiler-Free Mode: {spoilerFreeMode ? 'ON' : 'OFF'}
              </Text>
              <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>
                {spoilerFreeMode
                  ? 'Fight winners are currently hidden until you rate them.'
                  : 'Fight winners are visible.'}
              </Text>
            </View>
            <Switch
              value={spoilerFreeMode}
              onValueChange={setSpoilerFreeMode}
              trackColor={{ false: '#767577', true: '#4CAF50' }}
              thumbColor={spoilerFreeMode ? '#FFFFFF' : '#f4f3f4'}
            />
          </View>

          {/* Notification permission banner — only when not granted */}
          {permissionStatus !== 'granted' && (
            <View style={[styles.permissionBanner, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
              <FontAwesome name="exclamation-triangle" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: colors.text }]}>Notifications off</Text>
                <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
                  {permissionStatus === 'denied'
                    ? 'Enable them in your device settings.'
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

          {/* Notification settings */}
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: SECTION_BG_ODD }]}
            onPress={() => router.push('/settings')}
          >
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Notification settings</Text>
              <Text style={[styles.settingsRowValue, { color: colors.textSecondary }]}>
                Choose which alerts you get for fighters you follow
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Advanced Settings */}
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: SECTION_BG_EVEN }]}
            onPress={() => router.push('/advanced-settings' as any)}
          >
            <View style={styles.settingsRowLeft}>
              <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Advanced Settings</Text>
            </View>
            <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Send Feedback */}
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: SECTION_BG_ODD }]}
          onPress={() => router.push('/send-feedback')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <FontAwesome name="comment" size={18} color={colors.text} />
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Send Feedback</Text>
          </View>
          <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: SECTION_BG_EVEN }]}
          onPress={handleLogout}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <FontAwesome name="sign-out" size={18} color={colors.text} />
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Sign Out</Text>
          </View>
        </TouchableOpacity>

        {/* Dev-only: re-enter the onboarding flow without re-registering.
            Server data (ratings/follows) persists across replays — use
            scripts/reset-onboarding-tester.ts for a clean slate. */}
        {__DEV__ && (
          <TouchableOpacity
            style={[styles.settingsRow, { backgroundColor: SECTION_BG_ODD }]}
            onPress={async () => {
              await markOnboardingPending();
              router.push('/(onboarding)/welcome');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <FontAwesome name="refresh" size={18} color={colors.primary} />
              <Text style={[styles.settingsRowLabel, { color: colors.primary }]}>Replay Onboarding (dev)</Text>
            </View>
          </TouchableOpacity>
        )}
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
    paddingHorizontal: 0,
    paddingTop: 0,
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
    height: 82,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    marginHorizontal: 0.5,
  },
  barWrapper: {
    width: '100%',
    height: 82,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 24,
    borderRadius: 1,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 10,
    marginTop: 4,
    color: '#808080',
  },
  barCount: {
    fontSize: 9,
    marginTop: 1,
  },
  ratingIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    width: 90,
    height: 105,
  },
  ratingIconText: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  settingsContainer: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  activityHeader: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  settingsGroupLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  settingsGroup: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  settingsRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  settingsRowLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingsRowValue: {
    fontSize: 12,
    marginTop: 2,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  permissionText: {
    fontSize: 12,
    lineHeight: 16,
  },
  permissionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  actionsContainer: {
    marginTop: 16,
    marginHorizontal: 12,
    gap: 11,
  },
  actionButtonFull: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
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
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  filterTabsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 6,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.border,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterTabTextActive: {
    color: colors.textOnAccent,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
}); 
