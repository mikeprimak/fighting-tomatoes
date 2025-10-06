import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { DetailScreenHeader } from '../../components';

// Placeholder image selection for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  const images = [
    require('../../assets/fighters/fighter-1.jpg'),
    require('../../assets/fighters/fighter-2.jpg'),
    require('../../assets/fighters/fighter-3.jpg'),
    require('../../assets/fighters/fighter-4.jpg'),
    require('../../assets/fighters/fighter-5.jpg'),
    require('../../assets/fighters/fighter-6.jpg'),
  ];
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function FighterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Fetch fighter details
  const { data: fighterData, isLoading, error } = useQuery({
    queryKey: ['fighter', id],
    queryFn: () => apiService.getFighter(id as string),
    enabled: !!id,
  });

  const fighter = fighterData?.fighter;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter Details" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading fighter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !fighter) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <DetailScreenHeader title="Fighter Details" />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Error loading fighter details
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <DetailScreenHeader
        title={`${fighter.firstName} ${fighter.lastName}`}
        subtitle={fighter.nickname ? `"${fighter.nickname}"` : undefined}
      />

      <ScrollView style={styles.scrollView}>
        {/* Fighter Image */}
        <View style={styles.imageContainer}>
          <Image
            source={
              fighter.profileImage
                ? { uri: fighter.profileImage }
                : getFighterPlaceholderImage(fighter.id)
            }
            style={styles.fighterImage}
          />
        </View>

        {/* Fighter Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Fighter Information</Text>

          {fighter.weightClass && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Weight Class:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.weightClass}</Text>
            </View>
          )}

          {fighter.record && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Record:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.record}</Text>
            </View>
          )}

          {fighter.country && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Country:</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{fighter.country}</Text>
            </View>
          )}
        </View>

        {/* Placeholder for future stats */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Career Stats</Text>
          <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
            Detailed statistics coming soon...
          </Text>
        </View>

        {/* Placeholder for recent fights */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Fights</Text>
          <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
            Fight history coming soon...
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
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
    fontSize: 16,
    textAlign: 'center',
  },
  imageContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  fighterImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  infoCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  comingSoonText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
