import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { router } from 'expo-router';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate, formatMethod, getLastName } from './shared/utils';
import { sharedStyles } from './shared/styles';

interface CompletedFightCardProps extends BaseFightCardProps {
  animateRating?: boolean;
}

export default function CompletedFightCard({
  fight,
  onPress,
  showEvent = true,
  animateRating = false,
}: CompletedFightCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Image error states
  const [fighter1ImageError, setFighter1ImageError] = useState(false);
  const [fighter2ImageError, setFighter2ImageError] = useState(false);

  // Rating button press state
  const [isRatingPressed, setIsRatingPressed] = useState(false);

  // Show winner state (revealed when user taps or has rated)
  const [showWinner, setShowWinner] = useState(false);

  // Animated values for rating save animation (sparkles)
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const ratingGlowAnim = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;
  const sparkle4 = useRef(new Animated.Value(0)).current;
  const sparkle5 = useRef(new Animated.Value(0)).current;
  const sparkle6 = useRef(new Animated.Value(0)).current;
  const sparkle7 = useRef(new Animated.Value(0)).current;
  const sparkle8 = useRef(new Animated.Value(0)).current;

  // Fetch aggregate prediction stats
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', fight.id],
    queryFn: () => apiService.getFightPredictionStats(fight.id),
    staleTime: 30 * 1000,
  });

  // Fetch aggregate stats for completed fights
  const { data: aggregateStats } = useQuery({
    queryKey: ['fightAggregateStats', fight.id],
    queryFn: () => apiService.getFightAggregateStats(fight.id),
    staleTime: 60 * 1000,
  });

  // Reset image errors
  useEffect(() => {
    setFighter1ImageError(false);
    setFighter2ImageError(false);
  }, [fight.id]);

  // Trigger sparkle animation when rating is saved
  useEffect(() => {
    if (animateRating && fight.userRating) {
      // Reset sparkles
      sparkle1.setValue(0);
      sparkle2.setValue(0);
      sparkle3.setValue(0);
      sparkle4.setValue(0);
      sparkle5.setValue(0);
      sparkle6.setValue(0);
      sparkle7.setValue(0);
      sparkle8.setValue(0);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(ratingScaleAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
          Animated.spring(ratingScaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ratingGlowAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(ratingGlowAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(sparkle1, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle2, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle3, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle4, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle5, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle6, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle7, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(sparkle8, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [animateRating, fight.userRating, ratingScaleAnim, ratingGlowAnim, sparkle1, sparkle2, sparkle3, sparkle4, sparkle5, sparkle6, sparkle7, sparkle8]);

  // Determine which rings to show for each fighter
  const getFighterRings = (fighterId: string, fighterName: string) => {
    const rings = [];

    // Green ring - actual winner (show if user has rated OR tapped to reveal)
    if (fight.winner === fighterId && (fight.userRating || showWinner)) {
      rings.push('winner');
    }

    // Yellow ring - community prediction
    if (aggregateStats?.communityPrediction?.winner === fighterName) {
      rings.push('community');
    }

    // Blue ring - user's prediction
    if (aggregateStats?.userPrediction?.winner === fighterName) {
      rings.push('user');
    }

    return rings;
  };

  // Get outcome parts for split color rendering
  const getOutcomeParts = () => {
    if (!fight.isComplete || !fight.winner || !fight.method) return null;

    let winnerName = '';
    if (fight.winner === 'draw') {
      winnerName = 'Draw';
    } else if (fight.winner === 'nc') {
      winnerName = 'No Contest';
    } else if (fight.winner === fight.fighter1.id) {
      winnerName = fight.fighter1.lastName;
    } else if (fight.winner === fight.fighter2.id) {
      winnerName = fight.fighter2.lastName;
    } else {
      return null;
    }

    const methodText = fight.method ? ` by ${fight.method}` : '';
    const roundText = fight.round ? `R${fight.round}` : '';
    const timeText = fight.time ? ` ${fight.time}` : '';
    const roundTimeText = roundText || timeText ? ` - ${roundText}${timeText}` : '';

    if (fight.winner === 'draw' || fight.winner === 'nc') {
      return { winnerName, methodAndRound: roundTimeText };
    }

    return { winnerName, methodAndRound: `${methodText}${roundTimeText}` };
  };

  const getFighter1ImageSource = () => {
    if (fighter1ImageError) {
      return require('../../assets/fighters/fighter-default-alpha.png');
    }
    return getFighterImage(fight.fighter1);
  };

  const getFighter2ImageSource = () => {
    if (fighter2ImageError) {
      return require('../../assets/fighters/fighter-default-alpha.png');
    }
    return getFighterImage(fight.fighter2);
  };

  const outcomeParts = getOutcomeParts();

  return (
    <TouchableOpacity onPress={() => router.push(`/fight/${fight.id}`)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, { backgroundColor: colors.card, position: 'relative', minHeight: 200 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, minHeight: 30 }}>
          {fight.weightClass && (
            <Text style={[sharedStyles.titleLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {fight.weightClass.toUpperCase().replace(/_/g, ' ')}{fight.isTitle ? ' TITLE FIGHT' : ''}
            </Text>
          )}
        </View>

          {showEvent && (
            <Text style={[sharedStyles.eventText, { color: colors.textSecondary }]}>
              {fight.event.name} • {formatDate(fight.event.date)}
            </Text>
          )}

          <View style={styles.fighterNamesRow}>
            <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
              {cleanFighterName(getFighterName(fight.fighter1))}
            </Text>
            <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
              {cleanFighterName(getFighterName(fight.fighter2))}
            </Text>
          </View>

        {/* Fighter Headshots with Ratings Container */}
        <View style={styles.headshotsWithRatingsContainer}>
            {/* Fighter 1 with rings */}
            {(() => {
              const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
              const fighter1Rings = getFighterRings(fight.fighter1.id, fighter1Name);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 2;

              return (
                <View style={styles.fighterColumn}>
                  <View style={sharedStyles.fighterHeadshotWrapper}>
                    {fighter1Rings.map((ring, index) => {
                      const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : '#83B4F3';
                      const inset = index * (borderWidth + gap);

                      return (
                        <View
                          key={`${ring}-${index}`}
                          style={{
                            position: 'absolute',
                            top: inset,
                            left: inset,
                            right: inset,
                            bottom: inset,
                            borderWidth: borderWidth,
                            borderColor: ringColor,
                            borderRadius: 37.5,
                            zIndex: index,
                          }}
                        />
                      );
                    })}

                    <Image
                      source={getFighter1ImageSource()}
                      style={{
                        width: baseSize,
                        height: baseSize,
                        borderRadius: baseSize / 2,
                        zIndex: 100,
                      }}
                      onError={() => setFighter1ImageError(true)}
                    />
                  </View>
                </View>
              );
            })()}

            {/* Hype and Ratings Container - Between fighters */}
            <View style={styles.centeredScoresContainer}>
            {/* Hype Scores Section */}
            <View style={styles.centeredHypeScores}>
              {/* Community Hype Score */}
              <View style={styles.aggregateScoreContainer}>
                {/* Flame icon changes based on hype level */}
                {(() => {
                  const hypeScore = predictionStats?.averageHype || 0;
                  let flameIcon;

                  if (hypeScore >= 8.5) {
                    // Hot fight (8.5+) - flame with sparkle
                    flameIcon = require('../../assets/flame-sparkle-3.png');
                  } else if (hypeScore >= 7) {
                    // Warm fight (7-8.4) - full flame
                    flameIcon = require('../../assets/flame-full-2.png');
                  } else if (hypeScore > 0) {
                    // Cool fight (<7) - hollow flame
                    flameIcon = require('../../assets/flame-hollow-1.png');
                  } else {
                    // No hype data (0) - grey hollow flame
                    flameIcon = require('../../assets/flame-hollow-grey-0.png');
                  }

                  return (
                    <Image
                      source={flameIcon}
                      style={{ width: 20, height: 20, marginRight: 6 }}
                      resizeMode="contain"
                    />
                  );
                })()}
                <Text style={[sharedStyles.aggregateLabel, { color: predictionStats?.averageHype ? '#fff' : colors.textSecondary }]}>
                  {predictionStats?.averageHype !== undefined
                    ? (predictionStats.averageHype % 1 === 0 ? predictionStats.averageHype.toString() : predictionStats.averageHype.toFixed(1))
                    : '0'
                  }
                </Text>
              </View>

              {/* User's Personal Hype Score */}
              <View style={styles.userHypeContainer}>
                <View style={sharedStyles.ratingRow}>
                  {/* User hype flame icon changes based on score */}
                  {(() => {
                    const userHype = fight.userHypePrediction;
                    let userFlameIcon;
                    let flameColor;

                    if (!userHype) {
                      // No hype - grey hollow flame
                      userFlameIcon = require('../../assets/flame-hollow-grey-0.png');
                      flameColor = colors.textSecondary;
                    } else if (userHype >= 9) {
                      // High hype (9-10) - blue flame with sparkle
                      userFlameIcon = require('../../assets/flame-sparkle-blue-7.png');
                      flameColor = '#83B4F3';
                    } else if (userHype >= 7) {
                      // Medium hype (7-8) - full blue flame
                      userFlameIcon = require('../../assets/flame-full-blue-6.png');
                      flameColor = '#83B4F3';
                    } else {
                      // Low hype (1-6) - hollow blue flame
                      userFlameIcon = require('../../assets/flame-hollow-blue-8.png');
                      flameColor = '#83B4F3';
                    }

                    return (
                      <Image
                        source={userFlameIcon}
                        style={{ width: 20, height: 20, marginRight: 6 }}
                        resizeMode="contain"
                      />
                    );
                  })()}
                  <Text style={[sharedStyles.userRatingText, { color: fight.userHypePrediction ? '#83B4F3' : colors.textSecondary }]}>
                    {fight.userHypePrediction || '0'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Ratings Section */}
            <View style={styles.centeredRatings}>
            {/* Aggregate Rating */}
            <View style={styles.aggregateScoreContainer}>
              <FontAwesome
                name="star"
                size={20}
                color="#F5C518"
                style={{ marginRight: 6 }}
              />
              <Text style={[sharedStyles.aggregateLabel, { color: colors.text }]}>
                {fight.averageRating % 1 === 0 ? fight.averageRating.toString() : fight.averageRating.toFixed(1)}
              </Text>
              {aggregateStats?.totalRatings !== undefined && aggregateStats.totalRatings > 0 && (
                <Text style={[styles.countText, { color: colors.textSecondary }]}>
                  ({aggregateStats.totalRatings})
                </Text>
              )}
            </View>

            {/* User's Personal Rating */}
            <View style={styles.userRatingContainer}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPress(fight);
                }}
                onPressIn={() => setIsRatingPressed(true)}
                onPressOut={() => setIsRatingPressed(false)}
                activeOpacity={1}
                style={styles.ratingButton}
              >
                <View
                  style={[
                    styles.ratingContainer,
                    {
                      backgroundColor: isRatingPressed
                        ? 'rgba(131, 180, 243, 0.15)'
                        : 'transparent',
                    },
                  ]}
                >
                {/* Sparkles */}
                {fight.userRating && (
                  <>
                    {[sparkle1, sparkle2, sparkle3, sparkle4, sparkle5, sparkle6, sparkle7, sparkle8].map((sparkle, index) => {
                      const positions = [
                        { top: -10, right: -10, tx: 15, ty: -15 },
                        { top: -10, left: -10, tx: -15, ty: -15 },
                        { bottom: -10, right: -10, tx: 15, ty: 15 },
                        { bottom: -10, left: -10, tx: -15, ty: 15 },
                        { top: -10, left: 0, right: 0, tx: 0, ty: -20 },
                        { top: 2, right: -10, tx: 20, ty: 0 },
                        { bottom: -10, left: 0, right: 0, tx: 0, ty: 20 },
                        { top: 2, left: -10, tx: -20, ty: 0 },
                      ];
                      const pos = positions[index] as any;

                      return (
                        <Animated.View
                          key={index}
                          style={[
                            sharedStyles.sparkle,
                            pos,
                            {
                              opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                              transform: [
                                { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                              ],
                            },
                          ]}
                        >
                          <FontAwesome name="star" size={12} color="#F5C518" />
                        </Animated.View>
                      );
                    })}
                  </>
                )}

                {/* Glow effect */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: '#83B4F3',
                    borderRadius: 20,
                    opacity: ratingGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
                    transform: [{ scale: ratingGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                  }}
                />

                <Animated.View style={{ transform: [{ scale: ratingScaleAnim }] }}>
                  <View style={sharedStyles.ratingRow}>
                    <FontAwesome
                      name="star"
                      size={20}
                      color={fight.userRating ? "#83B4F3" : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[sharedStyles.userRatingText, { color: fight.userRating ? '#83B4F3' : colors.textSecondary }]}>
                      {fight.userRating || '0'}
                    </Text>
                  </View>
                </Animated.View>
              </View>
            </TouchableOpacity>
            </View>
            </View>
            </View>

            {/* Fighter 2 with rings */}
            {(() => {
              const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
              const fighter2Rings = getFighterRings(fight.fighter2.id, fighter2Name);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 2;

              return (
                <View style={styles.fighterColumn}>
                  <View style={sharedStyles.fighterHeadshotWrapper}>
                    {fighter2Rings.map((ring, index) => {
                      const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : '#83B4F3';
                      const inset = index * (borderWidth + gap);

                      return (
                        <View
                          key={`${ring}-${index}`}
                          style={{
                            position: 'absolute',
                            top: inset,
                            left: inset,
                            right: inset,
                            bottom: inset,
                            borderWidth: borderWidth,
                            borderColor: ringColor,
                            borderRadius: 37.5,
                            zIndex: index,
                          }}
                        />
                      );
                    })}

                    <Image
                      source={getFighter2ImageSource()}
                      style={{
                        width: baseSize,
                        height: baseSize,
                        borderRadius: baseSize / 2,
                        zIndex: 100,
                      }}
                      onError={() => setFighter2ImageError(true)}
                    />
                  </View>
                </View>
              );
            })()}
        </View>

        {/* Prediction Methods Section - Positioned below headshots */}
        <View
          key={`predictions-${aggregateStats?.userPrediction?.winner}-${aggregateStats?.communityPrediction?.winner}`}
          style={styles.predictionMethodsContainer}
        >
          {(() => {
            const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
            const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;

            // Special case: Draw or No Contest - always centered
            const isDraw = fight.winner === 'draw';
            const isNoContest = fight.winner === 'nc';
            if ((isDraw || isNoContest) && outcomeParts) {
              return (
                <View style={styles.predictionMethodsFullWidth}>
                  <View style={styles.predictionMethodColumnFull}>
                    <View style={styles.methodTextContainer}>
                      <Text style={[styles.methodText, { color: '#22c55e', textAlign: 'center' }]} numberOfLines={2}>
                        Outcome: {outcomeParts.winnerName}{outcomeParts.methodAndRound}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }

            // Fighter 1 predictions (left column) - MUST be boolean for layout logic
            const fighter1UserPrediction = aggregateStats?.userPrediction?.winner === fighter1Name;
            const fighter1CommunityPrediction = aggregateStats?.communityPrediction?.winner === fighter1Name && !!aggregateStats?.communityPrediction;
            const fighter1IsWinner = fight.winner === fight.fighter1.id;

            // Fighter 2 predictions (right column) - MUST be boolean for layout logic
            const fighter2UserPrediction = aggregateStats?.userPrediction?.winner === fighter2Name;
            const fighter2CommunityPrediction = aggregateStats?.communityPrediction?.winner === fighter2Name && !!aggregateStats?.communityPrediction;
            const fighter2IsWinner = fight.winner === fight.fighter2.id;

            // Check if ALL items (predictions + winner) are on opposite fighters
            const hasFighter1Item = fighter1UserPrediction || fighter1CommunityPrediction || fighter1IsWinner;
            const hasFighter2Item = fighter2UserPrediction || fighter2CommunityPrediction || fighter2IsWinner;
            const areOnOppositeSides = hasFighter1Item && hasFighter2Item;

            if (areOnOppositeSides) {
              // Items on opposite fighters - use 50/50 split
              return (
                <View style={styles.predictionMethodsRow}>
                  {/* Left column - Fighter 1 predictions (always rendered for spacing) */}
                  <View style={styles.predictionMethodColumn}>
                    {/* User prediction method - blue */}
                    {fighter1UserPrediction && (
                      <View style={styles.methodTextContainer}>
                        <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'left' }]} numberOfLines={3}>
                          My Prediction: {fight.fighter1.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                        </Text>
                      </View>
                    )}
                    {/* Community prediction method - yellow */}
                    {fighter1CommunityPrediction && (
                      <View style={styles.methodTextContainer}>
                        <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'left' }]} numberOfLines={3}>
                          Community Prediction: {fight.fighter1.lastName}{aggregateStats?.communityPrediction?.method ? ` by ${formatMethod(aggregateStats.communityPrediction.method)}` : ''}
                        </Text>
                      </View>
                    )}
                    {/* Winner - green */}
                    {fighter1IsWinner && outcomeParts && (fight.userRating || showWinner) && (
                      <View style={styles.methodTextContainer}>
                        <Text style={[styles.methodText, { color: '#22c55e', textAlign: 'left' }]} numberOfLines={2}>
                          Outcome: {outcomeParts.winnerName}{outcomeParts.methodAndRound}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Right column - Fighter 2 predictions (always rendered for spacing) */}
                  <View style={styles.predictionMethodColumn}>
                    {/* User prediction method - blue */}
                    {fighter2UserPrediction && (
                      <View style={styles.methodTextContainer}>
                        <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'right' }]} numberOfLines={3}>
                          My Prediction: {fight.fighter2.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                        </Text>
                      </View>
                    )}
                    {/* Community prediction method - yellow */}
                    {fighter2CommunityPrediction && (
                      <View style={styles.methodTextContainer}>
                        <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'right' }]} numberOfLines={3}>
                          Community Prediction: {fight.fighter2.lastName}{aggregateStats?.communityPrediction?.method ? ` by ${formatMethod(aggregateStats.communityPrediction.method)}` : ''}
                        </Text>
                      </View>
                    )}
                    {/* Winner - green */}
                    {fighter2IsWinner && outcomeParts && (fight.userRating || showWinner) && (
                      <View style={styles.methodTextContainer}>
                        <Text style={[styles.methodText, { color: '#22c55e', textAlign: 'right' }]} numberOfLines={2}>
                          Outcome: {outcomeParts.winnerName}{outcomeParts.methodAndRound}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            } else {
              // All items on same fighter - use full width
              return (
                <View style={[
                  styles.predictionMethodsFullWidth,
                  { justifyContent: hasFighter1Item ? 'flex-start' : 'flex-end' }
                ]}>
                  {/* Left column - Fighter 1 items */}
                  {hasFighter1Item && (
                    <View style={styles.predictionMethodColumnFull}>
                      {/* User prediction method - blue */}
                      {fighter1UserPrediction && (
                        <View style={styles.methodTextContainer}>
                          <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'left' }]} numberOfLines={3}>
                            My Prediction: {fight.fighter1.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                          </Text>
                        </View>
                      )}
                      {/* Community prediction method - yellow */}
                      {fighter1CommunityPrediction && (
                        <View style={styles.methodTextContainer}>
                          <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'left' }]} numberOfLines={3}>
                            Community Prediction: {fight.fighter1.lastName}{aggregateStats?.communityPrediction?.method ? ` by ${formatMethod(aggregateStats.communityPrediction.method)}` : ''}
                          </Text>
                        </View>
                      )}
                      {/* Winner - green */}
                      {fighter1IsWinner && outcomeParts && (fight.userRating || showWinner) && (
                        <View style={styles.methodTextContainer}>
                          <Text style={[styles.methodText, { color: '#22c55e', textAlign: 'left' }]} numberOfLines={2}>
                            Outcome: {outcomeParts.winnerName}{outcomeParts.methodAndRound}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Right column - Fighter 2 items */}
                  {hasFighter2Item && (
                    <View style={styles.predictionMethodColumnFull}>
                      {/* User prediction method - blue */}
                      {fighter2UserPrediction && (
                        <View style={styles.methodTextContainer}>
                          <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'right' }]} numberOfLines={3}>
                            My Prediction: {fight.fighter2.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                          </Text>
                        </View>
                      )}
                      {/* Community prediction method - yellow */}
                      {fighter2CommunityPrediction && (
                        <View style={styles.methodTextContainer}>
                          <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'right' }]} numberOfLines={3}>
                            Community Prediction: {fight.fighter2.lastName}{aggregateStats?.communityPrediction?.method ? ` by ${formatMethod(aggregateStats.communityPrediction.method)}` : ''}
                          </Text>
                        </View>
                      )}
                      {/* Winner - green */}
                      {fighter2IsWinner && outcomeParts && (fight.userRating || showWinner) && (
                        <View style={styles.methodTextContainer}>
                          <Text style={[styles.methodText, { color: '#22c55e', textAlign: 'right' }]} numberOfLines={2}>
                            Outcome: {outcomeParts.winnerName}{outcomeParts.methodAndRound}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            }
          })()}
        </View>

        {/* Fight Outcome Details */}
        {outcomeParts && (
          <View style={sharedStyles.outcomeContainer}>
            {/* Outcome and tags */}
            <View style={styles.outcomeWithTagsContainer}>

              {/* Pre-Fight Hype */}
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  How Hyped Was I?
                </Text>
                <View style={styles.hypeScoresRow}>
                  {aggregateStats?.userHypeScore ? (
                    <Text style={[styles.hypeScoreText, { color: colors.text }]}>
                      {aggregateStats.userHypeScore}
                    </Text>
                  ) : (
                    <Text style={[styles.hypeScoreText, { color: colors.text }]}>-</Text>
                  )}
                  {aggregateStats?.communityAverageHype && (
                    <>
                      <Text style={[styles.communityLabel, { color: colors.textSecondary }]}>
                        Community:
                      </Text>
                      <Text style={[styles.hypeScoreText, { color: colors.text }]}>
                        {aggregateStats.communityAverageHype}
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Tags - only show when user has rated */}
              {fight.userRating && aggregateStats?.topTags && aggregateStats.topTags.length > 0 && (
                <View style={styles.tagsInlineContainer}>
                  <View style={sharedStyles.iconContainer}>
                    <FontAwesome name="hashtag" size={11} color="#F5C518" />
                  </View>
                  {aggregateStats.topTags.slice(0, 3).map((tag, index) => (
                    <Text key={index} style={[styles.tagText, { color: colors.textSecondary }]}>
                      #{tag.name}{index < 2 ? ' ' : ''}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Three dots icon - bottom right - opens fight details */}
        <TouchableOpacity
          style={styles.threeDotsButton}
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/fight/${fight.id}`);
          }}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <FontAwesome name="ellipsis-h" size={27} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  aggregateScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 75,
  },
  countText: {
    fontSize: 10,
    fontWeight: '400',
    marginLeft: 6,
  },
  userRatingContainer: {
    position: 'relative',
    width: 75,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  ratingButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  ratingContainer: {
    position: 'relative',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  outcomeWithTagsContainer: {
    gap: 4,
  },
  hypeScoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  hypeScoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  communityLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tagsInlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    overflow: 'hidden',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  fighterNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
    gap: 8,
  },
  fighterNameLeft: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'left',
  },
  fighterNameRight: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  headshotsWithRatingsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  fighterColumn: {
    alignItems: 'center',
    gap: 4,
  },
  centeredScoresContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  centeredHypeScores: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  centeredRatings: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  userHypeContainer: {
    position: 'relative',
    width: 75,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  threeDotsButton: {
    position: 'absolute',
    top: 6,
    right: 12,
    padding: 8,
    zIndex: 20,
  },
  predictionMethodsContainer: {
    marginBottom: 2,
    paddingHorizontal: 0,
  },
  predictionMethodsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  predictionMethodsFullWidth: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  predictionMethodColumn: {
    flex: 1,
    gap: 2,
  },
  predictionMethodColumnFull: {
    gap: 2,
    width: '100%',
  },
  methodTextContainer: {
    position: 'relative',
    paddingHorizontal: 4,
  },
  methodText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
