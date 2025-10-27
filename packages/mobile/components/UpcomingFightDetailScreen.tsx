import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
} from 'react-native';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { CommunityPredictionsCard } from './CommunityPredictionsCard';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  profileImage?: string | null;
  wins: number;
  losses: number;
  draws: number;
}

interface Event {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  venue?: string | null;
  mainStartTime?: string | null;
  prelimStartTime?: string | null;
  earlyPrelimStartTime?: string | null;
}

interface Fight {
  id: string;
  fighter1: Fighter;
  fighter2: Fighter;
  fighter1Odds?: string | null;
  fighter2Odds?: string | null;
  fighter1Ranking?: number | null;
  fighter2Ranking?: number | null;
  weightClass?: string | null;
  isTitle: boolean;
  event: Event;
  hasStarted: boolean;
  isComplete: boolean;
  userPredictedWinner?: string | null;
  userPredictedMethod?: string | null;
  userPredictedRound?: number | null;
  userHypePrediction?: number | null;
}

interface UpcomingFightDetailScreenProps {
  fight: Fight;
  onPredictionSuccess?: () => void;
}

export default function UpcomingFightDetailScreen({ fight, onPredictionSuccess }: UpcomingFightDetailScreenProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();

  // Local state for selections (will be saved immediately on change)
  const [selectedWinner, setSelectedWinner] = useState<string | null>(fight.userPredictedWinner || null);
  const [selectedHype, setSelectedHype] = useState<number | null>(fight.userHypePrediction || null);

  // Fetch prediction stats
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', fight.id],
    queryFn: () => apiService.getFightPredictionStats(fight.id),
    enabled: !!fight.id,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // Fetch aggregate stats (includes community prediction)
  const { data: aggregateStats } = useQuery({
    queryKey: ['fightAggregateStats', fight.id],
    queryFn: () => apiService.getFightAggregateStats(fight.id),
    enabled: !!fight.id,
    staleTime: 60 * 1000,
  });

  // Auto-save winner selection
  const saveWinnerMutation = useMutation({
    mutationFn: async (winnerId: string | null) => {
      if (!winnerId) {
        // If deselecting, we'd need a DELETE endpoint or send null
        // For now, just return early
        return { prediction: null, message: '' };
      }
      return apiService.createFightPrediction(fight.id, {
        predictedWinner: winnerId,
        // Keep existing values
        predictedMethod: fight.userPredictedMethod as 'DECISION' | 'KO_TKO' | 'SUBMISSION' | undefined,
        predictedRound: fight.userPredictedRound || undefined,
        predictedRating: selectedHype || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight.id] });
      onPredictionSuccess?.();
    },
  });

  // Auto-save hype selection
  const saveHypeMutation = useMutation({
    mutationFn: async (hypeLevel: number | null) => {
      if (!hypeLevel) {
        return { prediction: null, message: '' };
      }
      return apiService.createFightPrediction(fight.id, {
        predictedRating: hypeLevel,
        // Keep existing values
        predictedWinner: selectedWinner || undefined,
        predictedMethod: fight.userPredictedMethod as 'DECISION' | 'KO_TKO' | 'SUBMISSION' | undefined,
        predictedRound: fight.userPredictedRound || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight.id] });
      onPredictionSuccess?.();
    },
  });

  const handleWinnerSelection = (fighterId: string) => {
    const newWinner = selectedWinner === fighterId ? null : fighterId;
    setSelectedWinner(newWinner);
    saveWinnerMutation.mutate(newWinner);
  };

  const handleHypeSelection = (level: number) => {
    const newHype = selectedHype === level ? level : level;
    setSelectedHype(newHype);
    saveHypeMutation.mutate(newHype);
  };

  // Helper function to format weight class
  const formatWeightClass = (weightClass: string) => {
    return weightClass
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]}>


      {/* Who Do You Think Will Win? */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Who do you think will win?
        </Text>
        <View style={styles.fighterButtons}>
          <TouchableOpacity
            style={[
              styles.fighterButton,
              {
                backgroundColor: selectedWinner === fight.fighter1.id ? '#83B4F3' : colors.background,
                borderColor: colors.border,
              }
            ]}
            onPress={() => handleWinnerSelection(fight.fighter1.id)}
          >
            <Image
              source={
                fight.fighter1.profileImage
                  ? { uri: fight.fighter1.profileImage }
                  : getFighterPlaceholderImage(fight.fighter1.id)
              }
              style={styles.fighterButtonImage}
            />
            <Text style={[
              styles.fighterButtonText,
              {
                color: selectedWinner === fight.fighter1.id ? '#1a1a1a' : colors.text
              }
            ]}>
              {fight.fighter1.lastName}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.fighterButton,
              {
                backgroundColor: selectedWinner === fight.fighter2.id ? '#83B4F3' : colors.background,
                borderColor: colors.border,
              }
            ]}
            onPress={() => handleWinnerSelection(fight.fighter2.id)}
          >
            <Image
              source={
                fight.fighter2.profileImage
                  ? { uri: fight.fighter2.profileImage }
                  : getFighterPlaceholderImage(fight.fighter2.id)
              }
              style={styles.fighterButtonImage}
            />
            <Text style={[
              styles.fighterButtonText,
              {
                color: selectedWinner === fight.fighter2.id ? '#1a1a1a' : colors.text
              }
            ]}>
              {fight.fighter2.lastName}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* How Hyped Are You? */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          How hyped are you?
        </Text>

        {/* Large display flame */}
        <View style={styles.displayFlameContainer}>
          {(() => {
            let flameIcon;
            if (!selectedHype || selectedHype === 0) {
              flameIcon = require('../assets/grey-hollow-160.png');
            } else if (selectedHype >= 9) {
              flameIcon = require('../assets/blue-full-sparkle-160.png');
            } else if (selectedHype >= 7) {
              flameIcon = require('../assets/blue-full-160.png');
            } else {
              flameIcon = require('../assets/blue-hollow-160.png');
            }
            return (
              <View style={styles.flameWithNumber}>
                <Image
                  source={flameIcon}
                  style={{ width: 80, height: 80 }}
                  resizeMode="contain"
                />
                {selectedHype ? (
                  <Text style={[styles.flameNumber, { color: colors.text }]}>{selectedHype}</Text>
                ) : null}
              </View>
            );
          })()}
        </View>

        {/* Row of selectable flames (1-10) */}
        <View style={styles.flameContainer}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
            const isSelected = level <= (selectedHype || 0);
            const flameIcon = isSelected
              ? require('../assets/blue-full-no-sparkle-160.png')
              : require('../assets/grey-hollow-160.png');

            return (
              <TouchableOpacity
                key={level}
                onPress={() => handleHypeSelection(level)}
                style={styles.flameButton}
              >
                <Image
                  source={flameIcon}
                  style={{ width: 30, height: 30 }}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Hype Score Row */}
      <View style={styles.splitScoreRow}>
        {/* Aggregate Hype - Left */}
        <View style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.scoreRow}>
            <FontAwesome6 name="fire-flame-curved" size={28} color="#FF6B35" />
            <Text style={[styles.halfScoreValue, { color: colors.text }]}>
              {predictionStats?.averageHype !== undefined
                ? predictionStats.averageHype % 1 === 0
                  ? predictionStats.averageHype.toString()
                  : predictionStats.averageHype.toFixed(1)
                : '0'}
            </Text>
          </View>
          <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
            Community Hype
          </Text>
        </View>

        {/* My Hype - Right */}
        <View style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.scoreRow}>
            <FontAwesome6 name="fire-flame-curved" size={28} color="#83B4F3" />
            <Text style={[styles.halfScoreValue, { color: colors.text }]}>
              {selectedHype || ''}
            </Text>
          </View>
          <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
            You
          </Text>
        </View>
      </View>

      {/* Community Predictions */}
      {predictionStats && (
        <CommunityPredictionsCard
          predictionStats={predictionStats}
          userPrediction={selectedWinner ? {
            winner: selectedWinner === fight.fighter1.id
              ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
              : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
            method: fight.userPredictedMethod
          } : null}
          onPress={() => {}}
        />
      )}

      {/* Fight Details */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Fight Details</Text>

        {/* Event Name */}
        {fight.event?.name && (
          <View style={styles.infoRow}>
            <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.event.name}
            </Text>
          </View>
        )}

        {/* Event Date */}
        {fight.event?.date && (
          <View style={styles.infoRow}>
            <FontAwesome name="calendar-o" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {new Date(fight.event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
            </Text>
          </View>
        )}

        {/* Main Card Start Time */}
        {fight.event?.mainStartTime && (
          <View style={styles.infoRow}>
            <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Main Card: {new Date(fight.event.mainStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
            </Text>
          </View>
        )}

        {/* Prelim Start Time */}
        {fight.event?.prelimStartTime && (
          <View style={styles.infoRow}>
            <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Prelims: {new Date(fight.event.prelimStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
            </Text>
          </View>
        )}

        {/* Early Prelim Start Time */}
        {fight.event?.earlyPrelimStartTime && (
          <View style={styles.infoRow}>
            <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Early Prelims: {new Date(fight.event.earlyPrelimStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
            </Text>
          </View>
        )}

        {/* Fighter 1 Stats */}
        <View style={styles.infoRow}>
          <FontAwesome name="user" size={16} color={colors.textSecondary} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            {fight.fighter1.firstName} {fight.fighter1.lastName}: {fight.fighter1.wins}-{fight.fighter1.losses}-{fight.fighter1.draws}
            {fight.fighter1Ranking && fight.weightClass && ` (#${fight.fighter1Ranking} ${formatWeightClass(fight.weightClass)})`}
          </Text>
        </View>

        {/* Fighter 2 Stats */}
        <View style={styles.infoRow}>
          <FontAwesome name="user" size={16} color={colors.textSecondary} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            {fight.fighter2.firstName} {fight.fighter2.lastName}: {fight.fighter2.wins}-{fight.fighter2.losses}-{fight.fighter2.draws}
            {fight.fighter2Ranking && fight.weightClass && ` (#${fight.fighter2Ranking} ${formatWeightClass(fight.weightClass)})`}
          </Text>
        </View>

        {/* Weight Class */}
        {fight.weightClass && (
          <View style={styles.infoRow}>
            <FontAwesome name="trophy" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.isTitle ? `${formatWeightClass(fight.weightClass)} Championship` : formatWeightClass(fight.weightClass)}
            </Text>
          </View>
        )}

        {/* Event Location */}
        {fight.event?.location && (
          <View style={styles.infoRow}>
            <FontAwesome name="map-marker" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.event.location}
            </Text>
          </View>
        )}

        {/* Arena/Venue */}
        {fight.event?.venue && (
          <View style={styles.infoRow}>
            <FontAwesome name="building-o" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.event.venue}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  section: {
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  fighterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fighterButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  fighterButtonImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  fighterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  displayFlameContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  flameWithNumber: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameNumber: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: 'bold',
  },
  flameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  flameButton: {
    padding: 4,
  },
  splitScoreRow: {
    flexDirection: 'row',
    marginHorizontal: 4,
    marginBottom: 16,
    gap: 12,
  },
  halfScoreContainer: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  halfScoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  halfScoreLabel: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    marginLeft: 12,
    flex: 1,
  },
});
