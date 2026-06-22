import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Share,
  TouchableOpacity,
  useWindowDimensions,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import RenderHtml from 'react-native-render-html';
import * as WebBrowser from 'expo-web-browser';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { DetailScreenHeader } from '../../components';
import {
  apiService,
  buildBlogPostUrl,
  resolveBlogImageUrl,
  WEB_URL,
} from '../../services/api';
import {
  useBlogScrollController,
  BlogScrollProvider,
  makeBlogRenderers,
  blogElementModels,
  transformBlogBlocks,
} from '../../components/blog/BlogRichBlocks';

// Rewrite root-relative URLs (src="/blog/..", href="/..") to the absolute web
// host so images load and links resolve from the native reader.
const absolutizeUrls = (html: string): string =>
  html.replace(/(src|href)="\/(?!\/)/g, `$1="${WEB_URL}/`);

export default function BlogPostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { width } = useWindowDimensions();

  const { data, isLoading, error } = useQuery({
    queryKey: ['editorialPost', slug],
    queryFn: () => apiService.getEditorialPost(slug as string),
    enabled: !!slug,
    staleTime: 30 * 60 * 1000,
  });

  const post = data?.post;

  const onShare = () => {
    if (!slug) return;
    const url = buildBlogPostUrl(slug as string);
    // Share the web URL (not the native screen) so shares keep SEO value.
    Share.share({
      message: post?.title ? `${post.title}\n${url}` : url,
      url,
      title: post?.title,
    }).catch(() => {});
  };

  const styles = makeStyles(colors);
  const contentWidth = width - 32;

  const blog = useBlogScrollController();
  const html = post ? transformBlogBlocks(absolutizeUrls(post.html)) : '';
  const renderers = useMemo(() => makeBlogRenderers(contentWidth, colors), [contentWidth, colors]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <DetailScreenHeader
        title={post?.title ?? 'Article'}
        rightIcon={
          post ? (
            <TouchableOpacity onPress={onShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome name="share-square-o" size={20} color={colors.text} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error || !post ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load this article.</Text>
        </View>
      ) : (
        <BlogScrollProvider value={blog.ctx}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={blog.onScroll}
          onLayout={blog.onViewportLayout}
          scrollEventThrottle={16}
        >
          <View ref={blog.contentRef} onLayout={blog.onContentLayout} collapsable={false}>
          <Image
            source={{ uri: resolveBlogImageUrl(post.image) }}
            style={styles.hero}
            resizeMode="cover"
          />
          <View style={styles.body}>
            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.meta}>
              {post.date
                ? new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : ''}
              {post.author ? `  ·  ${post.author}` : ''}
            </Text>

            <RenderHtml
              contentWidth={contentWidth}
              source={{ html }}
              baseStyle={styles.htmlBase}
              tagsStyles={tagsStyles(colors)}
              systemFonts={['System']}
              customHTMLElementModels={blogElementModels}
              renderers={renderers}
              renderersProps={{
                a: {
                  onPress: (_e, href) => {
                    if (href) WebBrowser.openBrowserAsync(href).catch(() => {});
                  },
                },
              }}
            />

            {post.tags?.length > 0 && (
              <View style={styles.tagRow}>
                {post.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          </View>
        </ScrollView>
        </BlogScrollProvider>
      )}
    </SafeAreaView>
  );
}

const tagsStyles = (colors: typeof Colors.light) => ({
  h1: { color: colors.text, fontSize: 26, fontWeight: '700' as const, marginTop: 20, marginBottom: 10 },
  h2: { color: colors.text, fontSize: 22, fontWeight: '700' as const, marginTop: 20, marginBottom: 8 },
  h3: { color: colors.text, fontSize: 18, fontWeight: '700' as const, marginTop: 16, marginBottom: 6 },
  p: { color: colors.text, fontSize: 16, lineHeight: 26, marginTop: 0, marginBottom: 14 },
  a: { color: colors.primary, textDecorationLine: 'underline' as const },
  strong: { fontWeight: '700' as const, color: colors.text },
  em: { fontStyle: 'italic' as const },
  li: { color: colors.text, fontSize: 16, lineHeight: 26 },
  img: { borderRadius: 12, marginVertical: 12 },
  figure: { marginVertical: 16 },
  figcaption: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' as const, marginTop: 6 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 12,
    marginVertical: 12,
    color: colors.textSecondary,
  },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 16 },
});

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
    errorText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    hero: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: colors.border,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: '700',
      marginBottom: 8,
      lineHeight: 32,
    },
    meta: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 20,
    },
    htmlBase: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 26,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 28,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    tag: {
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    tagText: {
      color: colors.textSecondary,
      fontSize: 12,
    },
  });
}
