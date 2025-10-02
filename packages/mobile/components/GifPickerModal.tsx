import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

const GIPHY_API_KEY = 'zCND3MgqEm2dDyTue8Qzk0Q30X854Mys'; 
const SCREEN_WIDTH = Dimensions.get('window').width;

interface GifPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string) => void;
  colorScheme?: 'light' | 'dark';
}

interface GifData {
  id: string;
  images: {
    fixed_width: {
      url: string;
      width: string;
      height: string;
    };
    downsized: {
      url: string;
    };
  };
}

export const GifPickerModal: React.FC<GifPickerModalProps> = ({
  visible,
  onClose,
  onSelectGif,
  colorScheme = 'dark',
}) => {
  const colors = Colors[colorScheme];
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GifData[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Fetch trending GIFs on mount
  useEffect(() => {
    if (visible) {
      setGifs([]);
      setHasMore(true);
      // Randomize starting offset for variety
      const randomOffset = Math.floor(Math.random() * 100);
      setOffset(randomOffset);
      fetchTrendingGifs(randomOffset);
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    setGifs([]);
    setOffset(0);
    setHasMore(true);

    if (searchQuery.trim()) {
      const timer = setTimeout(() => {
        searchGifs(searchQuery, 0);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      fetchTrendingGifs(0);
    }
  }, [searchQuery]);

  const fetchTrendingGifs = async (loadOffset: number) => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      // Fetch combat sports related GIFs when no search query
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=mma+ufc+knockout+punch+ring+girl+fight+fighter&limit=30&offset=${loadOffset}&rating=pg-13`
      );
      const data = await response.json();

      if (data.data.length === 0) {
        setHasMore(false);
      } else {
        setGifs(prev => loadOffset === 0 ? data.data : [...prev, ...data.data]);
        setOffset(loadOffset + 30);
      }
    } catch (error) {
      console.error('Error fetching combat sports GIFs:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = async (query: string, loadOffset: number) => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
          query
        )}&limit=30&offset=${loadOffset}&rating=pg-13`
      );
      const data = await response.json();

      if (data.data.length === 0) {
        setHasMore(false);
      } else {
        setGifs(prev => loadOffset === 0 ? data.data : [...prev, ...data.data]);
        setOffset(loadOffset + 30);
      }
    } catch (error) {
      console.error('Error searching GIFs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (searchQuery.trim()) {
      searchGifs(searchQuery, offset);
    } else {
      fetchTrendingGifs(offset);
    }
  };

  const handleSelectGif = (gif: GifData) => {
    onSelectGif(gif.images.downsized.url);
    onClose();
    setSearchQuery('');
  };

  const renderGifItem = ({ item }: { item: GifData }) => {
    const imageWidth = (SCREEN_WIDTH - 48) / 3; // 3 columns with padding
    const aspectRatio = parseInt(item.images.fixed_width.width) / parseInt(item.images.fixed_width.height);
    const imageHeight = imageWidth / aspectRatio;

    return (
      <TouchableOpacity
        onPress={() => handleSelectGif(item)}
        style={[styles.gifItem, { width: imageWidth, height: imageHeight }]}
      >
        <Image
          source={{ uri: item.images.fixed_width.url }}
          style={styles.gifImage}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.modalContainer, { backgroundColor: colors.card }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Choose a GIF</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <FontAwesome name="times" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
            <FontAwesome name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search GIFs..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <FontAwesome name="times-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* GIF Grid */}
          {gifs.length === 0 && loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={gifs}
              renderItem={renderGifItem}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.gifGrid}
              showsVerticalScrollIndicator={false}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loading ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )}

          {/* Powered by Giphy */}
          <View style={styles.attribution}>
            <Text style={[styles.attributionText, { color: colors.textSecondary }]}>
              Powered by GIPHY
            </Text>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 12,
    margin: -8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gifGrid: {
    padding: 8,
  },
  gifItem: {
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  attribution: {
    padding: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  attributionText: {
    fontSize: 12,
  },
  footerLoader: {
    padding: 16,
    alignItems: 'center',
  },
});
