import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  findNodeHandle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  HTMLElementModel,
  HTMLContentModel,
  type CustomBlockRenderer,
} from 'react-native-render-html';
import { apiService } from '../../services/api';
import { Colors } from '../../constants/Colors';

/**
 * Mobile rich-block rendering layer for the native blog reader.
 *
 * Blog posts are authored as markdown in `packages/web/src/content/posts` and
 * served as HTML by `/api/editorial`. Rich blocks are encoded there as raw HTML
 * divs that the WEB upgrades into React components:
 *   - `<div class="fb-post" data-href="...">`      -> a Facebook embed
 *   - `<div class="gf-fight-card" data-fight-id>`  -> a live Good Fights card
 *
 * `react-native-render-html` can't run that web hydration, so on mobile we:
 *   1. `transformBlogBlocks()` rewrites those empty divs into custom tags
 *      (`<fbembed>` / `<gffight>`) that won't be pruned as empty content.
 *   2. `blogElementModels` registers them as block elements.
 *   3. `makeBlogRenderers()` renders a real WebView embed / native fight card.
 *
 * Heavy WebViews are lazy-mounted (only when scrolled near the viewport) so an
 * article with a dozen embeds doesn't spin up a dozen WebViews at once.
 */

// ---------------------------------------------------------------------------
// Scroll visibility controller (drives lazy-mounting)
// ---------------------------------------------------------------------------

type ScrollState = { scrollY: number; viewportH: number };

type ScrollCtx = {
  contentNode: number | null;
  getState: () => ScrollState;
  subscribe: (fn: (s: ScrollState) => void) => () => void;
};

const BlogScrollContext = createContext<ScrollCtx | null>(null);

/**
 * Wire this into the blog ScrollView. Returns the context value plus handlers
 * the screen attaches to the ScrollView (onScroll/onLayout) and to a single
 * wrapper View around ALL scroll content (ref/onLayout) — measuring embeds
 * against that wrapper keeps their Y in the same origin as `contentOffset.y`.
 */
export function useBlogScrollController() {
  const stateRef = useRef<ScrollState>({ scrollY: 0, viewportH: 0 });
  const subs = useRef(new Set<(s: ScrollState) => void>());
  const contentRef = useRef<View>(null);
  const [contentNode, setContentNode] = useState<number | null>(null);

  const notify = useCallback(() => {
    subs.current.forEach((fn) => fn(stateRef.current));
  }, []);

  const onContentLayout = useCallback(() => {
    const node = contentRef.current ? findNodeHandle(contentRef.current) : null;
    if (node != null) setContentNode(node);
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      stateRef.current = { ...stateRef.current, scrollY: e.nativeEvent.contentOffset.y };
      notify();
    },
    [notify],
  );

  const onViewportLayout = useCallback(
    (e: LayoutChangeEvent) => {
      stateRef.current = { ...stateRef.current, viewportH: e.nativeEvent.layout.height };
      notify();
    },
    [notify],
  );

  const ctx = useMemo<ScrollCtx>(
    () => ({
      contentNode,
      getState: () => stateRef.current,
      subscribe: (fn) => {
        subs.current.add(fn);
        return () => {
          subs.current.delete(fn);
        };
      },
    }),
    [contentNode],
  );

  return { ctx, contentRef, onContentLayout, onScroll, onViewportLayout };
}

export function BlogScrollProvider({
  value,
  children,
}: {
  value: ScrollCtx;
  children: React.ReactNode;
}) {
  return <BlogScrollContext.Provider value={value}>{children}</BlogScrollContext.Provider>;
}

