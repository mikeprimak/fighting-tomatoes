import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
}

interface Event {
  id: string;
  name: string;
}

interface Fight {
  fighter1: Fighter;
  fighter2: Fighter;
  event: Event;
}

interface FightDetailsSectionProps {
  fight: Fight;
}

export default function FightDetailsSection({ fight }: FightDetailsSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Fight Details
      </Text>

      {/* Fighter 1 Link */}
      <TouchableOpacity
        style={[styles.detailRow, { borderBottomColor: colors.border }]}
        onPress={() => router.push(`/fighter/${fight.fighter1.id}` as any)}
      >
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Fighter 1</Text>
        <View style={styles.detailValueRow}>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {fight.fighter1.firstName} {fight.fighter1.lastName}
          </Text>
          <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Fighter 2 Link */}
      <TouchableOpacity
        style={[styles.detailRow, { borderBottomColor: colors.border }]}
        onPress={() => router.push(`/fighter/${fight.fighter2.id}` as any)}
      >
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Fighter 2</Text>
        <View style={styles.detailValueRow}>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {fight.fighter2.firstName} {fight.fighter2.lastName}
          </Text>
          <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Event Link */}
      <TouchableOpacity
        style={[styles.detailRow, { borderBottomWidth: 0 }]}
        onPress={() => router.push(`/(tabs)/events/${fight.event.id}` as any)}
      >
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Event</Text>
        <View style={styles.detailValueRow}>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {fight.event.name}
          </Text>
          <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 4,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 4,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
