import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { DetailScreenHeader, FightDisplayCard, RateFightModal } from '../../components';
import { useAuth } from '../../store/AuthContext';

interface Fight {
  id: string;
  fighter1: any;
  fighter2: any;
  event: {
    id: string;
    name: string;
    date: string;
    promotion: string;
  };
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  hasStarted: boolean;
  isComplete: boolean;
  winner?: string;
  method?: string;
  round?: number;
  time?: string;
  averageRating: number;
  totalRatings: number;
  totalReviews: number;
  userRating?: number;
  userReview?: any;
  userTags?: any[];
}

type SortOption = 'newest' | 'oldest' | 'highest-rating' | 'most-rated';

const SORT_OPTIONS = [
  { value: 'newest' as SortOption, label: 'Newest First' },
  { value: 'oldest' as SortOption, label: 'Oldest First' },
  { value: 'highest-rating' as SortOption, label: 'Highest Rating' },
  { value: 'most-rated' as SortOption, label: 'Most Rated' },
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

  // State
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

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

        {/* Fighter Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Fighter Information</Text>

          {fighter.weightClass && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Weight Class:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.weightClass}</Text>
            </View>
          )}

          {fighter.record && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Record:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.record}</Text>
            </View>
          )}

          {fighter.country && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Country:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.country}</Text>
            </View>
          )}
        </View>

        {/* Placeholder for future stats */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Career Stats</Text>
          <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
            Detailed statistics coming soon...
          </Text>
        </View>

        {/* Fight History */}
        <View style={styles.fightHistorySection}>
          <Text style={[styles.sectionTitle, styles.fightHistoryTitle, { color: colors.text }]}>
            Fight History ({sortedFights.length} fights)
          </Text>

          {/* Sort Selector */}
          {sortedFights.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.sortContainer}
              contentContainerStyle={styles.sortContentContainer}
            >
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setSortBy(option.value)}
                  style={[
                    styles.sortButton,
                    {
                      backgroundColor: sortBy === option.value ? colors.primary : colors.card,
                      borderColor: sortBy === option.value ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      {
                        color: sortBy === option.value ? colors.textOnAccent : colors.text,
                        fontWeight: sortBy === option.value ? '600' : '400',
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  sortContentContainer: {
    paddingRight: 16,
  },
  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  sortButtonText: {
    fontSize: 14,
  },
  fightsContainer: {
    gap: 12,
    paddingHorizontal: 16,
  },
  noFightsContainer: {
    padding: 20,
    alignItems: 'center',
  },
});
