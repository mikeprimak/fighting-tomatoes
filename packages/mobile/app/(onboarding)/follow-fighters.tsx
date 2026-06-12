/**
 * Onboarding step 3 — the follow picker (follow-fighter.md Decisions §6/§7).
 *
 * Suggestion grid (admin-curable server-side), tap to select, search for
 * anyone outside the suggestions. Follows submit with source 'onboarding'
 * for follow-source attribution. Runs BEFORE the payoff screen (reordered
 * 2026-06-12) so follows feed the taste profile; follows are awaited (not
 * fire-and-forget) for the same reason. No skip — onboarding is mandatory;
 * with nothing selected the button reads Continue and just moves on.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService, OnboardingFighterSuggestion } from '../../services/api';

function formatRecord(f: OnboardingFighterSuggestion): string | null {
  if (f.wins === 0 && f.losses === 0 && f.draws === 0) return null;
  return `${f.wins}-${f.losses}${f.draws > 0 ? `-${f.draws}` : ''}`;
}

export default function FollowFightersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  const [suggestions, setSuggestions] = useState<OnboardingFighterSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OnboardingFighterSuggestion[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiService
      .getOnboardingFollowSuggestions()
      .then((res) => setSuggestions(res.fighters))
      .catch(() => setSuggestions([]))
      .finally(() => setIsLoading(false));
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = text.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      apiService
        .search(q, 12)
        .then((res) => {
          setSearchResults(
            (res.data?.fighters ?? []).map((f) => ({
              fighterId: f.id,
              name: `${f.firstName} ${f.lastName}`.trim(),
              nickname: f.nickname ?? null,
              profileImage: f.profileImage ?? null,
              weightClass: f.weightClass ?? null,
              rank: f.rank ?? null,
              isChampion: f.isChampion,
              wins: f.wins,
              losses: f.losses,
              draws: f.draws,
              followerCount: 0,
            })),
          );
        })
        .catch(() => setSearchResults([]));
    }, 300);
  };

  const toggleSelect = (fighterId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fighterId)) next.delete(fighterId);
      else next.add(fighterId);
      return next;
    });
  };

  const handleFollow = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    // Awaited so the follows are committed before the payoff screen loads
    // the taste profile they feed into. Failures are still silent.
    await Promise.allSettled(
      [...selected].map((fighterId) =>
        apiService.followFighter(fighterId, 'onboarding'),
      ),
    );
    router.push('/(onboarding)/your-profile');
  };

  // Search results replace the grid while a query is active; selected fighters
  // found via search stay selected when the query clears.
  const gridData = searchResults ?? suggestions;

  const renderFighter = ({ item }: { item: OnboardingFighterSuggestion }) => {
    const isSelected = selected.has(item.fighterId);
    const record = formatRecord(item);
    return (
      <TouchableOpacity
        style={[styles.fighterCard, isSelected && styles.fighterCardSelected]}
        onPress={() => toggleSelect(item.fighterId)}
      >
        {item.profileImage ? (
          <Image
            source={{ uri: item.profileImage }}
            style={styles.headshot}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.headshot, styles.headshotPlaceholder]}>
            <FontAwesome name="user" size={28} color={colors.textSecondary} />
          </View>
        )}
        {isSelected ? (
          <View style={styles.checkBadge}>
            <FontAwesome name="check" size={12} color={colors.textOnAccent} />
          </View>
        ) : null}
        <Text style={styles.fighterName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.fighterMeta} numberOfLines={1}>
          {[record, item.isChampion ? 'Champion' : null].filter(Boolean).join(' · ') || ' '}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Follow your fighters</Text>
        <Text style={styles.subtitle}>
          We'll tell you when they're booked and when they fight. They shape
          your fan profile, too.
        </Text>

        <View style={styles.searchWrap}>
          <FontAwesome name="search" size={14} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search any fighter"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={handleQueryChange}
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={gridData}
            keyExtractor={(item) => item.fighterId}
            renderItem={renderFighter}
            numColumns={3}
            columnWrapperStyle={styles.gridRow}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No fighters found.</Text>
            }
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.followButton}
            onPress={handleFollow}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.followButtonText}>
                {selected.size > 0
                  ? `Follow ${selected.size} fighter${selected.size === 1 ? '' : 's'}`
                  : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  fighterCard: {
    width: '31%',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  fighterCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  headshot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: 8,
  },
  headshotPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fighterName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  fighterMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
  footer: {
    marginTop: 12,
  },
  followButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  followButtonText: {
    fontSize: 16,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
});
