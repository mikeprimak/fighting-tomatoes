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
import { normalizeEventName, getFighterImage, getFighterName, getFighterDisplayName, getFighterPrimaryName, formatWeightClass } from '../../components/fight-cards/shared/utils';
import { getDefaultBanner } from '../../utils/defaultBanners';
import { getHypeHeatmapColor } from '../../utils/heatmap';
import { LinearGradient } from 'expo-linear-gradient';
import { formatEventDate, formatEventTime, getTimezoneAbbreviation } from '../../utils/dateFormatters';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import { useEventBroadcasts } from '../../components/HowToWatch';
import FighterCard from '../../components/FighterCard';
import { SearchBar } from '../../components';

const DEFAULT_FIGHTER_IMAGE = require('../../assets/fighters/fighter-default-alpha.png');

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

// "Events Today" / "Events Tomorrow" / "Events Saturday" — heading for a
// weekend event's per-day group. Event.date is a UTC-hour placeholder, so
// derive the day from its UTC calendar day vs the user's local today.
const eventDayLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const todayK = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const evK = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((evK - todayK) / 86_400_000);
  if (days <= 0) return 'Events Today';
  if (days === 1) return 'Events Tomorrow';
  const weekday = new Date(evK).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `Events ${weekday}`;
};

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
  aiEventSummary?: string | null;
  aiEventConfidence?: number | null;
}

// --- Presentational helpers (module scope so they don't remount on state change) ---

