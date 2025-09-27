import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';

const { width: screenWidth } = Dimensions.get('window');

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
}

interface RoundVotingSlideupProps {
  visible: boolean;
  fighter1: Fighter;
  fighter2: Fighter;
  currentRound: number;
  onSelectWinner: (fighterId: string, fighterName: string) => void;
  onClose: () => void;
}

export default function RoundVotingSlideup({
  visible,
  fighter1,
  fighter2,
  currentRound,
  onSelectWinner,
  onClose,
}: RoundVotingSlideupProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [slideAnim] = useState(new Animated.Value(0));

  const getFighterImage = (fighter: Fighter): any => {
    const fighterImages = [
      require('../assets/fighters/fighter-1.jpg'),
      require('../assets/fighters/fighter-2.jpg'),
      require('../assets/fighters/fighter-3.jpg'),
      require('../assets/fighters/fighter-4.jpg'),
      require('../assets/fighters/fighter-5.jpg'),
      require('../assets/fighters/fighter-6.jpg'),
    ];

    const fullName = `${fighter.firstName} ${fighter.lastName}`;
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
      const char = fullName.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return fighterImages[Math.abs(hash) % fighterImages.length];
  };

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleSelectWinner = (fighterId: string, fighterName: string) => {
    onSelectWinner(fighterId, fighterName);
    onClose();
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [200, 0],
  });

  const opacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Round {currentRound} Winner
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <FontAwesome name="times" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Who do you think won this round?
      </Text>

      {/* Fighter Selection */}
      <View style={styles.fightersContainer}>
        {/* Fighter 1 */}
        <TouchableOpacity
          style={[
            styles.fighterButton,
            { backgroundColor: colors.background, borderColor: colors.border }
          ]}
          onPress={() => handleSelectWinner(fighter1.id, `${fighter1.firstName} ${fighter1.lastName}`)}
        >
          <Image
            source={getFighterImage(fighter1)}
            style={styles.fighterImage}
          />
          <View style={styles.fighterInfo}>
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fighter1.firstName}
            </Text>
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fighter1.lastName}
            </Text>
            {fighter1.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fighter1.nickname}"
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* VS Divider */}
        <View style={styles.vsContainer}>
          <Text style={[styles.vsText, { color: colors.tint }]}>VS</Text>
        </View>

        {/* Fighter 2 */}
        <TouchableOpacity
          style={[
            styles.fighterButton,
            { backgroundColor: colors.background, borderColor: colors.border }
          ]}
          onPress={() => handleSelectWinner(fighter2.id, `${fighter2.firstName} ${fighter2.lastName}`)}
        >
          <Image
            source={getFighterImage(fighter2)}
            style={styles.fighterImage}
          />
          <View style={styles.fighterInfo}>
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fighter2.firstName}
            </Text>
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fighter2.lastName}
            </Text>
            {fighter2.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fighter2.nickname}"
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Skip Option */}
      <TouchableOpacity
        style={[styles.skipButton, { borderColor: colors.border }]}
        onPress={onClose}
      >
        <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>
          Skip This Round
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  fightersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  fighterButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  fighterImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 12,
  },
  fighterInfo: {
    alignItems: 'center',
  },
  fighterName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  fighterNickname: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});