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
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService, resolveBlogImageUrl } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { CommentCard } from '../../components';
import { PromotionLogo } from '../../components/PromotionLogo';
import { normalizeEventName, getFighterImage, getFighterName, getFighterDisplayName, getFighterPrimaryName } from '../../components/fight-cards/shared/utils';
import { getDefaultBanner } from '../../utils/defaultBanners';
import { formatEventDate } from '../../utils/dateFormatters';
import UpcomingFightCard from '../../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import UpcomingFightModal from '../../components/UpcomingFightModal';
import FighterCard from '../../components/FighterCard';
import { SearchBar } from '../../components';

const formatCount = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

// "in 3 weeks" / "tomorrow" / "today" — reads after "Fights X ___".
const relUntilPhrase = (dateStr: string): string => {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'in 1 week' : `in ${weeks} weeks`;
};

// Event.date is a UTC-hour placeholder, so compare its UTC calendar day to
// today's local calendar day (matches formatTimeUntil's day comparison).
const isEventToday = (dateStr: string): boolean => {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getFullYear() &&
    d.getUTCMonth() === now.getMonth() &&
    d.getUTCDate() === now.getDate()
  );
};

// "3 weeks ago" / "yesterday" / "today" — reads after "Fought X ___".
const relAgoPhrase = (dateStr: string): string => {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
};

// Promotion label for the per-event group heading — strip underscores
// (e.g. "TOP_RANK" -> "TOP RANK"). Rendered uppercase by the heading style.
const promotionLabel = (promotion: string | null | undefined): string =>
  (promotion ?? '').replace(/_/g, ' ');

// "today" / "tomorrow" / "in 9 days" / "in 2 weeks" — relative time to an event
// by calendar day (matches the web "Hyped Upcoming Fights" group headings, which
// show days up to 14 before switching to weeks).
const eventRelativePhrase = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startEvent = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startEvent.getTime() - startToday.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
};

// Group a flat, hype-sorted fight list by event, preserving first-appearance
// order so the soonest/most-hyped event leads (mirrors the web grouping).
const groupByEvent = (fights: any[]): { event: any; fights: any[] }[] => {
  const groups: { event: any; fights: any[] }[] = [];
  const byId = new Map<string, { event: any; fights: any[] }>();
  for (const f of fights) {
    const id = f.event?.id ?? 'unknown';
    let g = byId.get(id);
    if (!g) {
      g = { event: f.event, fights: [] };
      byId.set(id, g);
      groups.push(g);
    }
    g.fights.push(f);
  }
  return groups;
};

// Whole-day epoch index — bump this and the rotation advances by one window.
const epochDay = () => Math.floor(Date.now() / 86_400_000);

// Daily-rotating window over a quality-ordered pool. Every section still pulls
// from the top of its pool (so "the best" stays surfaced), but which slice of
// that pool we show advances once per day and wraps. With pool ≈ 3× the window
// this yields a ~2–3 day rotation before a fighter/comment reappears.
function rotateDaily<T>(arr: T[], size: number, day: number): T[] {
  if (!arr || arr.length <= size) return arr || [];
  const periods = Math.ceil(arr.length / size);
  const start = (day % periods) * size;
  const out: T[] = [];
  for (let i = 0; i < size; i++) out.push(arr[(start + i) % arr.length]);
  return out;
}

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

