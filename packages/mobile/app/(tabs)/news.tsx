import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  FlatList,
  TouchableOpacity,
  Image,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { api } from '../../services/api';

interface NewsArticle {
  id: string;
  headline: string;
  description: string;
  url: string;
  source: string;
  imageUrl: string | null;
  localImagePath: string | null;
  scrapedAt: string;
  createdAt: string;
}

export default function NewsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [allArticles, setAllArticles] = useState<NewsArticle[]>([]);

  const { data, isLoading, error, refetch, isRefetching, isFetchingNextPage } = useQuery({
    queryKey: ['news', page],
    queryFn: () => api.getNews({ page, limit: 20 }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Append new articles when data changes
  React.useEffect(() => {
    if (data?.articles) {
      if (page === 1) {
        // Reset articles on refresh (page 1)
        setAllArticles(data.articles);
      } else {
        // Append new articles for pagination
        setAllArticles(prev => {
          // Avoid duplicates
          const existingIds = new Set(prev.map(a => a.id));
          const newArticles = data.articles.filter(a => !existingIds.has(a.id));
          return [...prev, ...newArticles];
        });
      }
    }
  }, [data, page]);

  // Prefetch images for better UX
  React.useEffect(() => {
    if (allArticles.length > 0) {
      // Prefetch images for all articles
      allArticles.forEach(article => {
        const imageUrl = article.imageUrl || (article.localImagePath ? `${api.baseURL}${article.localImagePath}` : null);
        if (imageUrl) {
          Image.prefetch(imageUrl).catch(() => {
            // Silently fail - image will still try to load when rendered
          });
        }
      });
    }
  }, [allArticles]);

  const handleLoadMore = () => {
    if (data?.pagination && page < data.pagination.totalPages && !isLoading && !isFetchingNextPage) {
      setPage(prev => prev + 1);
    }
  };

  const handleRefresh = () => {
    setPage(1);
    setAllArticles([]);
    refetch();
  };

  const handleArticlePress = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening article:', error);
    }
  };

  const renderArticle = ({ item }: { item: NewsArticle }) => {
    // Prefer remote imageUrl for reliability, fallback to local if needed
    const imageUrl = item.imageUrl || (item.localImagePath ? `${api.baseURL}${item.localImagePath}` : null);

    return (
      <TouchableOpacity
        style={[styles.articleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => handleArticlePress(item.url)}
        activeOpacity={0.7}
      >
        {imageUrl && (
          <Image
            source={{
              uri: imageUrl,
              cache: 'force-cache', // Use cached version if available
            }}
            style={styles.articleImage}
            resizeMode="cover"
            onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
            fadeDuration={200}
          />
        )}
        <View style={styles.articleContent}>
          <Text style={[styles.source, { color: colors.tint }]}>
            {item.source}
          </Text>
          <Text style={[styles.headline, { color: colors.text }]} numberOfLines={3}>
            {item.headline}
          </Text>
          {item.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <Text style={[styles.date, { color: colors.tabIconDefault }]}>
            {new Date(item.scrapedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !data && allArticles.length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (error && allArticles.length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>
          Error loading news articles
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.tint }]}
          onPress={handleRefresh}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderFooter = () => {
    if (!isLoading || allArticles.length === 0) return null;

    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.tint} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading more articles...
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={allArticles}
        renderItem={renderArticle}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && page === 1}
            onRefresh={handleRefresh}
            tintColor={colors.tint}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No news articles available
            </Text>
          </View>
        }
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={11}
        // Image loading optimization - items are prepared 5 screens ahead
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContent: {
    padding: 16,
  },
  articleCard: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  articleImage: {
    width: '100%',
    height: 200,
  },
  articleContent: {
    padding: 16,
  },
  source: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    lineHeight: 24,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  date: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
});
