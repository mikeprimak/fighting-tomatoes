import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { apiService, type Fight as ApiFight } from '../../services/api';
import { FightDisplayCard, RateFightModal } from '../../components';

// Helper function to extract user data from fight API response
const extractUserDataFromFight = (fight: any, userId: string) => {
  console.log('Extracting user data from fight:', { fightId: fight.id, userId });

  // Find user-specific data in the fight response
  let userRating = null;
  let userReview = null;
  let userTags = [];

  // Extract user rating
  if (fight.ratings && fight.ratings.length > 0) {
    const userRatingData = fight.ratings.find((r: any) => r.userId === userId);
    if (userRatingData) {
      userRating = {
        rating: userRatingData.rating,
        comment: userRatingData.comment,
        rawUserRating: userRatingData
      };
    }
  }

  // Extract user review
  if (fight.reviews && fight.reviews.length > 0) {
    const userReviewData = fight.reviews.find((r: any) => r.userId === userId);
    if (userReviewData) {
      userReview = {
        rating: userReviewData.rating,
        content: userReviewData.content,
        rawUserReview: userReviewData
      };
    }
  }

  // Extract user tags
  if (fight.userFightTags && fight.userFightTags.length > 0) {
    userTags = fight.userFightTags.filter((uft: any) => uft.userId === userId);
  }

  console.log('Extracted user data:', { userRating, userReview, userTags });

  return {
    ...fight,
    userRating,
    userReview,
    userTags: userTags?.length > 0 ? userTags : undefined,
  };
};

export default function FightsScreen() {
  const [selectedFight, setSelectedFight] = useState<any | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [processedFightId, setProcessedFightId] = useState<string | null>(null);

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { accessToken, user } = useAuth();
  const { fightId } = useLocalSearchParams<{ fightId?: string }>();

  const {
    data: fightsData,
    isLoading,
    refetch,
    isRefetching,
    error,
  } = useQuery({
    queryKey: ['fights', user?.id],
    queryFn: async () => {
      console.log('Fetching fights with user data:', !!user);
      const response = await apiService.getFights({
        includeUserData: !!user,
        limit: 50,
      });

      console.log('Received fights response:', {
        fightsCount: response.fights.length,
        firstFightUserData: response.fights[0] ? {
          id: response.fights[0].id,
          hasUserRating: !!response.fights[0].userRating,
          hasUserReview: !!response.fights[0].userReview,
          hasUserTags: !!response.fights[0].userTags
        } : null
      });

      return response;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if ((error as any)?.code === 'NO_TOKEN' || (error as any)?.status === 401) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const openRatingModal = async (fight: any) => {
    try {
      console.log('Opening rating modal for fight:', fight.id);
      console.log('Fight already has user data:', {
        hasUserRating: !!fight.userRating,
        hasUserReview: !!fight.userReview,
        hasUserTags: !!fight.userTags,
        userRating: fight.userRating,
        userReview: fight.userReview,
        userTags: fight.userTags
      });

      // Check if we already have user data from the initial query
      const hasUserData = fight.userRating || fight.userReview || (fight.userTags && fight.userTags.length > 0);

      if (user?.id && !hasUserData) {
        console.log('No user data found, fetching detailed fight data...');
        const { fight: detailedFight } = await apiService.getFight(fight.id);

        console.log('Detailed fight data received:', {
          hasUserRating: !!detailedFight.userRating,
          hasUserReview: !!detailedFight.userReview,
          hasUserTags: !!detailedFight.userTags,
          userRating: detailedFight.userRating,
          userReview: detailedFight.userReview,
          userTags: detailedFight.userTags
        });

        // Extract user-specific data from detailed fight
        const enrichedFight = extractUserDataFromFight(detailedFight, user.id);
        setSelectedFight(enrichedFight);
      } else {
        console.log('Using existing fight data (user data already present or user not logged in)');
        setSelectedFight(fight);
      }

      setShowRatingModal(true);
    } catch (error) {
      console.error('Error fetching detailed fight data:', error);
      console.log('Proceeding with basic fight data due to error');
      // If fetch fails, just proceed with basic data
      setSelectedFight(fight);
      setShowRatingModal(true);
    }
  };

  // Handle automatic modal opening when fightId is passed as parameter
  useEffect(() => {
    if (fightId && fightsData?.fights && !showRatingModal && processedFightId !== fightId) {
      const fight = fightsData.fights.find(f => f.id === fightId);
      if (fight) {
        console.log('Auto-opening modal for fight:', fightId);
        setProcessedFightId(fightId);
        openRatingModal(fight);
      }
    }
  }, [fightId, fightsData?.fights, showRatingModal, processedFightId]);

  const closeModal = () => {
    setSelectedFight(null);
    setShowRatingModal(false);
    setProcessedFightId(null);

    // Clear the fightId parameter from URL
    if (fightId) {
      router.setParams({ fightId: undefined });
    }
  };

  const renderFightCard = ({ item: fight }: { item: ApiFight }) => (
    <FightDisplayCard
      fight={fight}
      onPress={openRatingModal}
    />
  );

  const styles = createStyles(colors);

  // Handle loading and error states
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading fights...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {(error as any)?.error || 'Failed to load fights'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const fights = fightsData?.fights || [];

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={fights}
        keyExtractor={(item) => item.id}
        renderItem={renderFightCard}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Rating Modal */}
      <RateFightModal
        visible={showRatingModal}
        fight={selectedFight}
        onClose={closeModal}
        queryKey={['fights', user?.id]}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  listContainer: {
    padding: 16,
  },
});