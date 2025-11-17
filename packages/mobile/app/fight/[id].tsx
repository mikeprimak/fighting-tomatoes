import React, { useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { DetailScreenHeader, UpcomingFightDetailScreen, CompletedFightDetailScreen } from '../../components';

export default function FightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const [detailsMenuVisible, setDetailsMenuVisible] = useState(false);

  // Fetch fight details
  const { data: fightData, isLoading: fightLoading, error: fightError } = useQuery({
    queryKey: ['fight', id, isAuthenticated],
    queryFn: () => apiService.getFight(id as string),
    enabled: !!id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['fight', id] });
  };

  if (fightLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading fight details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (fightError || !fightData?.fight) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            Failed to load fight details
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { fight } = fightData;
  const isComplete = fight.isComplete;

  const renderMenuButton = () => {
    // Show bell if any notification is active for this fight
    const hasNotification = fight.isFollowing || fight.isFollowingFighter1 || fight.isFollowingFighter2 || fight.isHypedFight;

    return (
      <TouchableOpacity
        onPress={() => setDetailsMenuVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        {hasNotification && (
          <FontAwesome name="bell" size={18} color={colors.tint} />
        )}
        <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <DetailScreenHeader
        title={fight ? `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}` : 'Fight Details'}
        rightIcon={!isComplete ? renderMenuButton() : undefined}
      />

      {/* Route to appropriate component based on fight state */}
      {isComplete ? (
        <CompletedFightDetailScreen fight={fight} onRatingSuccess={handleSuccess} />
      ) : (
        <UpcomingFightDetailScreen
          fight={fight}
          onPredictionSuccess={handleSuccess}
          renderMenuButton={renderMenuButton}
          detailsMenuVisible={detailsMenuVisible}
          setDetailsMenuVisible={setDetailsMenuVisible}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
