import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate } from './shared/utils';
import { sharedStyles } from './shared/styles';

interface LiveFightCardProps extends BaseFightCardProps {
  animateRating?: boolean;
}

export default function LiveFightCard({
  fight,
  onPress,
  showEvent = true,
  animateRating = false,
}: LiveFightCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Image error states
  const [fighter1ImageError, setFighter1ImageError] = useState(false);
  const [fighter2ImageError, setFighter2ImageError] = useState(false);

  // Rating button press state
  const [isRatingPressed, setIsRatingPressed] = useState(false);

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Reset image errors
  useEffect(() => {
    setFighter1ImageError(false);
    setFighter2ImageError(false);
  }, [fight.id]);

  // Pulsing animation for live dot
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

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

  return (
    <TouchableOpacity onPress={() => router.push(`/fight/${fight.id}`)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, { backgroundColor: colors.primary }]}>
        {fight.isTitle && (
          <Text style={[sharedStyles.titleLabel, { color: colors.textOnAccent }]}>
            TITLE FIGHT
          </Text>
        )}

        {showEvent && (
          <Text style={[sharedStyles.eventText, { color: colors.textOnAccent }]}>
            {fight.event.name} • {formatDate(fight.event.date)}
          </Text>
        )}

        <Text style={[sharedStyles.matchup, { color: colors.textOnAccent }]}>
          {cleanFighterName(getFighterName(fight.fighter1))} vs {cleanFighterName(getFighterName(fight.fighter2))}
        </Text>

        <View style={sharedStyles.horizontalInfoRow}>
          {/* Fighter Headshots */}
          <View style={sharedStyles.headshotsContainer}>
            <Image
              source={getFighter1ImageSource()}
              style={styles.fighterHeadshot}
              onError={() => setFighter1ImageError(true)}
            />
            <Image
              source={getFighter2ImageSource()}
              style={styles.fighterHeadshot}
              onError={() => setFighter2ImageError(true)}
            />
          </View>

          {/* Ratings Wrapper */}
          <View style={sharedStyles.ratingsWrapper}>
            {/* Live Indicator */}
            <View style={{ width: 100 }}>
              <View style={styles.liveContainer}>
                <Animated.View
                  style={[
                    styles.liveDot,
                    {
                      backgroundColor: colors.danger,
                      opacity: pulseAnim,
                    },
                  ]}
                />
                <Text style={[styles.statusText, { color: colors.danger }]} numberOfLines={1}>
                  Live
                </Text>
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
                      ? 'rgba(255, 255, 255, 0.15)'
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
                    <View style={styles.starWithCommentContainer}>
                      <FontAwesome
                        name={fight.userRating ? "star" : "star-o"}
                        size={30}
                        color={colors.textOnAccent}
                        style={sharedStyles.ratingIcon}
                      />
                    </View>
                    <View style={styles.ratingColumnWrapper}>
                      {fight.userRating ? (
                        <Text style={[sharedStyles.userRatingText, { color: colors.textOnAccent }]}>
                          {fight.userRating}
                        </Text>
                      ) : (
                        <Text style={[sharedStyles.unratedText, { color: colors.textOnAccent }]}>
                          My{'\n'}Rating
                        </Text>
                      )}
                    </View>
                  </View>
                </Animated.View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Empty container for consistent spacing */}
        <View style={sharedStyles.outcomeContainer}>
          <Text style={[styles.statusText, { color: 'transparent' }]} numberOfLines={1}> </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fighterHeadshot: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
  },
  liveContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'flex-start',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
});
