import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { apiService, Fight } from '../../../services/api';
import { FightDisplayCard, RateFightModal } from '../../../components';
import { useAuth } from '../../../store/AuthContext';
import { FontAwesome } from '@expo/vector-icons';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
  weightClass?: string;
  rank?: string;
  createdAt: string;
}

// Fighter image selection logic (same as other components)
const getFighterImage = (fighterId: string) => {
  const images = [
    require('../../../assets/fighters/fighter-1.jpg'),
    require('../../../assets/fighters/fighter-2.jpg'),
    require('../../../assets/fighters/fighter-3.jpg'),
    require('../../../assets/fighters/fighter-4.jpg'),
    require('../../../assets/fighters/fighter-5.jpg'),
    require('../../../assets/fighters/fighter-6.jpg'),
  ];

  // Use charCodeAt to get a number from the last character (works for letters and numbers)
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

type SortOption = 'newest' | 'oldest' | 'highest-rating' | 'most-rated';

const SORT_OPTIONS = [
  { value: 'newest' as SortOption, label: 'Newest First' },
  { value: 'oldest' as SortOption, label: 'Oldest First' },
  { value: 'highest-rating' as SortOption, label: 'Highest Rating' },
  { value: 'most-rated' as SortOption, label: 'Most Rated' },
];

export default function FighterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Modal state
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Fetch fighter details
  const { data: fighterData, isLoading: fighterLoading, error: fighterError } = useQuery({
    queryKey: ['fighter', id],
    queryFn: () => apiService.getFighter(id as string),
    enabled: !!id,
  });

  // Fetch fighter's fights
  const { data: fightsData, isLoading: fightsLoading, error: fightsError } = useQuery({
    queryKey: ['fighterFights', id, isAuthenticated],
    queryFn: async () => {
      console.log('Fetching fights for fighter:', id, 'with user data:', isAuthenticated);
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
      console.log('Opening rating modal for fight:', fight.id);

      // Check if we already have user data from the initial query
      const hasUserData = fight.userRating || fight.userReview || (fight.userTags && fight.userTags.length > 0);

      if (user?.id && !hasUserData) {
        console.log('No user data found, fetching detailed fight data...');
        const { fight: detailedFight } = await apiService.getFight(fight.id);

        // Update the selected fight with enriched data
        const enrichedFight = {
          ...fight,
          userRating: detailedFight.userRating,
          userReview: detailedFight.userReview,
          userTags: detailedFight.userTags
        };

        setSelectedFight(enrichedFight);
      } else {
        console.log('Using existing fight data');
        setSelectedFight(fight);
      }

      setShowRatingModal(true);
    } catch (error) {
      console.error('Error fetching detailed fight data:', error);
      // If fetch fails, just proceed with basic data
      setSelectedFight(fight);
      setShowRatingModal(true);
    }
  };

  const closeModal = () => {
    setSelectedFight(null);
    setShowRatingModal(false);
  };

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };


  if (fighterLoading || fightsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading fighter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (fighterError || fightsError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Error loading fighter details
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.backButtonText, { color: colors.textOnAccent }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fighter = fighterData?.fighter;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <FontAwesome name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Fighter Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Fighter Profile Section */}
        {fighter && (
          <View style={[styles.profileSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Image
              source={getFighterImage(fighter.id)}
              style={styles.profileImage}
              resizeMode="cover"
            />

            <View style={styles.profileInfo}>
              <Text style={[styles.fighterName, { color: colors.text }]}>
                {getFighterName(fighter)}
              </Text>

              <View style={styles.recordContainer}>
                <Text style={[styles.record, { color: colors.primary }]}>
                  {fighter.wins}-{fighter.losses}-{fighter.draws}
                </Text>
                <Text style={[styles.recordLabel, { color: colors.textSecondary }]}>
                  W-L-D
                </Text>
              </View>

              {/* Fighter Stats */}
              <View style={styles.statsContainer}>
                {fighter.rank && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rank</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{fighter.rank}</Text>
                  </View>
                )}
                {fighter.weightClass && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Weight Class</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{fighter.weightClass}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Fight History Section */}
        <View style={styles.fightsSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              FIGHT HISTORY ({sortedFights.length} fights)
            </Text>
          </View>

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

          {sortedFights.length > 0 ? (
            sortedFights.map((fight: Fight) => (
              <View key={fight.id} style={styles.fightCard}>
                <FightDisplayCard
                  fight={fight}
                  onPress={() => handleFightPress(fight)}
                  showEvent={true}
                />
              </View>
            ))
          ) : (
            <View style={styles.noFightsContainer}>
              <Text style={[styles.noFightsText, { color: colors.textSecondary }]}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backIcon: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scrollContainer: {
    paddingBottom: 20,
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
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  profileSection: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  profileImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#ddd',
  },
  profileInfo: {
    alignItems: 'center',
    width: '100%',
  },
  fighterName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  recordContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  record: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  recordLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  statItem: {
    width: '48%',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  fightsSection: {
    marginTop: 8,
  },
  sectionHeader: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sortContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
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
  fightCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  noFightsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  noFightsText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
