import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '../constants/Colors';
import { useSearch } from '../store/SearchContext';

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

  const handleSearch = () => {
    Keyboard.dismiss();
    if (searchQuery.trim().length >= 2) {
      router.push(`/search-results?q=${encodeURIComponent(searchQuery.trim())}` as any);
    }
  };

  if (!isSearchVisible) {
    return null;
  }

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
            onChangeText={setSearchQuery}
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
});
