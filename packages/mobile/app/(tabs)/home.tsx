import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService, buildBlogPostUrl, resolveBlogImageUrl, WEB_URL } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { EventBannerCard, CommentCard } from '../../components';
import UpcomingFightCard from '../../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import FighterCard from '../../components/FighterCard';

const WEB_BLOG_INDEX = `${WEB_URL}/blog`;

type ThemeColors = typeof Colors.light;

interface Event {
  id: string;
  name: string;
  date: string;
  promotion: string;
  eventStatus: string;
  bannerImage?: string | null;
  mainStartTime?: string | null;
}

// --- Presentational helpers (module scope so they don't remount on state change) ---

function Section({
  colors,
  styles,
  title,
  icon,
  iconLib = 'fa',
  onSeeAll,
  children,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  title: string;
  icon: string;
  iconLib?: 'fa' | 'fa6';
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          {iconLib === 'fa6' ? (
            <FontAwesome6 name={icon as any} size={20} color={colors.primary} />
          ) : (
            <FontAwesome name={icon as any} size={20} color={colors.primary} />
          )}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity
            onPress={onSeeAll}
            style={styles.seeAllButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.seeAllText}>See all</Text>
            <FontAwesome name="chevron-right" size={11} color={colors.tint} />
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function Loading({ colors, styles }: { colors: ThemeColors; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  );
}

function Empty({ styles, text }: { styles: ReturnType<typeof makeStyles>; text: string }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

/**
 * Home — the app's landing tab.
 *
 * A magazine-style feed that gives fight fans something fresh to look at
 * between fight weekends: editorial blog posts, upcoming event banners,
 * the most-hyped upcoming fights, the best recent fights, hot fighters, and
 * top community comments. Each section is a curated preview that links out to
 * the full screen. Everything is composed from existing endpoints + cards.
 */
export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [upvotingCommentId, setUpvotingCommentId] = React.useState<string | null>(null);

  // --- Data ---------------------------------------------------------------
  const { data: editorial, isLoading: isEditorialLoading } = useQuery({
    queryKey: ['editorial'],
    queryFn: () => apiService.getEditorial(6),
    staleTime: 30 * 60 * 1000, // 30 min — blog changes rarely
  });

  const { data: eventsData, isLoading: isEventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: topUpcomingFights, isLoading: isUpcomingLoading } = useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, 'week'],
    queryFn: () => apiService.getTopUpcomingFights('week'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: topRecentFights, isLoading: isRecentLoading } = useQuery({
    queryKey: ['topRecentFights', isAuthenticated, 'week'],
    queryFn: () => apiService.getTopRecentFights('week'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: hotFighters, isLoading: isFightersLoading } = useQuery({
    queryKey: ['hotFighters'],
    queryFn: () => apiService.getHotFighters(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: topComments, isLoading: isCommentsLoading } = useQuery({
    queryKey: ['topComments'],
    queryFn: () => apiService.getTopComments(),
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // --- Derived ------------------------------------------------------------
  const upcomingEvents: Event[] = (eventsData?.events || [])
    .filter((e: Event) => e.eventStatus === 'UPCOMING')
    .sort((a: Event, b: Event) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4);

  const upcomingFights = (topUpcomingFights?.data || []).slice(0, 5);
  const recentFights = (topRecentFights?.data || []).slice(0, 5);
  const fighters = hotFighters
    ? [...hotFighters.data.recent, ...hotFighters.data.upcoming].slice(0, 6)
    : [];
  const comments = (topComments?.data || []).slice(0, 3);

  // --- Comment upvote (optimistic, shares cache with Community) ------------
  const upvoteMutation = useMutation({
    mutationFn: ({ fightId, reviewId }: { fightId: string; reviewId: string }) =>
      apiService.toggleReviewUpvote(fightId, reviewId),
    onMutate: async ({ reviewId }) => {
      setUpvotingCommentId(reviewId);
      await queryClient.cancelQueries({ queryKey: ['topComments'] });
      const previous = queryClient.getQueryData(['topComments']);
      queryClient.setQueryData(['topComments'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((c: any) =>
            c.id === reviewId
              ? {
                  ...c,
                  userHasUpvoted: !c.userHasUpvoted,
                  upvotes: c.userHasUpvoted ? c.upvotes - 1 : c.upvotes + 1,
                }
              : c
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) queryClient.setQueryData(['topComments'], context.previous);
    },
    onSettled: () => setUpvotingCommentId(null),
  });

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  }, [queryClient]);

  const openBlogPost = (slug: string) => {
    WebBrowser.openBrowserAsync(buildBlogPostUrl(slug)).catch(() => {});
  };

  const styles = makeStyles(colors);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Editorial / Blog ---------------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="From the Blog"
        icon="newspaper-o"
        onSeeAll={() => WebBrowser.openBrowserAsync(WEB_BLOG_INDEX).catch(() => {})}
      >
        {isEditorialLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : editorial && editorial.posts.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          >
            {editorial.posts.map((post) => (
              <TouchableOpacity
                key={post.slug}
                style={styles.blogCard}
                activeOpacity={0.85}
                onPress={() => openBlogPost(post.slug)}
              >
                <Image
                  source={{ uri: resolveBlogImageUrl(post.image) }}
                  style={styles.blogImage}
                  resizeMode="cover"
                />
                <View style={styles.blogBody}>
                  <Text style={styles.blogTitle} numberOfLines={2}>
                    {post.title}
                  </Text>
                  <Text style={styles.blogExcerpt} numberOfLines={3}>
                    {post.excerpt}
                  </Text>
                  <Text style={styles.blogDate}>
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
        ) : (
          <Empty styles={styles} text="No articles yet" />
        )}
      </Section>

      {/* Upcoming Events ----------------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Upcoming Events"
        icon="fire-flame-curved"
        iconLib="fa6"
        onSeeAll={() => router.push('/(tabs)/events' as any)}
      >
        {isEventsLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : upcomingEvents.length > 0 ? (
          upcomingEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              activeOpacity={0.9}
              onPress={() => router.push(`/event/${event.id}` as any)}
              style={{ marginBottom: 16 }}
            >
              <EventBannerCard event={event} />
            </TouchableOpacity>
          ))
        ) : (
          <Empty styles={styles} text="No upcoming events" />
        )}
      </Section>

      {/* Most Hyped Upcoming Fights ----------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Most Hyped"
        icon="bolt"
        onSeeAll={() => router.push('/(tabs)/events' as any)}
      >
        {isUpcomingLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : upcomingFights.length > 0 ? (
          upcomingFights.map((fight: any, index: number) => (
            <UpcomingFightCard
              key={fight.id}
              fight={fight}
              onPress={() => router.push(`/fight/${fight.id}` as any)}
              showEvent={true}
              index={index}
            />
          ))
        ) : (
          <Empty styles={styles} text="No upcoming fights found" />
        )}
      </Section>

      {/* Top Recent Fights --------------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Recent Good Fights"
        icon="star"
        onSeeAll={() => router.push('/(tabs)/top-fights' as any)}
      >
        {isRecentLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : recentFights.length > 0 ? (
          recentFights.map((fight: any, index: number) => (
            <CompletedFightCard
              key={fight.id}
              fight={fight}
              onPress={() => router.push(`/fight/${fight.id}?mode=completed` as any)}
              showEvent={true}
              index={index}
            />
          ))
        ) : (
          <Empty styles={styles} text="No recent fights found" />
        )}
      </Section>

      {/* Hot Fighters -------------------------------------------------------*/}
      <Section colors={colors} styles={styles} title="Hot Fighters" icon="user" iconLib="fa6">
        {isFightersLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : fighters.length > 0 ? (
          fighters.map((f: any) => (
            <FighterCard
              key={f.fighter.id}
              fighter={f.fighter}
              avgRating={f.avgRating}
              fightCount={f.fightCount}
              lastFightDate={f.lastFightDate}
              nextFightDate={f.nextFightDate}
              onPress={() => router.push(`/fighter/${f.fighter.id}` as any)}
            />
          ))
        ) : (
          <Empty styles={styles} text="No hot fighters yet" />
        )}
      </Section>

      {/* Top Community Comments --------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Top Comments"
        icon="comments"
        onSeeAll={() => router.push('/comments' as any)}
      >
        {isCommentsLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : comments.length > 0 ? (
          comments.map((comment: any) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onPress={() => comment.fight && router.push(`/fight/${comment.fight.id}` as any)}
              onUpvote={() =>
                comment.fight &&
                upvoteMutation.mutate({ fightId: comment.fight.id, reviewId: comment.id })
              }
              isUpvoting={upvotingCommentId === comment.id}
              isAuthenticated={isAuthenticated}
            />
          ))
        ) : (
          <Empty styles={styles} text="No comments yet" />
        )}
      </Section>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingTop: 12,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 28,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 12,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    seeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    seeAllText: {
      color: colors.tint,
      fontSize: 14,
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    // Blog carousel card
    blogCard: {
      width: 260,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    blogImage: {
      width: '100%',
      height: 140,
      backgroundColor: colors.border,
    },
    blogBody: {
      padding: 12,
    },
    blogTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    blogExcerpt: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 8,
    },
    blogDate: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
}
