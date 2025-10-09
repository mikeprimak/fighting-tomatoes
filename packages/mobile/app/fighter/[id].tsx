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
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import { apiService, Fight } from '../../services/api';
import { DetailScreenHeader, FightDisplayCard, RateFightModal } from '../../components';
import { useAuth } from '../../store/AuthContext';
import { FontAwesome } from '@expo/vector-icons';

type SortOption = 'newest' | 'oldest' | 'highest-rating' | 'most-rated';

const SORT_OPTIONS = [
  { value: 'newest' as SortOption, label: 'Date' },
  { value: 'highest-rating' as SortOption, label: 'Rating' },
  { value: 'most-rated' as SortOption, label: 'Number of Ratings' },
];

// Placeholder image selection for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  const images = [
    require('../../assets/fighters/fighter-1.jpg'),
    require('../../assets/fighters/fighter-2.jpg'),
    require('../../assets/fighters/fighter-3.jpg'),
    require('../../assets/fighters/fighter-4.jpg'),
    require('../../assets/fighters/fighter-5.jpg'),
    require('../../assets/fighters/fighter-6.jpg'),
  ];
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function FighterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();

  // State
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
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
        showToast(`You will be notified on days ${fighter.firstName} ${fighter.lastName} fights!`);
      }

      // Force an immediate refetch of the fighter data
      await queryClient.refetchQueries({ queryKey: ['fighter', id] });
    },
  });

  const handleFollowPress = () => {
    if (!isAuthenticated) {
      return;
    }
    const isCurrentlyFollowing = fighter?.isFollowing || false;
    followMutation.mutate(isCurrentlyFollowing);
  };

  // Sort fights based on selected option
  const sortedFights = useMemo(() => {
    const fights = fightsData?.fights || [];
    if (fights.length === 0) return fights;

    const fightsCopy = [...fights];

    switch (sortBy) {
      case 'newest':
        return fightsCopy.sort((a: Fight, b: Fight) =>
          new Date(b.event.date).getTime() - new Date(a.event.date).getTime()
        );
      case 'oldest':
        return fightsCopy.sort((a: Fight, b: Fight) =>
          new Date(a.event.date).getTime() - new Date(b.event.date).getTime()
        );
      case 'highest-rating':
        return fightsCopy.sort((a: Fight, b: Fight) =>
          (b.averageRating || 0) - (a.averageRating || 0)
        );
      case 'most-rated':
        return fightsCopy.sort((a: Fight, b: Fight) =>
          (b.totalRatings || 0) - (a.totalRatings || 0)
        );
      default:
        return fightsCopy;
    }
  }, [fightsData?.fights, sortBy]);

  const handleFightPress = async (fight: Fight) => {
    try {
      const hasUserData = fight.userRating || fight.userReview || (fight.userTags && fight.userTags.length > 0);

      if (isAuthenticated && !hasUserData) {
        const { fight: detailedFight } = await apiService.getFight(fight.id);
        const enrichedFight = {
          ...fight,
          userRating: detailedFight.userRating,
          userReview: detailedFight.userReview,
          userTags: detailedFight.userTags
        };
        setSelectedFight(enrichedFight);
      } else {
        setSelectedFight(fight);
      }
      setShowRatingModal(true);
    } catch (error) {
      console.error('Error fetching detailed fight data:', error);
      setSelectedFight(fight);
      setShowRatingModal(true);
    }
  };

  const closeModal = () => {
    setSelectedFight(null);
    setShowRatingModal(false);
  };

  const fighter = fighterData?.fighter;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter Details" />
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
        <DetailScreenHeader title="Fighter Details" />
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
        title={`${fighter.firstName} ${fighter.lastName}`}
        subtitle={fighter.nickname ? `"${fighter.nickname}"` : undefined}
      />

      <ScrollView style={styles.scrollView}>
        {/* Fighter Image */}
        <View style={styles.imageContainer}>
          <Image
            source={
              fighter.profileImage
                ? { uri: fighter.profileImage }
                : getFighterPlaceholderImage(fighter.id)
            }
            style={styles.fighterImage}
          />
        </View>

        {/* Follow Button */}
        {isAuthenticated && (
          <View style={styles.followButtonContainer}>
            <TouchableOpacity
              onPress={handleFollowPress}
              disabled={followMutation.isPending}
              style={[
                styles.followButton,
                fighter.isFollowing
                  ? { backgroundColor: colors.card, borderColor: colors.border }
                  : { backgroundColor: colors.primary }
              ]}
            >
              {followMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
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
                      size={16}
                      color={fighter.isFollowing ? '#ef4444' : '#1a1a1a'}
                    />
                  </Animated.View>
                  <Text
                    style={[
                      styles.followButtonText,
                      { color: fighter.isFollowing ? '#fff' : '#1a1a1a' }
                    ]}
                  >
                    {fighter.isFollowing
                      ? `Following ${fighter.firstName} ${fighter.lastName}`
                      : `Follow ${fighter.firstName} ${fighter.lastName}`
                    }
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Fighter Details */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Fighter Details</Text>

          {fighter.nickname && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Nickname:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>"{fighter.nickname}"</Text>
            </View>
          )}

          {fighter.rank && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Rank:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.rank}</Text>
            </View>
          )}

          {fighter.weightClass && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Weight Class:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.weightClass}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Record:</Text>
            <Text style={[styles.infoValue, { color: colors.primary, fontWeight: '600' }]}>
              {fighter.wins}-{fighter.losses}-{fighter.draws}
            </Text>
          </View>
        </View>

        {/* Fight History */}
        <View style={styles.fightHistorySection}>
          <Text style={[styles.sectionTitle, styles.fightHistoryTitle, { color: colors.text }]}>
            Fight History
          </Text>

          {/* Sort Dropdown */}
          {sortedFights.length > 0 && (
            <View style={styles.sortContainer}>
              <TouchableOpacity
                onPress={() => setShowSortDropdown(true)}
                style={[styles.dropdownButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.dropdownButtonText, { color: colors.text }]}>
                  Sort by: {SORT_OPTIONS.find(opt => opt.value === sortBy)?.label}
                </Text>
                <FontAwesome name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>

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
            </View>
          )}

          {/* Fight List */}
          {fightsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading fights...</Text>
            </View>
          ) : sortedFights.length > 0 ? (
            <View style={styles.fightsContainer}>
              {sortedFights.map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => handleFightPress(fight)}
                  showEvent={true}
                />
              ))}
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

      {/* Rating Modal */}
      <RateFightModal
        visible={showRatingModal}
        fight={selectedFight}
        onClose={closeModal}
        queryKey={['fighterFights', id]}
      />

      {/* Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              backgroundColor: colors.primary,
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <FontAwesome name="bell" size={16} color="#1a1a1a" />
          <Text style={styles.toastText}>{toastMessage}</Text>
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
  imageContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  fighterImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  infoCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  comingSoonText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  fightHistorySection: {
    marginTop: 8,
    marginBottom: 16,
  },
  fightHistoryTitle: {
    marginHorizontal: 16,
    marginBottom: 4,
  },
  sortContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontWeight: '500',
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
  fightsContainer: {
    gap: 12,
    paddingHorizontal: 16,
  },
  noFightsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  followButtonContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  followButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
});