function Section({
  colors,
  styles,
  title,
  subtitle,
  icon,
  iconLib = 'fa',
  onSeeAll,
  children,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  title: string;
  subtitle?: string;
  icon: string;
  iconLib?: 'fa' | 'fa6';
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleCol}>
          <View style={styles.sectionTitleRow}>
            {iconLib === 'fa6' ? (
              <FontAwesome6 name={icon as any} size={20} color={colors.primary} />
            ) : (
              <FontAwesome name={icon as any} size={20} color={colors.primary} />
            )}
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
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
 * Full-width horizontal event card: image on the left, event name + date/start
 * time and a one-line AI "why care" blurb on the right. `description` is the
 * existing aiPreviewShort of the event's main event — already confidence-gated
 * by the caller — so a fan sees at a glance what's worth tuning in for.
 */
function EventRow({
  event,
  description,
  colors,
  styles,
  onPress,
  hideMeta = false,
}: {
  event: Event;
  description?: string | null;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  hideMeta?: boolean;
}) {
  const imageSource = event.bannerImage
    ? { uri: event.bannerImage }
    : getDefaultBanner(event.promotion || '');
  const name = normalizeEventName(event.name, event.promotion);

  // Real start instant lives in mainStartTime (event.date is a UTC-hour
  // placeholder) — only show a time when we actually have one, in the user's
  // local zone with its abbreviation (e.g. "8:00 PM ET").
  const startTime = event.mainStartTime
    ? `${formatEventTime(event.mainStartTime)} ${getTimezoneAbbreviation(new Date(event.mainStartTime))}`
    : null;

  // Main-card broadcast channel for the user's region, shown beside the time.
  // Prefer the MAIN_CARD entry (matches mainStartTime), then a whole-event one.
  const { data: broadcastsData } = useEventBroadcasts(hideMeta ? '' : event.id);
  const channel = React.useMemo(() => {
    const bs = broadcastsData?.broadcasts || [];
    const entry =
      bs.find((b) => b.cardSection === 'MAIN_CARD') ||
      bs.find((b) => b.cardSection === null) ||
      bs[0];
    return entry?.channel?.name || null;
  }, [broadcastsData]);

  // Date now lives once under the day's section heading — the card meta line is
  // just the start time + broadcast channel.
  const dateLine = [startTime, channel].filter(Boolean).join(' · ');

  const isLive = event.eventStatus === 'LIVE';

  return (
    <TouchableOpacity style={styles.eventRow} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.eventRowImageWrap}>
        {imageSource ? (
          <Image source={imageSource} style={styles.eventRowImage} resizeMode="cover" />
        ) : (
          <View style={[styles.eventRowImage, styles.eventThumbPlaceholder]}>
            <PromotionLogo promotion={event.promotion || ''} size={32} color="#FFFFFF" />
          </View>
        )}
      </View>
      <View style={styles.eventRowBody}>
        <Text style={styles.eventRowName} numberOfLines={2}>
          {name}
        </Text>
        {hideMeta ? null : isLive ? (
          // Live: the LIVE pill takes the start-time slot (start time dropped).
          <View style={styles.eventRowMetaLine}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            {channel ? <Text style={styles.eventRowDate}>{channel}</Text> : null}
          </View>
        ) : dateLine ? (
          <Text style={styles.eventRowDate}>{dateLine}</Text>
        ) : null}
        {description ? (
          <Text style={styles.eventRowDesc}>{description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * One row inside a HypedEventCard: facing fighter headshots, the matchup, an
 * optional weight-class / title tag, and a heatmap-colored community-hype badge
 * with the number of fans who hyped it. Non-interactive — the whole card taps
 * through to the event page. Deliberately leaves out "my hype" — this is a
 * discovery surface.
 */
function HypedFightRow({
  fight,
  colors,
  styles,
  isLast,
  mode = 'hype',
}: {
  fight: any;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  isLast: boolean;
  mode?: 'hype' | 'rating';
}) {
  const [img1Err, setImg1Err] = React.useState(false);
  const [img2Err, setImg2Err] = React.useState(false);
  const img1 = img1Err ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter1);
  const img2 = img2Err ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter2);

  // The score badge is identical in shape for both surfaces — community HYPE for
  // upcoming fights, community RATING for recent ones — only the source field and
  // count differ. The heatmap palette is shared.
  const isRating = mode === 'rating';
  const hype: number = (isRating ? fight.averageRating : fight.averageHype) || 0;
  const hypeColor = getHypeHeatmapColor(hype);
  const hypeCount: number = (isRating ? fight.totalRatings : fight.hypeCount) || 0;

  const name1 = getFighterPrimaryName(fight.fighter1);
  const name2 = getFighterPrimaryName(fight.fighter2);
  const tag = fight.isTitle ? (fight.titleName || 'Title Fight') : formatWeightClass(fight.weightClass);

  return (
    <View style={[styles.hypedRow, !isLast && styles.hypedRowDivider]}>
      {/* Facing headshots */}
      <View style={styles.hypedHeadshots}>
        <Image source={img1} style={styles.hypedHeadshot} onError={() => setImg1Err(true)} />
        <Image source={img2} style={[styles.hypedHeadshot, styles.hypedHeadshot2]} onError={() => setImg2Err(true)} />
      </View>

      {/* Matchup + tag */}
      <View style={styles.hypedRowBody}>
        <Text style={styles.hypedMatchup} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          <Text style={styles.hypedMatchupName}>{name1}</Text>
          <Text style={styles.hypedVs}>  vs  </Text>
          <Text style={styles.hypedMatchupName}>{name2}</Text>
        </Text>
        {tag ? (
          <Text style={styles.hypedTag} numberOfLines={1}>
            {tag}
          </Text>
        ) : null}
      </View>

      {/* Community hype square — identical to UpcomingFightCard's left box:
          heatmap fill, white hype number, user count in parentheses, no flame. */}
      <View style={[styles.hypedBadge, { backgroundColor: hypeColor }]}>
        <Text style={styles.hypedBadgeNum}>{hype === 10 ? '10' : hype.toFixed(1)}</Text>
        {hypeCount > 0 ? (
          <Text style={styles.hypedBadgeCount}>({hypeCount})</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Event-grouped card for "Hyped Upcoming Fights": a banner header (event image
 * + name + relative date, tapping opens the event) over a list of that event's
 * most-hyped fights (HypedFightRow). Mirrors the clean imagery of the This
 * Weekend cards while listing every top fight on the card.
 */
function HypedEventCard({
  event,
  fights,
  colors,
  styles,
  mode = 'hype',
  onPressEvent,
}: {
  event: any;
  fights: any[];
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
  mode?: 'hype' | 'rating';
  onPressEvent: () => void;
}) {
  const imageSource = event?.bannerImage
    ? { uri: event.bannerImage }
    : getDefaultBanner(event?.promotion || '');
  const name = normalizeEventName(event?.name || 'Event', event?.promotion);
  // Upcoming surface shows a forward relative date ("in 3 days"); the recent
  // surface shows the actual (past) event date.
  const when = mode === 'rating'
    ? formatEventDate(event?.mainStartTime ?? event?.date)
    : eventRelativePhrase(event?.mainStartTime ?? event?.date);

  // Anchor the banner crop to the TOP of the image (faces sit near the top of
  // fight posters; a centered cover crops to chests). Render the image full-width
  // at its true aspect ratio, pinned to top, and let the fixed-height box clip the
  // bottom. Seed a wide default so there's no resize flash before onLoad fires.
  const [bannerRatio, setBannerRatio] = React.useState(16 / 9);

  return (
    // The whole card — banner and every fight row — taps through to the event;
    // no part links to an individual fight page.
    <TouchableOpacity style={styles.hypedCard} activeOpacity={0.9} onPress={onPressEvent}>
      {/* Banner header */}
      <View>
        <View style={styles.hypedBanner}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={[styles.hypedBannerImage, { aspectRatio: bannerRatio }]}
              resizeMode="cover"
              onLoad={(e) => {
                const src: any = e?.nativeEvent?.source;
                if (src?.width && src?.height) setBannerRatio(src.width / src.height);
              }}
            />
          ) : (
            <View style={[styles.hypedBannerImage, styles.eventThumbPlaceholder, { aspectRatio: undefined, height: '100%' }]}>
              <PromotionLogo promotion={event?.promotion || ''} size={40} color="#FFFFFF" />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
            style={styles.hypedBannerOverlay}
          />
          <View style={styles.hypedBannerTextWrap}>
            <Text style={styles.hypedBannerName} numberOfLines={1}>
              {name}
            </Text>
            {when ? (
              <Text style={styles.hypedBannerWhen}>{when}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Fights */}
      <View style={styles.hypedFightList}>
        {fights.map((fight, i) => (
          <HypedFightRow
            key={fight.id}
            fight={fight}
            colors={colors}
            styles={styles}
            isLast={i === fights.length - 1}
            mode={mode}
          />
        ))}
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

  // --- Data ---------------------------------------------------------------
  const { data: editorial, isLoading: isEditorialLoading } = useQuery({
    queryKey: ['editorial'],
    queryFn: () => apiService.getEditorial(8),
    staleTime: 30 * 60 * 1000, // 30 min — blog changes rarely
  });

  const { data: eventsData, isLoading: isEventsLoading } = useQuery({
    queryKey: ['events', 'upcoming', 'withFights'],
    // Home event cards show only the event + its AI "why care" summary (no fight
    // list), so don't pull fight cards here — includeFights makes the backend
    // aggregate hype/counts for every fight on every event (slow + heavy). The
    // events SCREENS still use includeFights; the home doesn't need it.
    queryFn: () => apiService.getEvents({ type: 'upcoming', includeFights: false }),
    staleTime: 5 * 60 * 1000,
  });

  // Past events, used only to surface "Event Last Night" — the most recent UFC
  // card that ran in the last day (UFC only, by design). Past events come back
  // most-recent-first, so a small page covers the window.
  const { data: pastEventsData } = useQuery({
    queryKey: ['events', 'past', 'lastNightUFC'],
    queryFn: () => apiService.getEvents({ type: 'past', includeFights: false, limit: 8 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: topUpcomingFights, isLoading: isUpcomingLoading } = useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, 'week'],
    queryFn: () => apiService.getTopUpcomingFights('week'),
    staleTime: 5 * 60 * 1000,
  });

  // Recent Good Fights: best fights from the last couple weeks (rating > 7 with
  // >= 3 ratings), grouped by event server-side (<= 3 events, <= 3 fights/event).
  const { data: recentGoodFights, isLoading: isRecentLoading } = useQuery({
    queryKey: ['recentGoodFights'],
    queryFn: () => apiService.getRecentGoodFights(),
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
  // "This week" = every event from today through the next 7 days (a rolling
  // window, not the rest of the Mon–Sun calendar week). The old week-bounded
  // window collapsed to a single day on Sunday — and since cards cluster Fri/Sat,
  // by Sunday the next card was already outside it, so the band read "No events
  // this weekend" all day Sunday. A rolling 7-day window always reaches the next
  // card. Compared as UTC day keys to line up with eventDayKey (Event.date is a
  // UTC-hour placeholder); anchored on the user's local calendar date.
  const DAY_MS = 86_400_000;
  const nowLocal = new Date();
  const todayKey = Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
  const windowEndKey = todayKey + 7 * DAY_MS; // today + next 6 days (7 calendar days)
  const upcomingEvents: Event[] = (eventsData?.events || [])
    // Keep LIVE events in the list (badged "LIVE" on the card) alongside the
    // UPCOMING ones — a card that just went live shouldn't vanish from the day.
    .filter((e: Event) => e.eventStatus === 'UPCOMING' || e.eventStatus === 'LIVE')
    .filter((e: Event) => {
      const k = eventDayKey(e.date);
      return k >= todayKey && k < windowEndKey;
    })
    .sort((a: Event, b: Event) => {
      const dayDiff = eventDayKey(a.date) - eventDayKey(b.date);
      if (dayDiff !== 0) return dayDiff;
      // Live events float to the top of their day — they're happening right now.
      const aLive = a.eventStatus === 'LIVE';
      const bLive = b.eventStatus === 'LIVE';
      if (aLive !== bLive) return aLive ? -1 : 1;
      if (isUFC(a) !== isUFC(b)) return isUFC(a) ? -1 : 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  // Group the weekend events by calendar day so each day renders under its own
  // heading (Today / Tomorrow / Saturday …), first-appearance order preserved
  // (upcomingEvents is already day-sorted with UFC floated up within each day).
  const eventsByDay: { label: string; events: Event[] }[] = (() => {
    const groups: { label: string; events: Event[] }[] = [];
    const byKey = new Map<number, { label: string; events: Event[] }>();
    for (const e of upcomingEvents) {
      const k = eventDayKey(e.date);
      let g = byKey.get(k);
      if (!g) {
        g = { label: eventDayLabel(e.date), events: [] };
        byKey.set(k, g);
        groups.push(g);
      }
      g.events.push(e);
    }
    return groups;
  })();

  // "Event Last Night" — UFC only (not other promotions). A UFC card belongs here
  // on the day(s) immediately after it ran: its UTC calendar day is today or
  // yesterday (UFC events start late and roll past midnight ET, so "yesterday"
  // catches the common Saturday-night → Sunday-morning case). Most-recent-first.
  const lastNightUFC: Event[] = (pastEventsData?.events || []).filter((e: Event) => {
    if (!isUFC(e)) return false;
    const daysSince = Math.round((todayKey - eventDayKey(e.date)) / DAY_MS);
    return daysSince >= 0 && daysSince <= 1;
  });

  const upcomingFights = (topUpcomingFights?.data || []).slice(0, 5);
  // Already capped + ordered server-side; group by event for the event-card UI.
  const recentGoodGroups = groupByEvent(recentGoodFights?.data || []);

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
  const highlightNextFight = highlight?.nextFight || null;
  const highlightMostRecentFight = highlight?.mostRecentFight || null;
  // When the fighter has nothing booked, surface their most recent bout above
  // the top-rated one. If that bout *is* the top-rated one, don't show it twice —
  // just relabel the single line "Most Recent Fight" (task 1).
  const highlightHasUpcoming = !!highlightNextFight;
  const highlightSameRecentTop =
    !!highlightMostRecentFight && !!highlightTopFight && highlightMostRecentFight.id === highlightTopFight.id;
  const highlightShowMostRecent =
    !highlightHasUpcoming && !!highlightMostRecentFight && !highlightSameRecentTop;
  const highlightTopFightLabel =
    !highlightHasUpcoming && highlightSameRecentTop ? 'Most Recent Fight' : 'Top-rated fight';
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
      {/* Event Last Night — UFC only, the day(s) after a UFC card ran --------*/}
      {lastNightUFC.length > 0 ? (
        <Section
          colors={colors}
          styles={styles}
          title="Event Last Night"
          subtitle={lastNightUFC.length === 1 ? formatEventDate(lastNightUFC[0].date) : undefined}
          icon="calendar"
        >
          <View style={styles.eventList}>
            {lastNightUFC.map((event) => {
              const description =
                event.aiEventConfidence != null && event.aiEventConfidence >= 0.5 && event.aiEventSummary
                  ? event.aiEventSummary
                  : null;
              return (
                <EventRow
                  key={event.id}
                  event={event}
                  description={description}
                  colors={colors}
                  styles={styles}
                  hideMeta
                  onPress={() => router.push(`/event/${event.id}` as any)}
                />
              );
            })}
          </View>
        </Section>
      ) : null}

      {/* Events by day — Today / Tomorrow / Saturday … ---------------------*/}
      {isEventsLoading ? (
        <Section
          colors={colors}
          styles={styles}
          title="This Week"
          icon="fire-flame-curved"
          iconLib="fa6"
        >
          <Loading colors={colors} styles={styles} />
        </Section>
      ) : eventsByDay.length > 0 ? (
        eventsByDay.map((day, di) => (
          <Section
            key={day.label}
            colors={colors}
            styles={styles}
            title={day.label}
            subtitle={formatEventDate(day.events[0].date)}
            icon="calendar"
            onSeeAll={di === 0 ? () => router.push('/(tabs)/events' as any) : undefined}
          >
            <View style={styles.eventList}>
              {day.events.map((event) => {
                // Card-wide AI "why care" blurb, gated on the same confidence
                // floor the fight screens use (>= 0.5). Event-level summary only —
                // the home no longer loads fights, so there's no per-fight fallback.
                const description =
                  event.aiEventConfidence != null && event.aiEventConfidence >= 0.5 && event.aiEventSummary
                    ? event.aiEventSummary
                    : null;
                return (
                  <EventRow
                    key={event.id}
                    event={event}
                    description={description}
                    colors={colors}
                    styles={styles}
                    onPress={() => router.push(`/event/${event.id}` as any)}
                  />
                );
              })}
            </View>
          </Section>
        ))
      ) : (
        <Section
          colors={colors}
          styles={styles}
          title="This Week"
          icon="fire-flame-curved"
          iconLib="fa6"
        >
          <Empty styles={styles} text="No events in the next 7 days" />
        </Section>
      )}

      {/* Most Hyped Upcoming Fights ----------------------------------------*/}
      <Section
        colors={colors}
        styles={styles}
        title="Top Upcoming Fights"
        icon="fire-flame-curved"
        iconLib="fa6"
        onSeeAll={() => router.push('/(tabs)/events' as any)}
      >
        {isUpcomingLoading ? (
          <Loading colors={colors} styles={styles} />
        ) : upcomingFights.length > 0 ? (
          groupByEvent(upcomingFights).map((g, gi) => (
            <HypedEventCard
              key={g.event?.id ?? gi}
              event={g.event}
              fights={g.fights}
              colors={colors}
              styles={styles}
              onPressEvent={() =>
                g.event?.id && router.push(`/event/${g.event.id}` as any)
              }
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
        ) : recentGoodGroups.length > 0 ? (
          recentGoodGroups.map((g, gi) => (
            <HypedEventCard
              key={g.event?.id ?? gi}
              event={g.event}
              fights={g.fights}
              colors={colors}
              styles={styles}
              mode="rating"
              onPressEvent={() =>
                g.event?.id && router.push(`/event/${g.event.id}` as any)
              }
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
              {/* Most recent bout (only when nothing is booked and it differs
                  from the top-rated fight), shown above the top-rated line. */}
              {highlightShowMostRecent ? (
                <View style={styles.highlightFightLine}>
                  <Text style={styles.highlightFightLabel}>Most Recent Fight</Text>
                  <Text style={styles.highlightFightMatchup}>
                    {getFighterPrimaryName(highlightMostRecentFight.fighter1)} vs {getFighterPrimaryName(highlightMostRecentFight.fighter2)}
                    {highlightMostRecentFight.averageRating > 0
                      ? `  ★ ${highlightMostRecentFight.averageRating === 10 ? '10' : Number(highlightMostRecentFight.averageRating).toFixed(1)}`
                      : ''}
                  </Text>
                </View>
              ) : null}
              {/* Top-rated fight + next scheduled bout, inline inside the card's
                  border (replaces the separate full fight card). */}
              {highlightTopFight ? (
                <View style={styles.highlightFightLine}>
                  <Text style={styles.highlightFightLabel}>{highlightTopFightLabel}</Text>
                  <Text style={styles.highlightFightMatchup}>
                    {getFighterPrimaryName(highlightTopFight.fighter1)} vs {getFighterPrimaryName(highlightTopFight.fighter2)}
                    {highlightTopFight.averageRating > 0
                      ? `  ★ ${highlightTopFight.averageRating === 10 ? '10' : Number(highlightTopFight.averageRating).toFixed(1)}`
                      : ''}
                  </Text>
                </View>
              ) : null}
              {highlightNextFight ? (
                <View style={styles.highlightFightLine}>
                  <Text style={styles.highlightFightLabel}>Next scheduled fight</Text>
                  <Text style={styles.highlightFightMatchup}>
                    {getFighterPrimaryName(highlightNextFight.fighter1)} vs {getFighterPrimaryName(highlightNextFight.fighter2)}
                    {(() => {
                      const w = eventRelativePhrase(highlightNextFight.event?.mainStartTime ?? highlightNextFight.event?.date);
                      return w ? `  ·  ${w}` : '';
                    })()}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.highlightLink}>Full profile ›</Text>
            </View>
          </TouchableOpacity>
        </Section>
      )}

      {/* The Latest / Editorial blog (moved below Highlighted Fighter) ------*/}
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

      {/* Hot Fighters — hidden from the home UI (removed per product). */}

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
    sectionTitleCol: {
      flexShrink: 1,
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
    sectionSubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 3,
      marginLeft: 28,
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
    // Full-width horizontal event cards (image left, details right)
    eventList: {
      paddingHorizontal: 16,
      gap: 12,
    },
    eventRow: {
      flexDirection: 'row',
      minHeight: 96,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    eventRowImageWrap: {
      position: 'relative',
      width: 120,
      backgroundColor: colors.border,
    },
    // Absolute-fill so the (remote) image can't drive the card height — the row
    // height comes from the text column, and the image fills whatever that is.
    eventRowImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    // Meta line under the title: holds either the start-time/channel text, or
    // (for live events) the LIVE pill in the start-time slot.
    eventRowMetaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    // Rounded red LIVE pill (sits in the meta row, so wrapping isn't a concern).
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#E11D2A',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    liveDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#FFFFFF',
      marginRight: 4,
    },
    liveBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    eventThumbPlaceholder: {
      backgroundColor: '#1a1a2e',
      justifyContent: 'center',
      alignItems: 'center',
    },
    eventRowBody: {
      flex: 1,
      padding: 12,
    },
    eventRowName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    eventRowDate: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    eventRowDesc: {
      marginTop: 6,
      fontSize: 11,
      lineHeight: 15,
      color: colors.textSecondary,
    },
    // --- Hyped Upcoming Fights: event-grouped cards ----------------------
    hypedCard: {
      marginHorizontal: 16,
      marginBottom: 14,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    hypedBanner: {
      height: 104,
      backgroundColor: colors.border,
      position: 'relative',
      justifyContent: 'flex-end',
      overflow: 'hidden', // clip the full-height image so only its top shows
    },
    // Full-width, true-aspect-ratio image pinned to the top; the 104px box clips
    // the bottom so faces (top of the poster) stay visible instead of chests.
    hypedBannerImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      minHeight: 104, // never shorter than the box (ultra-wide banners fall back to cover)
    },
    hypedBannerOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 80,
    },
    hypedBannerTextWrap: {
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    hypedBannerName: {
      fontSize: 18,
      fontWeight: '800',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    hypedBannerWhen: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.9)',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 3,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    hypedFightList: {
      paddingHorizontal: 14,
    },
    hypedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      gap: 12,
    },
    hypedRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    hypedHeadshots: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 64,
    },
    hypedHeadshot: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.border,
      borderWidth: 2,
      borderColor: colors.card,
    },
    hypedHeadshot2: {
      marginLeft: -14,
    },
    hypedRowBody: {
      flex: 1,
    },
    hypedMatchup: {
      fontSize: 15,
    },
    hypedMatchupName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    hypedVs: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    hypedTag: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    // Mirrors UpcomingFightCard's `hypeSquare` (left box) exactly.
    hypedBadge: {
      width: 48,
      height: 48,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hypedBadgeNum: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.7)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    hypedBadgeCount: {
      color: 'rgba(0,0,0,0.6)',
      fontSize: 9,
      fontWeight: '600',
      textAlign: 'center',
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
    highlightFightLine: {
      marginTop: 12,
    },
    highlightFightLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    highlightFightMatchup: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
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