/** Half-width event thumbnail for the Events This Weekend grid. */
function EventThumbnail({
  event,
  colors,
  styles,
  onPress,
}: {
  event: Event;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const imageSource = event.bannerImage
    ? { uri: event.bannerImage }
    : getDefaultBanner(event.promotion || '');
  const name = normalizeEventName(event.name, event.promotion);

  // Top-align the crop for portrait/tall images (faces/posters live at the top).
  // We measure the box width + image aspect, then pin tall images to top:0 so the
  // overflow is clipped from the bottom instead of center-cropping.
  const CONTAINER_ASPECT = 16 / 9;
  const [boxWidth, setBoxWidth] = React.useState(0);
  const [imgAspect, setImgAspect] = React.useState<number | null>(null);
  const isTall = imgAspect !== null && imgAspect < CONTAINER_ASPECT;
  const handleImageLoad = (e: any) => {
    const { width: w, height: h } = e.nativeEvent.source;
    if (w > 0 && h > 0) setImgAspect(w / h);
  };

  return (
    <TouchableOpacity style={styles.eventThumb} activeOpacity={0.85} onPress={onPress}>
      <View
        style={styles.eventThumbImageWrap}
        onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            style={
              isTall && boxWidth
                ? { position: 'absolute', top: 0, left: 0, width: boxWidth, height: boxWidth / imgAspect! }
                : styles.eventThumbImage
            }
            resizeMode={isTall && boxWidth ? undefined : 'cover'}
            onLoad={handleImageLoad}
          />
        ) : (
          <View style={[styles.eventThumbImage, styles.eventThumbPlaceholder]}>
            <PromotionLogo promotion={event.promotion || ''} size={40} color="#FFFFFF" />
          </View>
        )}
        {event.promotion ? (
          <View style={styles.eventThumbLogo}>
            <PromotionLogo promotion={event.promotion} size={18} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <View style={styles.eventThumbBody}>
        <Text style={styles.eventThumbName} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.eventThumbDate}>
          {isEventToday(event.date) ? 'Today' : formatEventDate(event.date)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** Compact avatar chip for the Most Followed horizontal rail (web sidebar style). */
function FollowedFighterChip({
  fighter,
  followerCount,
  styles,
  onPress,
}: {
  fighter: any;
  followerCount: number;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.followChip} activeOpacity={0.85} onPress={onPress}>
      <Image source={getFighterImage(fighter)} style={styles.followAvatar} resizeMode="cover" />
      <Text style={styles.followName} numberOfLines={2}>
        {getFighterName(fighter)}
      </Text>
      <Text style={styles.followCount}>
        {formatCount(followerCount)} {followerCount === 1 ? 'follower' : 'followers'}
      </Text>
    </TouchableOpacity>
  );
}

// Rotating "here's what Good Fights can do for you" education cards shown at the
// bottom of Home. Cycles once a minute so a returning user keeps discovering
// features. Each card optionally deep-links to the relevant screen.
const FEATURE_SPOTLIGHTS: {
  icon: string;
  iconLib: 'fa' | 'fa6';
  title: string;
  body: string;
  route?: string;
  hint?: string;
}[] = [
  {
    icon: 'fire-flame-curved',
    iconLib: 'fa6',
    title: 'See the Hype Building',
    body: "Check how hyped upcoming fights are, so you know which cards are worth clearing your weekend for.",
    route: '/(tabs)/events',
    hint: 'Explore upcoming events',
  },
  {
    icon: 'star',
    iconLib: 'fa',
    title: "Know What's Worth Watching",
    body: 'Community ratings show you which fights actually delivered, so you can find a great one to watch tonight.',
    route: '/(tabs)/top-fights',
    hint: 'See top-rated fights',
  },
  {
    icon: 'clock-rotate-left',
    iconLib: 'fa6',
    title: 'Dig Into the Classics',
    body: 'Discover the highest-rated fights from years past that you may have missed the first time around.',
    route: '/(tabs)/top-fights?period=all',
    hint: 'See the best fights of all time',
  },
  {
    icon: 'filter',
    iconLib: 'fa',
    title: 'Make It Your Sport',
    body: 'Select the combat sports organizations you care about, and your events and Good Fights lists tune to just those.',
    route: '/(tabs)/events',
    hint: 'Pick your organizations',
  },
  {
    icon: 'bell',
    iconLib: 'fa',
    title: 'Follow Your Favorites',
    body: "Follow fighters and get notified the moment they're booked, the morning of, and when they walk out.",
    route: '/followed-fighters',
    hint: 'Manage your fighters',
  },
  {
    icon: 'comments',
    iconLib: 'fa',
    title: 'Join the Conversation',
    body: 'See what other fans are saying and add your own takes before and after every fight.',
  },
];

function FeatureSpotlight({
  colors,
  styles,
  onNavigate,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onNavigate: (route: string) => void;
}) {
  const [idx, setIdx] = React.useState(0);
  // Cross-fade between slides: fade the content out, swap the slide, fade back in.
  const opacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setIdx((i) => (i + 1) % FEATURE_SPOTLIGHTS.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [opacity]);

  const feature = FEATURE_SPOTLIGHTS[idx];

  return (
    <TouchableOpacity
      style={styles.spotlightCard}
      activeOpacity={feature.route ? 0.85 : 1}
      onPress={() => feature.route && onNavigate(feature.route)}
    >
      <Animated.View style={[styles.spotlightInner, { opacity }]}>
        <View style={styles.spotlightIconWrap}>
          {feature.iconLib === 'fa6' ? (
            <FontAwesome6 name={feature.icon as any} size={22} color={colors.primary} />
          ) : (
            <FontAwesome name={feature.icon as any} size={22} color={colors.primary} />
          )}
        </View>
        <Text style={styles.spotlightTitle}>{feature.title}</Text>
        <Text style={styles.spotlightBody}>{feature.body}</Text>
        {feature.route ? (
          <View style={styles.spotlightButton}>
            <Text style={styles.spotlightButtonText}>{feature.hint || 'Explore'}</Text>
          </View>
        ) : null}
      </Animated.View>
    </TouchableOpacity>
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
  // Hype quick-view modal for the "Most Hyped" upcoming cards.
  const [modalFight, setModalFight] = React.useState<any | null>(null);

  // --- Data ---------------------------------------------------------------
  const { data: editorial, isLoading: isEditorialLoading } = useQuery({
    queryKey: ['editorial'],
    queryFn: () => apiService.getEditorial(8),
    staleTime: 30 * 60 * 1000, // 30 min — blog changes rarely
  });

  const { data: eventsData, isLoading: isEventsLoading } = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => apiService.getEvents({ type: 'upcoming' }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: topUpcomingFights, isLoading: isUpcomingLoading } = useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, 'week'],
    queryFn: () => apiService.getTopUpcomingFights('week'),
    staleTime: 5 * 60 * 1000,
  });

  // Mirror the web "Recent Good Fights" rule exactly: highest community-rated
  // bouts from the past month (page 1, top 6). No week-first/month-fallback
  // logic, so mobile and web surface the same fights in this section.
  const { data: topRecentFights, isLoading: isRecentLoading } = useQuery({
    queryKey: ['topRecentFights', isAuthenticated, 'month'],
    queryFn: () => apiService.getTopRecentFights('month', undefined, 1, 6),
    staleTime: 5 * 60 * 1000,
  });

  const { data: hotFighters, isLoading: isFightersLoading } = useQuery({
    queryKey: ['hotFighters'],
    queryFn: () => apiService.getHotFighters(),
    staleTime: 5 * 60 * 1000,
  });

  // Pull a deeper pool (18) so the home rail can rotate through the most-followed
  // daily while still only ever showing top fighters. dayKey busts the cache at
  // midnight so the rotation actually advances.
  const dayKey = epochDay();
  const { data: topFollowed, isLoading: isFollowedLoading } = useQuery({
    queryKey: ['topFollowedFighters', 'home', dayKey],
    queryFn: () => apiService.getTopFollowedFighters(18),
    staleTime: 30 * 60 * 1000,
  });

  const { data: recentlyBookedData, isLoading: isBookedLoading } = useQuery({
    queryKey: ['recentlyBookedFighters'],
    queryFn: () => apiService.getRecentlyBookedFighters(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: topComments, isLoading: isCommentsLoading } = useQuery({
    queryKey: ['topComments'],
    queryFn: () => apiService.getTopComments(),
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // Classics: highest-rated fights 3+ years old the user hasn't rated. The
  // backend rotates the set by UTC day; include that day in the key so the
  // cache busts at midnight and the rotation is actually picked up.
  // Keyed on auth too so the unrated-by-me filter refetches on login/logout.
  const classicsDayKey = Math.floor(Date.now() / 86_400_000);
  const { data: classicFights, isLoading: isClassicsLoading } = useQuery({
    queryKey: ['classicFights', isAuthenticated, classicsDayKey],
    queryFn: () => apiService.getClassicFights(8),
    staleTime: 30 * 60 * 1000,
  });

  // Daily-rotating AI-enriched fighter, shown big with bio + their top-rated
  // fight (mirrors the web "Highlighted Fighter" home band).
  const { data: highlightedFighterData } = useQuery({
    queryKey: ['highlightedFighter'],
    queryFn: () => apiService.getHighlightedFighter(),
    staleTime: 30 * 60 * 1000,
  });

  // --- Derived ------------------------------------------------------------
  // Order by calendar day, then float UFC to the top of its day so a marquee UFC
  // card isn't buried under same-day regional events (Event.date is a UTC-hour
  // placeholder, so we group on its UTC date components, not local time).
  const eventDayKey = (d: string) => {
    const dt = new Date(d);
    return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  };
  const isUFC = (e: Event) => (e.promotion || '').toUpperCase() === 'UFC';
  // "This weekend" = every event from today up to (but not including) the Monday
  // that starts next week — i.e. the rest of the current Mon–Sun week. On Sat/Sun
  // that's the remaining weekend; the instant Monday arrives the window rolls to
  // the whole next week (Mon–Sun), so mid-week cards (Wed/Thu/Fri) are included.
  // Compared as UTC day keys to line up with eventDayKey (Event.date is a
  // UTC-hour placeholder); anchored on the user's local calendar date.
  const DAY_MS = 86_400_000;
  const nowLocal = new Date();
  const todayKey = Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
  const localDow = nowLocal.getDay(); // 0=Sun … 6=Sat
  let daysUntilNextMonday = (1 - localDow + 7) % 7; // 0 when today is Monday
  if (daysUntilNextMonday === 0) daysUntilNextMonday = 7; // on Monday, span the full week
  const nextMondayKey = todayKey + daysUntilNextMonday * DAY_MS;
  const upcomingEvents: Event[] = (eventsData?.events || [])
    .filter((e: Event) => e.eventStatus === 'UPCOMING')
    .filter((e: Event) => {
      const k = eventDayKey(e.date);
      return k >= todayKey && k < nextMondayKey;
    })
    .sort((a: Event, b: Event) => {
      const dayDiff = eventDayKey(a.date) - eventDayKey(b.date);
      if (dayDiff !== 0) return dayDiff;
      if (isUFC(a) !== isUFC(b)) return isUFC(a) ? -1 : 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  const upcomingFights = (topUpcomingFights?.data || []).slice(0, 5);
  const recentFights = (topRecentFights?.data || []).slice(0, 6);

  // Hot fighters: three who recently fought, then three who fight next — grouped,
  // not interleaved. Each side rotates daily within the pool the backend returns.
  const recentHot = hotFighters?.data.recent || [];
  const upcomingHot = hotFighters?.data.upcoming || [];
  const fighters: any[] = [
    ...rotateDaily(recentHot, 3, dayKey),
    ...rotateDaily(upcomingHot, 3, dayKey),
  ];

  // Most-followed + recently-booked rails rotate daily over their top pools so
  // the home feed stays fresh between fight weekends (top comments / classic
  // throwback already rotate server-side).
  const followedFighters = rotateDaily(topFollowed?.data || [], 6, dayKey);
  const recentlyBooked = rotateDaily(recentlyBookedData?.data || [], 6, dayKey);
  const comments = (topComments?.data || []).slice(0, 3);
  const throwbackComment = topComments?.throwback || null;
  const classics = (classicFights?.data || []).slice(0, 5);

  // Highlighted fighter — portrait prefers the action shot, bio prefers the
  // structured tldr, then falls back to the summary string.
  const highlight = highlightedFighterData?.data || null;
  const highlightFighter = highlight?.fighter || null;
  const highlightTopFight = highlight?.topFight || null;
  const highlightSummary = highlightFighter
    ? highlightFighter.aiProfile?.tldr || highlightFighter.aiProfileSummary || ''
    : '';
  const highlightRecord = (() => {
    if (!highlightFighter) return '';
    const w = highlightFighter.wins ?? 0, l = highlightFighter.losses ?? 0, d = highlightFighter.draws ?? 0;
    if (w + l + d === 0) return '';
    return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
  })();

  // --- Comment upvote (optimistic, shares cache with Community) ------------
  const upvoteMutation = useMutation({
    mutationFn: ({ fightId, reviewId }: { fightId: string; reviewId: string }) =>
      apiService.toggleReviewUpvote(fightId, reviewId),
    onMutate: async ({ reviewId }) => {
      setUpvotingCommentId(reviewId);
      await queryClient.cancelQueries({ queryKey: ['topComments'] });
      const previous = queryClient.getQueryData(['topComments']);
      const toggle = (c: any) =>
        c && c.id === reviewId
          ? {
              ...c,
              userHasUpvoted: !c.userHasUpvoted,
              upvotes: c.userHasUpvoted ? c.upvotes - 1 : c.upvotes + 1,
            }
          : c;
      queryClient.setQueryData(['topComments'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map(toggle),
          throwback: toggle(old.throwback),
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
    router.push(`/blog/${slug}` as any);
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
    {/* Pinned search bar — shown when the header magnifying glass is toggled */}
    <SearchBar />
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
        <View>
      {/* Editorial / Blog ---------------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="The Latest"
        icon="newspaper-o"
        onSeeAll={() => router.push('/blog' as any)}
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

      {/* Events This Weekend ------------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Events This Weekend"
        icon="fire-flame-curved"
        iconLib="fa6"
        onSeeAll={() => router.push('/(tabs)/events' as any)}
      >
        {isEventsLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : upcomingEvents.length > 0 ? (
          <View style={styles.eventGrid}>
            {upcomingEvents.map((event) => (
              <EventThumbnail
                key={event.id}
                event={event}
                colors={colors}
                styles={styles}
                onPress={() => router.push(`/event/${event.id}` as any)}
              />
            ))}
          </View>
        ) : (
          <Empty styles={styles} text="No events this weekend" />
        )}
      </Section>

      {/* Most Hyped Upcoming Fights ----------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Hyped Upcoming Fights"
        icon="bolt"
        onSeeAll={() => router.push('/(tabs)/events' as any)}
      >
        {isUpcomingLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : upcomingFights.length > 0 ? (
          (() => {
            // Running index across groups so the alternating card backgrounds
            // stay continuous instead of resetting per event.
            let flatIndex = 0;
            return groupByEvent(upcomingFights).map((g, gi) => (
              <View key={g.event?.id ?? gi} style={{ marginBottom: 8 }}>
                <Text style={[styles.fightGroupHeading, styles.hypedGroupHeading]}>
                  {`${promotionLabel(g.event?.promotion) || 'Event'} ${eventRelativePhrase(g.event?.mainStartTime ?? g.event?.date)}`.trim()}
                </Text>
                {g.fights.map((fight: any) => (
                  <UpcomingFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={() => setModalFight(fight)}
                    showEvent={false}
                    index={flatIndex++}
                  />
                ))}
              </View>
            ));
          })()
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

      {/* Highlighted Fighter — daily-rotating AI-enriched fighter ------------*/}
      {highlightFighter && (
        <Section colors={colors} styles={styles} title="Highlighted Fighter" icon="user-circle" iconLib="fa6">
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.highlightCard}
            onPress={() => router.push(`/fighter/${highlightFighter.id}` as any)}
          >
            <Image
              source={getFighterImage({
                ...highlightFighter,
                profileImage: highlightFighter.actionImage || highlightFighter.profileImage,
              })}
              style={styles.highlightImage}
              resizeMode="cover"
            />
            <View style={styles.highlightBody}>
              {highlightFighter.nickname ? (
                <Text style={styles.highlightNickname}>&ldquo;{highlightFighter.nickname}&rdquo;</Text>
              ) : null}
              <Text style={styles.highlightName}>{getFighterDisplayName(highlightFighter)}</Text>
              {(highlightRecord || highlightFighter.weightClass) ? (
                <Text style={styles.highlightMeta}>
                  {[highlightRecord, highlightFighter.weightClass].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {highlightSummary ? (
                <Text style={styles.highlightSummary} numberOfLines={5}>{highlightSummary}</Text>
              ) : null}
              {highlightTopFight ? (
                <Text style={styles.highlightTopFight}>
                  <Text style={styles.highlightTopFightLabel}>Top-rated fight: </Text>
                  {getFighterPrimaryName(highlightTopFight.fighter1)} vs {getFighterPrimaryName(highlightTopFight.fighter2)}
                  {highlightTopFight.averageRating != null && highlightTopFight.averageRating > 0
                    ? `  ★ ${highlightTopFight.averageRating === 10 ? '10' : highlightTopFight.averageRating.toFixed(1)}`
                    : ''}
                </Text>
              ) : null}
              <Text style={styles.highlightLink}>Full profile ›</Text>
            </View>
          </TouchableOpacity>
        </Section>
      )}

      {/* Hot Fighters -------------------------------------------------------*/}
      <Section colors={colors} styles={styles} title="Hot Fighters" icon="user" iconLib="fa6">
        {isFightersLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : fighters.length > 0 ? (
          fighters.map((f: any) => {
            // Upcoming (hyped) vs recent (rated) — distinguished by which date is set.
            const subtitle = f.nextFightDate
              ? `Fights ${f.opponentName} ${relUntilPhrase(f.nextFightDate)}`
              : `Fought ${f.opponentName} ${relAgoPhrase(f.lastFightDate)}`;
            return (
              <FighterCard
                key={f.fighter.id}
                fighter={f.fighter}
                subtitle={subtitle}
                hideNickname
                onPress={() => router.push(`/fighter/${f.fighter.id}` as any)}
              />
            );
          })
        ) : (
          <Empty styles={styles} text="No hot fighters yet" />
        )}
      </Section>

      {/* Recently Booked Fighters ------------------------------------------*/}
      {(isBookedLoading || recentlyBooked.length > 0) && (
        <Section
          colors={colors}
          styles={styles}
          title="Recently Booked"
          icon="calendar-plus"
          iconLib="fa6"
        >
          {isBookedLoading ? (
            <Loading colors={colors} styles={styles} />
          ) : (
            recentlyBooked.map((b: any) => (
              <FighterCard
                key={b.fighter.id}
                fighter={b.fighter}
                inlineOpponent={`vs ${b.opponentName}`}
                subtitle={`${b.event.name} ${relUntilPhrase(b.nextFightDate)}`}
                onPress={() => router.push(`/fighter/${b.fighter.id}` as any)}
              />
            ))
          )}
        </Section>
      )}

      {/* Most Followed Fighters (horizontal rail) --------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Most Followed"
        icon="users"
        iconLib="fa6"
        onSeeAll={isAuthenticated ? () => router.push('/followed-fighters' as any) : undefined}
      >
        {isFollowedLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : followedFighters.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          >
            {followedFighters.map((f: any) => (
              <FollowedFighterChip
                key={f.fighter.id}
                fighter={f.fighter}
                followerCount={f.followerCount}
                styles={styles}
                onPress={() => router.push(`/fighter/${f.fighter.id}` as any)}
              />
            ))}
          </ScrollView>
        ) : (
          <Empty styles={styles} text="No followed fighters yet" />
        )}
      </Section>

      {/* Top Community Comments --------------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Top Comments"
        icon="comments"
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

      {/* Classics to Watch (historic highly-rated, unrated by user) --------*/}
      {(isClassicsLoading || classics.length > 0) && (
        <Section colors={colors} styles={styles} title="Classics to Watch" icon="film" iconLib="fa6">
          {isClassicsLoading ? (
            <Loading colors={colors} styles={styles} />
          ) : (
            classics.map((fight: any, index: number) => (
              <CompletedFightCard
                key={fight.id}
                fight={fight}
                onPress={() => router.push(`/fight/${fight.id}?mode=completed` as any)}
                showEvent={true}
                index={index}
              />
            ))
          )}
        </Section>
      )}

      {/* Classic Throwback -------------------------------------------------*/}
      {throwbackComment && (
        <Section
          colors={colors}
          styles={styles}
          title="Classic Throwback"
          icon="clock-rotate-left"
          iconLib="fa6"
        >
          <CommentCard
            comment={throwbackComment}
            onPress={() =>
              throwbackComment.fight &&
              router.push(`/fight/${throwbackComment.fight.id}` as any)
            }
            onUpvote={() =>
              throwbackComment.fight &&
              upvoteMutation.mutate({
                fightId: throwbackComment.fight.id,
                reviewId: throwbackComment.id,
              })
            }
            isUpvoting={upvotingCommentId === throwbackComment.id}
            isAuthenticated={isAuthenticated}
          />
        </Section>
      )}

      {/* Feature spotlight — rotating "what you can do here" education ------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Did You Know?"
        icon="lightbulb"
        iconLib="fa6"
      >
        <FeatureSpotlight colors={colors} styles={styles} onNavigate={(route) => router.push(route as any)} />
      </Section>

        </View>
    </ScrollView>

    {/* Upcoming fight hype quick-view modal (Hyped Upcoming Fights section) */}
    <UpcomingFightModal
      visible={!!modalFight}
      fight={modalFight}
      onClose={() => setModalFight(null)}
    />
    </View>
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
    fightGroupHeading: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginHorizontal: 16,
      marginBottom: 6,
      marginTop: 4,
    },
    // Hyped Upcoming Fights group heading sits near the screen edge (overrides
    // the shared 16pt horizontal margin) so the "UFC in 2 days" label reads left.
    hypedGroupHeading: {
      marginLeft: 4,
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
    // Upcoming events 2×3 grid
    eventGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      justifyContent: 'space-between',
      rowGap: 16,
    },
    eventThumb: {
      width: '48%',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    eventThumbImageWrap: {
      position: 'relative',
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    eventThumbImage: {
      width: '100%',
      height: '100%',
    },
    eventThumbPlaceholder: {
      backgroundColor: '#1a1a2e',
      justifyContent: 'center',
      alignItems: 'center',
    },
    eventThumbLogo: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    eventThumbBody: {
      padding: 10,
    },
    eventThumbName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    eventThumbDate: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    // Most Followed horizontal chip
    followChip: {
      width: 92,
      alignItems: 'center',
    },
    followAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.border,
      marginBottom: 8,
    },
    followName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    followCount: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 2,
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
    // Highlighted Fighter card (portrait + bio + top fight)
    highlightCard: {
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
    },
    highlightImage: {
      width: '100%',
      height: 240,
      backgroundColor: colors.border,
    },
    highlightBody: {
      padding: 16,
    },
    highlightNickname: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    highlightName: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
    },
    highlightMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    highlightSummary: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginTop: 10,
    },
    highlightTopFight: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      marginTop: 12,
    },
    highlightTopFightLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    highlightLink: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
      marginTop: 12,
    },
    // Feature spotlight card
    spotlightCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 16,
      paddingVertical: 22,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    spotlightInner: {
      width: '100%',
      alignItems: 'center',
    },
    spotlightIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    spotlightTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    spotlightBody: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    spotlightHint: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.tint,
      marginTop: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    spotlightButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 8,
    },
    spotlightButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#000',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
}
