import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { sharedStyles } from './shared/styles';
import { formatDate } from './shared/utils';

interface HotPredictionCardProps {
  fight: any;
  onPress: (fight: any) => void;
}

export default function HotPredictionCard({ fight, onPress }: HotPredictionCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const percentage = Math.round(fight.consensusPercentage || 0);

  return (
    <TouchableOpacity onPress={() => onPress(fight)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, {
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 60,
      }]}>
        {/* Prediction Text */}
        <Text style={[styles.predictionText, { color: colors.text }]} numberOfLines={1}>
          <Text style={{ fontWeight: '700' }}>{percentage}%</Text>
          {' pick '}
          <Text style={{ fontWeight: '700', color: colors.primary }}>{fight.consensusWinner}</Text>
          {' to beat '}
          <Text style={{ fontWeight: '700' }}>{fight.consensusLoser}</Text>
        </Text>

        {/* Event Info */}
        <Text style={[styles.eventInfo, { color: colors.textSecondary, marginTop: 4 }]}>
          {fight.event.name} • {formatDate(fight.event.date)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  predictionText: {
    fontSize: 13,
    lineHeight: 18,
  },
  eventInfo: {
    fontSize: 12,
  },
});