/** Renders `children` only once scrolled within ~700px of the viewport. */
function LazyMount({ minHeight, children }: { minHeight: number; children: React.ReactNode }) {
  const ctx = useContext(BlogScrollContext);
  const ref = useRef<View>(null);
  const yRef = useRef<number | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const BUFFER = 700;

  const check = useCallback((s: ScrollState) => {
    if (yRef.current == null || s.viewportH === 0) return;
    if (s.scrollY + s.viewportH + BUFFER >= yRef.current) setVisible(true);
  }, []);

  const onLayout = useCallback(() => {
    if (!ctx || ctx.contentNode == null || !ref.current) return;
    try {
      ref.current.measureLayout(
        ctx.contentNode as unknown as number,
        (_x, y) => {
          yRef.current = y;
          if (fallbackTimer.current) {
            clearTimeout(fallbackTimer.current);
            fallbackTimer.current = null;
          }
          check(ctx.getState());
        },
        () => {},
      );
    } catch {
      // measurement is best-effort; the fallback timer below still mounts it
    }
  }, [ctx, check]);

  useEffect(() => {
    if (!ctx) {
      setVisible(true);
      return;
    }
    const unsub = ctx.subscribe(check);
    check(ctx.getState());
    // Safety net: if measurement never lands, mount anyway so content is never lost.
    fallbackTimer.current = setTimeout(() => setVisible(true), 5000);
    return () => {
      unsub();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [ctx, check]);

  return (
    <View ref={ref} onLayout={onLayout} style={visible ? undefined : { minHeight }}>
      {visible ? children : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Facebook embed (WebView)
// ---------------------------------------------------------------------------

const FB_INJECTED = `
  (function () {
    function send() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(String(Math.ceil(document.body.scrollHeight)));
      }
    }
    send();
    window.addEventListener('load', send);
    var n = 0;
    var i = setInterval(function () { send(); if (++n > 6) clearInterval(i); }, 600);
  })();
  true;
`;

function FacebookEmbed({ href, width }: { href: string; width: number }) {
  const [height, setHeight] = useState(360);
  // FB's post plugin floors at 350px; on the narrowest phones a few px clip,
  // which the column already tolerates. Cap at the plugin's 500px max.
  const fbWidth = Math.min(Math.round(width), 500);
  const uri =
    `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(href)}` +
    `&show_text=false&width=${fbWidth}`;

  return (
    <LazyMount minHeight={320}>
      <View style={styles.embedWrap}>
        <WebView
          source={{ uri }}
          style={{ width: fbWidth, height, backgroundColor: 'transparent' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          injectedJavaScript={FB_INJECTED}
          onMessage={(e) => {
            const h = parseInt(e.nativeEvent.data, 10);
            if (!Number.isNaN(h) && h > 80 && Math.abs(h - height) > 4) setHeight(h);
          }}
          androidLayerType="hardware"
        />
      </View>
    </LazyMount>
  );
}

// ---------------------------------------------------------------------------
// Native Good Fights fight card (mirrors web BlogFightCard, spoiler-neutral)
// ---------------------------------------------------------------------------

/** Red -> amber -> green heat scale for a 0-10 fan rating (matches web intent). */
function ratingColor(v: number): string {
  if (v <= 0) return '#202020';
  const t = Math.max(0, Math.min(1, (v - 1) / 9));
  const hue = Math.round(t * 120); // 0 = red, 120 = green
  return `hsl(${hue}, 65%, 42%)`;
}

function FighterFace({
  name,
  image,
  colors,
}: {
  name: { first: string; last: string };
  image?: string | null;
  colors: typeof Colors.light;
}) {
  const initials = `${name.first?.[0] ?? ''}${name.last?.[0] ?? ''}`.toUpperCase();
  return (
    <View style={styles.fighterFace}>
      {image ? (
        <Image source={{ uri: image }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.card }]}>
          <Text style={[styles.avatarInitials, { color: colors.textSecondary }]}>{initials}</Text>
        </View>
      )}
      <View style={styles.fighterNameCol}>
        <Text style={[styles.fighterFirst, { color: colors.textSecondary }]} numberOfLines={1}>
          {name.first}
        </Text>
        <Text style={[styles.fighterLast, { color: colors.text }]} numberOfLines={1}>
          {name.last}
        </Text>
      </View>
    </View>
  );
}

function BlogFightCard({
  fightId,
  rank,
  colors,
}: {
  fightId: string;
  rank?: number;
  colors: typeof Colors.light;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['blogFight', fightId],
    queryFn: () => apiService.getFight(fightId),
    staleTime: 30 * 60 * 1000,
  });

  const fight = data?.fight;

  if (isLoading) {
    return (
      <View style={[styles.cardSkeleton, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  if (!fight) return null; // a bad id never breaks the article

  const avg = fight.averageRating ?? 0;
  const total = fight.totalRatings ?? 0;
  const hasRating = avg > 0;
  const eventDate = fight.event?.date
    ? new Date(fight.event.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => router.push(`/fight/${fightId}` as never)}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      {rank ? (
        <View style={styles.rankCol}>
          <Text style={[styles.rankText, { color: colors.textSecondary }]}>#{rank}</Text>
        </View>
      ) : null}

      <View style={styles.cardMid}>
        <View style={styles.matchupRow}>
          <FighterFace
            name={{ first: fight.fighter1?.firstName ?? '', last: fight.fighter1?.lastName ?? '' }}
            image={fight.fighter1?.profileImage}
            colors={colors}
          />
          <Text style={[styles.vs, { color: colors.textSecondary }]}>vs</Text>
          <FighterFace
            name={{ first: fight.fighter2?.firstName ?? '', last: fight.fighter2?.lastName ?? '' }}
            image={fight.fighter2?.profileImage}
            colors={colors}
          />
        </View>
        {fight.event?.name ? (
          <Text style={[styles.eventLine, { color: colors.textSecondary }]} numberOfLines={1}>
            {fight.event.name}
            {eventDate ? ` · ${eventDate}` : ''}
          </Text>
        ) : null}
      </View>

      <View style={styles.ratingCol}>
        <View
          style={[
            styles.ratingBox,
            {
              backgroundColor: hasRating ? ratingColor(avg) : '#202020',
              borderColor: colors.border,
              borderWidth: hasRating ? 0 : 1,
            },
          ]}
        >
          <Text style={styles.ratingValue}>
            {hasRating ? (avg === 10 ? '10' : avg.toFixed(1)) : '–'}
          </Text>
        </View>
        <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
          {total === 1 ? '1 rating' : `${total.toLocaleString()} ratings`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// HTML transform + renderer wiring
// ---------------------------------------------------------------------------

/**
 * Rewrite the web's rich-block divs into custom tags the RN renderer handles.
 * Empty `<div>`s can be pruned by the render engine; custom block tags with a
 * registered model survive.
 */
export function transformBlogBlocks(html: string): string {
  let out = html.replace(
    /<div\b[^>]*class="[^"]*\bfb-post\b[^"]*"[^>]*><\/div>/g,
    (m) => {
      const href = (m.match(/data-href="([^"]+)"/) || [])[1];
      return href ? `<fbembed data-href="${href}"></fbembed>` : '';
    },
  );
  out = out.replace(
    /<div\b[^>]*class="[^"]*\bgf-fight-card\b[^"]*"[^>]*><\/div>/g,
    (m) => {
      const fid = (m.match(/data-fight-id="([^"]+)"/) || [])[1];
      const rank = (m.match(/data-rank="([^"]+)"/) || [])[1];
      if (!fid) return '';
      return `<gffight data-fight-id="${fid}"${rank ? ` data-rank="${rank}"` : ''}></gffight>`;
    },
  );
  return out;
}

export const blogElementModels = {
  fbembed: HTMLElementModel.fromCustomModel({
    tagName: 'fbembed',
    contentModel: HTMLContentModel.block,
  }),
  gffight: HTMLElementModel.fromCustomModel({
    tagName: 'gffight',
    contentModel: HTMLContentModel.block,
  }),
};

export function makeBlogRenderers(contentWidth: number, colors: typeof Colors.light) {
  const FbRenderer: CustomBlockRenderer = ({ tnode }) => {
    const href = tnode.attributes['data-href'];
    if (!href) return null;
    return <FacebookEmbed href={href} width={contentWidth} />;
  };

  const FightRenderer: CustomBlockRenderer = ({ tnode }) => {
    const fightId = tnode.attributes['data-fight-id'];
    if (!fightId) return null;
    const rankAttr = tnode.attributes['data-rank'];
    const rank = rankAttr ? Number(rankAttr) : undefined;
    return (
      <BlogFightCard
        fightId={fightId}
        rank={rank != null && !Number.isNaN(rank) ? rank : undefined}
        colors={colors}
      />
    );
  };

  return { fbembed: FbRenderer, gffight: FightRenderer };
}

const styles = StyleSheet.create({
  embedWrap: {
    alignItems: 'center',
    marginVertical: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 14,
  },
  cardSkeleton: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 14,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCol: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 17,
    fontWeight: '700',
  },
  cardMid: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fighterFace: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '700',
  },
  fighterNameCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  fighterFirst: {
    fontSize: 11,
    lineHeight: 14,
  },
  fighterLast: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 17,
  },
  vs: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  eventLine: {
    fontSize: 11,
    textAlign: 'center',
  },
  ratingCol: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ratingBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ratingCount: {
    fontSize: 10,
  },
});
