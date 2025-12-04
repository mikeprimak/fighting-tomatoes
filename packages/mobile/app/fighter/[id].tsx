import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import { apiService, Fight } from '../../services/api';
import { DetailScreenHeader, FightDisplayCard, Button } from '../../components';
import { useAuth } from '../../store/AuthContext';
import { useVerification } from '../../store/VerificationContext';
import { FontAwesome } from '@expo/vector-icons';

type SortOption = 'newest' | 'oldest' | 'highest-rating' | 'most-rated';

const SORT_OPTIONS = [
  { value: 'highest-rating' as SortOption, label: 'Highest Rated' },
  { value: 'newest' as SortOption, label: 'Date' },
  { value: 'most-rated' as SortOption, label: 'Number of Ratings' },
];

// Placeholder image for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  return require('../../assets/fighters/fighter-default-alpha.png');
};

export default function FighterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const { requireVerification } = useVerification();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const router = useRouter();

  // State
  const [sortBy, setSortBy] = useState<SortOption>('highest-rating');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Animation for bell ringing
  const bellRotation = useRef(new Animated.Value(0)).current;

  // Animation for toast notification
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

  // Fetch fighter details
  const { data: fighterData, isLoading, error } = useQuery({
    queryKey: ['fighter', id],
    queryFn: () => apiService.getFighter(id as string),
    enabled: !!id,
  });

  // Fetch fighter's fights
  const { data: fightsData, isLoading: fightsLoading } = useQuery({
    queryKey: ['fighterFights', id, isAuthenticated],
    queryFn: async () => {
      const response = await apiService.getFights({
        fighterId: id as string,
        includeUserData: isAuthenticated,
        limit: 50,
      });
      return response;
    },
    enabled: !!id,
  });

  // Bell ringing animation
  const animateBellRing = () => {
    bellRotation.setValue(0);
    Animated.sequence([
      Animated.timing(bellRotation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bellRotation, {
        toValue: -1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bellRotation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bellRotation, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Toast notification animation
  const showToast = (message: string) => {
    setToastMessage(message);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(50);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 2 seconds
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 50,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastMessage('');
      });
    }, 2000);
  };

  // Follow/Unfollow mutation
  const followMutation = useMutation({
    mutationFn: async (isCurrentlyFollowing: boolean) => {
      if (isCurrentlyFollowing) {
        return await apiService.unfollowFighter(id as string);
      } else {
        return await apiService.followFighter(id as string);
      }
    },
    onSuccess: async (data) => {
      // Animate bell ring and show toast when following
      if (data.isFollowing && fighter) {
        animateBellRing();
        showToast(`You will be notified before ${fighter.lastName} fights.`);
      }

      // Refetch fighter data and invalidate all fight queries to update bell icons
      await queryClient.refetchQueries({ queryKey: ['fighter', id] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      queryClient.invalidateQueries({ queryKey: ['fight'] }); // Invalidate all fight detail queries
    },
  });

  const handleFollowPress = () => {
    if (!isAuthenticated) {
      return;
    }
    if (!requireVerification('follow this fighter')) return;
    const isCurrentlyFollowing = fighter?.isFollowing || false;
    followMutation.mutate(isCurrentlyFollowing);
  };

  // Get highest rated fight for header display
  const highestRatedFight = useMemo(() => {
    const fights = fightsData?.fights || [];
    if (fights.length === 0) return null;

    return [...fights]
      .filter(f => f.averageRating && f.averageRating > 0)
      .sort((a: Fight, b: Fight) => (b.averageRating || 0) - (a.averageRating || 0))[0] || null;
  }, [fightsData?.fights]);

  // Separate and sort fights
  const { upcomingFights, completedFights, sortedFights } = useMemo(() => {
    const fights = fightsData?.fights || [];
    if (fights.length === 0) return { upcomingFights: [], completedFights: [], sortedFights: [] };

    // Separate into upcoming and completed
    const upcoming = fights.filter((f: Fight) => !f.isComplete);
    const completed = fights.filter((f: Fight) => f.isComplete);

    // Sort each group
    const sortUpcoming = (a: Fight, b: Fight) => {
      if (sortBy === 'newest') {
        return new Date(b.event.date).getTime() - new Date(a.event.date).getTime();
      }
      return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
    };

    const sortCompleted = (a: Fight, b: Fight) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.event.date).getTime() - new Date(a.event.date).getTime();
        case 'oldest':
          return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
        case 'highest-rating':
          return (b.averageRating || 0) - (a.averageRating || 0);
        case 'most-rated':
          return (b.totalRatings || 0) - (a.totalRatings || 0);
        default:
          return 0;
      }
    };

    const sortedUpcoming = [...upcoming].sort(sortUpcoming);
    const sortedCompleted = [...completed].sort(sortCompleted);

    // Determine order: upcoming first for 'newest', completed first for rating sorts
    const showUpcomingFirst = sortBy === 'newest';
    const allSorted = showUpcomingFirst
      ? [...sortedUpcoming, ...sortedCompleted]
      : [...sortedCompleted, ...sortedUpcoming];

    return {
      upcomingFights: sortedUpcoming,
      completedFights: sortedCompleted,
      sortedFights: allSorted,
    };
  }, [fightsData?.fights, sortBy]);

  const handleFightPress = (fight: Fight) => {
    // Navigate to the fight detail screen
    router.push(`/fight/${fight.id}`);
  };

  const fighter = fighterData?.fighter;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading fighter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !fighter) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter" />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Error loading fighter details
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <DetailScreenHeader
        title="Fighter"
      />

      <ScrollView style={styles.scrollView}>
        {/* Fighter Header - Image and Info Side by Side */}
        <View style={styles.headerContainer}>
          {/* Fighter Image - Left */}
          <Image
            source={
              fighter.profileImage
                ? { uri: fighter.profileImage }
                : getFighterPlaceholderImage(fighter.id)
            }
            style={styles.fighterImage}
          />

          {/* Fighter Info - Right */}
          <View style={styles.headerInfoContainer}>
            <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
              {fighter.firstName} {fighter.lastName}
            </Text>

            {fighter.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]} numberOfLines={1}>
                "{fighter.nickname}"
              </Text>
            )}

            {fighter.weightClass && (
              <Text style={[styles.fighterInfoText, { color: colors.text }]} numberOfLines={1}>
                {fighter.isChampion
                  ? `${fighter.weightClass.includes('WOMENS_') ? "Women's " : ''}${fighter.weightClass.replace(/WOMENS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())} Champion`
                  : fighter.rank
                    ? `${fighter.rank} ${fighter.weightClass.replace(/WOMENS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`
                    : `${fighter.weightClass.includes('WOMENS_') ? "Women's " : ''}${fighter.weightClass.replace(/WOMENS_/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`
                }
              </Text>
            )}

            <Text style={[styles.fighterInfoText, { color: colors.text }]} numberOfLines={1}>
              Record: {fighter.wins}-{fighter.losses}-{fighter.draws}
            </Text>

            {/* Follow Button */}
            {isAuthenticated && (
              <Button
                onPress={handleFollowPress}
                disabled={followMutation.isPending}
                loading={followMutation.isPending}
                variant={fighter.isFollowing ? 'primary' : 'outline'}
                size="small"
                icon={
                  <Animated.View
                    style={{
                      transform: [
                        {
                          rotate: bellRotation.interpolate({
                            inputRange: [-1, 0, 1],
                            outputRange: ['-15deg', '0deg', '15deg'],
                          }),
                        },
                      ],
                    }}
                  >
                    <FontAwesome
                      name={fighter.isFollowing ? "bell" : "bell-o"}
                      size={14}
                      color={fighter.isFollowing ? '#1a1a1a' : colors.primary}
                    />
                  </Animated.View>
                }
              >
                {fighter.isFollowing ? 'Notifications On' : 'Notify Me'}
              </Button>
            )}
          </View>
        </View>

        {/* Fights */}
        <View style={styles.fightHistorySection}>
          <View style={styles.fightsTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Fights
            </Text>

            {/* Sort Dropdown */}
            {sortedFights.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowSortDropdown(true)}
                style={[styles.dropdownButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.dropdownButtonText, { color: colors.text }]}>
                  {SORT_OPTIONS.find(opt => opt.value === sortBy)?.label}
                </Text>
                <FontAwesome name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Dropdown Modal */}
          <Modal
            visible={showSortDropdown}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSortDropdown(false)}
          >
            <TouchableOpacity
              style={styles.dropdownOverlay}
              activeOpacity={1}
              onPress={() => setShowSortDropdown(false)}
            >
              <View style={[styles.dropdownMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => {
                      setSortBy(option.value);
                      setShowSortDropdown(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      { borderBottomColor: colors.border },
                      sortBy === option.value && { backgroundColor: colors.primary + '20' }
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        { color: colors.text },
                        sortBy === option.value && { fontWeight: '600', color: colors.primary }
                      ]}
                    >
                      {option.label}
                    </Text>
                    {sortBy === option.value && (
                      <FontAwesome name="check" size={16} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Fight List */}
          {fightsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading fights...</Text>
            </View>
          ) : sortedFights.length > 0 ? (
            <View style={styles.fightsContainer}>
              {/* Render based on sort order */}
              {sortBy === 'newest' ? (
                <>
                  {/* Upcoming Fights Section */}
                  {upcomingFights.length > 0 && (
                    <>
                      <View style={[styles.columnHeadersRow, { marginBottom: 12 }]}>
                        <View style={styles.columnHeadersUpcoming}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                        </View>
                        <View style={styles.columnHeadersUpcomingRight}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                        </View>
                      </View>
                      {upcomingFights.map((fight: Fight) => (
                        <FightDisplayCard
                          key={fight.id}
                          fight={fight}
                          onPress={() => handleFightPress(fight)}
                          showEvent={true}
                        />
                      ))}
                    </>
                  )}

                  {/* Completed Fights Section */}
                  {completedFights.length > 0 && (
                    <>
                      <View style={[styles.columnHeadersRow, { marginBottom: 12, marginTop: upcomingFights.length > 0 ? 20 : 0 }]}>
                        <View style={styles.columnHeadersCompleted}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATINGS</Text>
                        </View>
                        <View style={styles.columnHeadersCompletedRight}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATING</Text>
                        </View>
                      </View>
                      {completedFights.map((fight: Fight) => (
                        <FightDisplayCard
                          key={fight.id}
                          fight={fight}
                          onPress={() => handleFightPress(fight)}
                          showEvent={true}
                        />
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* Completed Fights Section (shown first for rating sorts) */}
                  {completedFights.length > 0 && (
                    <>
                      <View style={[styles.columnHeadersRow, { marginBottom: 12 }]}>
                        <View style={styles.columnHeadersCompleted}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATINGS</Text>
                        </View>
                        <View style={styles.columnHeadersCompletedRight}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATING</Text>
                        </View>
                      </View>
                      {completedFights.map((fight: Fight) => (
                        <FightDisplayCard
                          key={fight.id}
                          fight={fight}
                          onPress={() => handleFightPress(fight)}
                          showEvent={true}
                        />
                      ))}
                    </>
                  )}

                  {/* Upcoming Fights Section (shown last for rating sorts) */}
                  {upcomingFights.length > 0 && (
                    <>
                      <View style={[styles.columnHeadersRow, { marginBottom: 12, marginTop: completedFights.length > 0 ? 20 : 0 }]}>
                        <View style={styles.columnHeadersUpcoming}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                        </View>
                        <View style={styles.columnHeadersUpcomingRight}>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                          <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                        </View>
                      </View>
                      {upcomingFights.map((fight: Fight) => (
                        <FightDisplayCard
                          key={fight.id}
                          fight={fight}
                          onPress={() => handleFightPress(fight)}
                          showEvent={true}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </View>
          ) : (
            <View style={styles.noFightsContainer}>
              <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
                No fights found for this fighter.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <FontAwesome name="bell" size={16} color="#1a1a1a" />
          <Text style={[styles.toastText, { color: '#1a1a1a' }]}>{toastMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  fighterImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  headerInfoContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  fighterName: {
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  fighterNickname: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  fighterInfoText: {
    fontSize: 14,
    lineHeight: 18,
  },
  inlineFollowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineFollowButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  comingSoonText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  fightHistorySection: {
    marginTop: 8,
    marginBottom: 16,
  },
  fightsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  dropdownButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownMenu: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 16,
  },
  columnHeadersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  columnHeadersUpcoming: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginLeft: 5,
    width: 40,
    justifyContent: 'center',
  },
  columnHeadersUpcomingRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: 4,
    width: 40,
    justifyContent: 'center',
  },
  columnHeadersCompleted: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginLeft: -2,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersCompletedRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -5,
    width: 60,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 10,
    fontWeight: '600',
  },
  fightsContainer: {
    gap: 0,
    paddingHorizontal: 0,
  },
  noFightsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
});
