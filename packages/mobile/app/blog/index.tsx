import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import { DetailScreenHeader } from '../../components';
import { apiService, resolveBlogImageUrl } from '../../services/api';

export default function BlogIndexScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['editorial', 'all'],
    queryFn: () => apiService.getEditorial(50),
    staleTime: 30 * 60 * 1000,
  });

  const posts = data?.posts ?? [];
  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailScreenHeader title="From the Blog" />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No articles yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {posts.map((post) => (
            <TouchableOpacity
              key={post.slug}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/blog/${post.slug}` as any)}
            >
              <Image
                source={{ uri: resolveBlogImageUrl(post.image) }}
                style={styles.cardImage}
                resizeMode="cover"
              />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {post.title}
                </Text>
                <Text style={styles.cardExcerpt} numberOfLines={3}>
                  {post.excerpt}
                </Text>
                <Text style={styles.cardDate}>
                  {post.date
                    ? new Date(post.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    empty: {
      color: colors.textSecondary,
      fontSize: 15,
    },
    scrollContent: {
      padding: 16,
      gap: 16,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardImage: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: colors.border,
    },
    cardBody: {
      padding: 14,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 6,
    },
    cardExcerpt: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 10,
    },
    cardDate: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
}
