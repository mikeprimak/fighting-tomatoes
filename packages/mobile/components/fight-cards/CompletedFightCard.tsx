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

    // Green ring - actual winner (only show if user has rated)
    if (fight.winner === fighterId && fight.userRating) {
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

  const outcomeParts = getOutcomeText();

  return (
    <TouchableOpacity onPress={() => router.push(`/fight/${fight.id}`)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, { backgroundColor: colors.card }]}>
        {fight.isTitle && (
          <Text style={[sharedStyles.titleLabel, { color: colors.tint }]}>
            TITLE FIGHT
          </Text>
        )}

        {showEvent && (
          <Text style={[sharedStyles.eventText, { color: colors.textSecondary }]}>
            {fight.event.name} • {formatDate(fight.event.date)}
          </Text>
        )}

        <Text style={[sharedStyles.matchup, { color: colors.text }]}>
          {cleanFighterName(getFighterName(fight.fighter1))} vs {cleanFighterName(getFighterName(fight.fighter2))}
        </Text>

        <View style={sharedStyles.horizontalInfoRow}>
          {/* Fighter Headshots with Rings */}
          <View style={sharedStyles.headshotsContainer}>
            {/* Fighter 1 with rings */}
            {(() => {
              const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
              const fighter1Rings = getFighterRings(fight.fighter1.id, fighter1Name);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 1;

              return (
                <View style={[sharedStyles.fighterHeadshotWrapper, { position: 'relative' }]}>
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
              );
            })()}

            {/* Fighter 2 with rings */}
            {(() => {
              const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
              const fighter2Rings = getFighterRings(fight.fighter2.id, fighter2Name);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 1;

              return (
                <View style={[sharedStyles.fighterHeadshotWrapper, { position: 'relative' }]}>
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
              );
            })()}
          </View>

          {/* Ratings Wrapper */}
          <View style={sharedStyles.ratingsWrapper}>
            {/* Aggregate Rating */}
            <View style={{ width: 100 }}>
              <View style={styles.aggregateRatingContainer}>
                <View style={sharedStyles.ratingRow}>
                  <FontAwesome
                    name="star"
                    size={30}
                    color="#F5C518"
                    style={sharedStyles.ratingIcon}
                  />
                  <Text style={[sharedStyles.aggregateLabel, { color: colors.text }]}>
                    {fight.averageRating % 1 === 0 ? fight.averageRating.toString() : fight.averageRating.toFixed(1)}
                  </Text>
                </View>
                <View style={styles.countsColumn}>
                  <View style={styles.countRow}>
                    <FontAwesome
                      name="user-o"
                      size={12}
                      color={colors.textSecondary}
                      style={styles.countIcon}
                    />
                    <Text style={[styles.countText, { color: colors.textSecondary }]}>
                      {aggregateStats?.totalRatings || 0}
                    </Text>
                  </View>
                  <View style={styles.countRow}>
                    <FontAwesome
                      name="comment-o"
                      size={12}
                      color={colors.textSecondary}
                      style={styles.countIcon}
                    />
                    <Text style={[styles.countText, { color: colors.textSecondary }]}>
                      {aggregateStats?.reviewCount || 0}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* User's Personal Rating */}
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
                        { top: -10, left: '50%', marginLeft: -6, tx: 0, ty: -20 },
                        { top: 2, right: -10, tx: 20, ty: 0 },
                        { bottom: -10, left: '50%', marginLeft: -6, tx: 0, ty: 20 },
                        { top: 2, left: -10, tx: -20, ty: 0 },
                      ];
                      const pos = positions[index];

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
                    <View style={styles.starWithCommentContainer}>
                      <FontAwesome
                        name={fight.userRating ? "star" : "star-o"}
                        size={30}
                        color="#83B4F3"
                        style={sharedStyles.ratingIcon}
                      />
                    </View>
                    <View style={styles.ratingColumnWrapper}>
                      {fight.userRating ? (
                        <Text style={[sharedStyles.userRatingText, { color: '#83B4F3' }]}>
                          {fight.userRating}
                        </Text>
                      ) : (
                        <Text style={[sharedStyles.unratedText, { color: '#83B4F3' }]}>
                          Rate{'\n'}This
                        </Text>
                      )}
                    </View>
                  </View>
                </Animated.View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fight Outcome Details */}
        {outcomeParts && (
          <View style={sharedStyles.outcomeContainer}>
            {/* My Prediction */}
            {aggregateStats?.userPrediction ? (
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome name="eye" size={12} color="#83B4F3" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  My Prediction:
                </Text>
                <Text style={[sharedStyles.outcomeLineText, { flex: 1 }]} numberOfLines={1}>
                  <Text style={{ color: colors.text }}>
                    {getLastName(aggregateStats.userPrediction.winner) || 'N/A'}
                  </Text>
                  {(aggregateStats.userPrediction.method || aggregateStats.userPrediction.round) && (
                    <Text style={{ color: colors.textSecondary }}>
                      {aggregateStats.userPrediction.method && ` by ${formatMethod(aggregateStats.userPrediction.method)}`}
                      {aggregateStats.userPrediction.round && ` R${aggregateStats.userPrediction.round}`}
                    </Text>
                  )}
                </Text>
              </View>
            ) : (
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome name="eye" size={12} color="#83B4F3" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  My Prediction:
                </Text>
                <Text style={[sharedStyles.outcomeLineText, { color: colors.textSecondary }]}>
                  N/A
                </Text>
              </View>
            )}

            {/* Community Prediction */}
            {aggregateStats?.communityPrediction?.winner ? (
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome name="bar-chart" size={12} color="#F5C518" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  Community Prediction:
                </Text>
                <Text style={[sharedStyles.outcomeLineText, { flex: 1 }]} numberOfLines={1}>
                  <Text style={{ color: colors.text }}>
                    {getLastName(aggregateStats.communityPrediction.winner)}
                  </Text>
                  {(aggregateStats.communityPrediction.method || aggregateStats.communityPrediction.round) && (
                    <Text style={{ color: colors.textSecondary }}>
                      {aggregateStats.communityPrediction.method && ` by ${formatMethod(aggregateStats.communityPrediction.method)}`}
                      {aggregateStats.communityPrediction.round && ` R${aggregateStats.communityPrediction.round}`}
                    </Text>
                  )}
                </Text>
              </View>
            ) : (
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome name="bar-chart" size={12} color="#F5C518" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  Community Prediction:
                </Text>
                <Text style={[sharedStyles.outcomeLineText, { color: colors.textSecondary }]}>
                  N/A
                </Text>
              </View>
            )}

            {/* Outcome and tags */}
            <View style={styles.outcomeWithTagsContainer}>
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome name="trophy" size={12} color="#22c55e" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  Outcome:
                </Text>
                {fight.userRating ? (
                  (() => {
                    const parts = getOutcomeParts();
                    if (!parts) return null;
                    return (
                      <Text style={[sharedStyles.outcomeLineText, { flex: 1 }]} numberOfLines={1}>
                        <Text style={{ color: colors.text }}>
                          {parts.winnerName}
                        </Text>
                        {parts.methodAndRound && (
                          <Text style={{ color: colors.textSecondary }}>
                            {parts.methodAndRound}
                          </Text>
                        )}
                      </Text>
                    );
                  })()
                ) : (
                  <Text style={[sharedStyles.outcomeLineText, { color: colors.textSecondary, fontStyle: 'italic' }]} numberOfLines={1}>
                    Rate this to show winner.
                  </Text>
                )}
              </View>

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
                    <Text style={[styles.hypeScoreText, { color: colors.textSecondary }]}>N/A</Text>
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
      </View>
    </TouchableOpacity>
  );

  function getOutcomeText() {
    if (!fight.isComplete || !fight.winner || !fight.method) return null;
    return true; // We just need to know if there's outcome data
  }
}

const styles = StyleSheet.create({
  aggregateRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countsColumn: {
    flexDirection: 'column',
    gap: 2,
    marginTop: 5,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countIcon: {
    width: 12,
    textAlign: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '400',
  },
  ratingButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  ratingContainer: {
    position: 'relative',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  starWithCommentContainer: {
    position: 'relative',
    width: 36,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingColumnWrapper: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'flex-start',
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
});
