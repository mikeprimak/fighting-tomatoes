import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Keyboard,
  Image,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '../constants/Colors';
import { useSearch } from '../store/SearchContext';
import { apiService } from '../services/api';
import { getFighterImageUrl } from './fight-cards/shared/utils';

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');

interface SearchBarProps {
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchBar({
  placeholder = 'Search fighters, events...',
  autoFocus = true,
}: SearchBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { isSearchVisible } = useSearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  // Debounce the typed query so suggestions don't fire on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const { data: suggestData } = useQuery({
    queryKey: ['search-suggest', debouncedQuery],
    queryFn: () => apiService.searchSuggest(debouncedQuery),
    enabled: isSearchVisible && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  const closeSuggestions = () => setSuggestionsDismissed(true);

  const handleSearch = () => {
    Keyboard.dismiss();
    closeSuggestions();
    if (searchQuery.trim().length >= 2) {
      router.push(`/search-results?q=${encodeURIComponent(searchQuery.trim())}` as any);
    }
  };

  const goTo = (path: string) => {
    Keyboard.dismiss();
    closeSuggestions();
    router.push(path as any);
  };

  if (!isSearchVisible) {
    return null;
  }

  const suggestions = suggestData?.data;
  const hasSuggestions =
    !!suggestions &&
    (suggestions.fighters.length > 0 ||
      suggestions.events.length > 0 ||
      suggestions.promotions.length > 0);
  const showSuggestions =
    !suggestionsDismissed &&
    searchQuery.trim().length >= 2 &&
    debouncedQuery.length >= 2 &&
    hasSuggestions;

  const formatEventDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <View style={[styles.searchContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.searchBarWrapper}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <FontAwesome
            name="search"
            size={18}
            color={colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setSuggestionsDismissed(false);
            }}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus={autoFocus}
          />
        </View>
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: colors.primary }]}
          onPress={handleSearch}
          disabled={searchQuery.trim().length < 2}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {showSuggestions && suggestions && (
        <View style={[styles.suggestions, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {suggestions.fighters.map((fighter) => (
            <TouchableOpacity
              key={`fighter-${fighter.id}`}
              style={styles.suggestionRow}
              onPress={() => goTo(`/fighter/${fighter.id}`)}
            >
              <Image
                source={
                  getFighterImageUrl(fighter.profileImage)
                    ? { uri: getFighterImageUrl(fighter.profileImage)! }
                    : DEFAULT_FIGHTER_IMAGE
                }
                style={styles.suggestionAvatar}
                resizeMode="cover"
              />
              <View style={styles.suggestionInfo}>
                <Text style={[styles.suggestionTitle, { color: colors.text }]} numberOfLines={1}>
                  {fighter.firstName} {fighter.lastName}
                  {fighter.isChampion ? ' 🏆' : ''}
                </Text>
                <Text style={[styles.suggestionSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[fighter.record, fighter.nickname ? `"${fighter.nickname}"` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Fighter'}
                </Text>
              </View>
              <Text style={[styles.suggestionChevron, { color: colors.textSecondary }]}>›</Text>
            </TouchableOpacity>
          ))}

          {suggestions.events.map((event) => (
            <TouchableOpacity
              key={`event-${event.id}`}
              style={styles.suggestionRow}
              onPress={() => goTo(`/event/${event.id}`)}
            >
              <View style={[styles.suggestionIconCircle, { backgroundColor: colors.card }]}>
                <FontAwesome name="calendar" size={14} color={colors.textSecondary} />
              </View>
              <View style={styles.suggestionInfo}>
                <Text style={[styles.suggestionTitle, { color: colors.text }]} numberOfLines={1}>
                  {event.name}
                </Text>
                <Text style={[styles.suggestionSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {event.promotion} · {formatEventDate(event.date)}
                </Text>
              </View>
              <Text style={[styles.suggestionChevron, { color: colors.textSecondary }]}>›</Text>
            </TouchableOpacity>
          ))}

          {suggestions.promotions.map((promotion) => (
            <TouchableOpacity
              key={`promotion-${promotion.name}`}
              style={styles.suggestionRow}
              onPress={() => {
                Keyboard.dismiss();
                closeSuggestions();
                router.push(`/search-results?q=${encodeURIComponent(promotion.name)}` as any);
              }}
            >
              <View style={[styles.suggestionIconCircle, { backgroundColor: colors.card }]}>
                <FontAwesome name="shield" size={14} color={colors.textSecondary} />
              </View>
              <View style={styles.suggestionInfo}>
                <Text style={[styles.suggestionTitle, { color: colors.text }]} numberOfLines={1}>
                  {promotion.name}
                </Text>
                <Text style={[styles.suggestionSubtitle, { color: colors.textSecondary }]}>
                  Promotion
                </Text>
              </View>
              <Text style={[styles.suggestionChevron, { color: colors.textSecondary }]}>›</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.suggestionRow} onPress={handleSearch}>
            <View style={[styles.suggestionIconCircle, { backgroundColor: colors.card }]}>
              <FontAwesome name="search" size={14} color={colors.primary} />
            </View>
            <View style={styles.suggestionInfo}>
              <Text style={[styles.suggestionTitle, { color: colors.primary }]} numberOfLines={1}>
                See all results for "{searchQuery.trim()}"
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: 44,
  },
  searchButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '600',
  },
  suggestions: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  suggestionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  suggestionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  suggestionChevron: {
    fontSize: 20,
    fontWeight: '300',
  },
});
