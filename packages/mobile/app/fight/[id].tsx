import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
  const [toastMessage, setToastMessage] = useState<string>('');

  // Animation for toast notification
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

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

    // Auto-dismiss after 3.5 seconds
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
    }, 3500);
  };

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

  // Mutation for toggling fight notification with proper optimistic updates
  const toggleNotificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiService.toggleFightNotification(id as string, enabled);
    },
    onMutate: async (enabled) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['fight', id, isAuthenticated] });

      // Snapshot the previous value
      const previousFight = queryClient.getQueryData(['fight', id, isAuthenticated]);

      // Optimistically update to the new value
      queryClient.setQueryData(['fight', id, isAuthenticated], (old: any) => {
        if (!old?.fight) return old;

        return {
          ...old,
          fight: {
            ...old.fight,
            notificationReasons: enabled
              ? {
                  willBeNotified: true,
                  reasons: [
                    ...(old.fight.notificationReasons?.reasons || []).filter((r: any) => r.isActive && r.type !== 'manual'),
                    {
                      type: 'manual' as const,
                      source: 'Manual Fight Follow',
                      isActive: true,
                    },
                  ],
                }
              : {
                  willBeNotified: false,
                  reasons: (old.fight.notificationReasons?.reasons || []).map((r: any) =>
                    r.type === 'manual' ? { ...r, isActive: false } : r
                  ),
                },
          },
        };
      });

      return { previousFight };
    },
    onError: (err, enabled, context: any) => {
      // Rollback on error
      if (context?.previousFight) {
        queryClient.setQueryData(['fight', id, isAuthenticated], context.previousFight);
      }
      console.error('Failed to toggle notification:', err);
    },
    onSuccess: (data, enabled) => {
      // Show toast when notification is enabled
      if (enabled) {
        showToast('You will get a notification right before this fight.');
      }
      // Only invalidate other queries that might show this fight's notification status
      // Don't invalidate the current fight query as it would overwrite our optimistic update
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
    },
  });

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

  // Toggle fight notification using mutation
  const handleToggleNotification = () => {
    const hasManualNotification = fight.notificationReasons?.reasons?.some(
      (r: any) => r.type === 'manual' && r.isActive
    );

    toggleNotificationMutation.mutate(!hasManualNotification);
  };

  const renderMenuButton = () => {
    // For upcoming fights, check if manual notification is set
    const hasManualNotification = !isComplete && fight.notificationReasons?.reasons?.some(
      (r: any) => r.type === 'manual' && r.isActive
    );

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        {/* Bell icon - always visible for upcoming fights, tappable to toggle notification */}
        {!isComplete && (
          <TouchableOpacity
            onPress={handleToggleNotification}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome
              name={hasManualNotification ? "bell" : "bell-o"}
              size={18}
              color={hasManualNotification ? colors.tint : colors.text}
            />
          </TouchableOpacity>
        )}

        {/* Three dots menu - separate from bell */}
        <TouchableOpacity
          onPress={() => setDetailsMenuVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <DetailScreenHeader
        title={fight ? `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}` : 'Fight Details'}
        rightIcon={renderMenuButton()}
      />

      {/* Route to appropriate component based on fight state */}
      {isComplete ? (
        <CompletedFightDetailScreen
          fight={fight}
          onRatingSuccess={handleSuccess}
          renderMenuButton={renderMenuButton}
          detailsMenuVisible={detailsMenuVisible}
          setDetailsMenuVisible={setDetailsMenuVisible}
        />
      ) : (
        <UpcomingFightDetailScreen
          fight={fight}
          onPredictionSuccess={handleSuccess}
          renderMenuButton={renderMenuButton}
          detailsMenuVisible={detailsMenuVisible}
          setDetailsMenuVisible={setDetailsMenuVisible}
        />
      )}

      {/* Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <FontAwesome name="bell" size={16} color="#10b981" />
          <Text style={[styles.toastText, { color: '#fff' }]}>{toastMessage}</Text>
        </Animated.View>
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
  toastContainer: {
    position: 'absolute',
    bottom: 100,
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
    zIndex: 1000,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
