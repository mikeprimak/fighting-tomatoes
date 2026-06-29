import React, { forwardRef, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, Animated } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { getFighterImage, formatEventName, formatDate } from './fight-cards/shared/utils';
import { getHypeHeatmapColor } from '../utils/heatmap';
import HypeDistributionChart from './HypeDistributionChart';
import RatingDistributionChart from './RatingDistributionChart';

// Minimal shape the card actually reads. Kept deliberately loose so the
// varied local `Fight` interfaces in the parent modals (event?: any, etc.)
// satisfy it without coupling to the full FightData type.
export interface ShareCardFighter {
  firstName?: string;
  lastName?: string;
  nickname?: string | null;
  profileImage?: string | null;
}

export interface ShareCardFight {
  id: string;
  event?: { name?: string; date?: string; promotion?: string } | null;
  fighter1: ShareCardFighter;
  fighter2: ShareCardFighter;
}

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');
// High-res (2939×775) brand logo — comfortably oversized for the header, so it
// stays crisp when this view is later rasterized to a PNG for the share sheet.
const LOGO = require('../assets/GOOD-FIGHTS-LOGO-crisp.png');

// Branded, self-contained card shown after a user hypes or rates a fight.
// It is ALWAYS dark-themed (hardcoded palette, not the device color scheme) so
// every shared image looks identical and on-brand regardless of the viewer's
// settings.
//
// The story it tells at a glance: the matchup, MY score vs the COMMUNITY score
// (the comparison is the emotional hook), and the distribution with my vote
// marked (social proof + where I stand).
//
// forwardRef exposes the outer card View so a future capture step
// (react-native-view-shot) can snapshot exactly these pixels.

// Card palette — fixed, theme-independent.
const CARD = {
  bg: '#161618',
  panel: '#1F1F22',
  text: '#FFFFFF',
  textSecondary: '#9A9A9E',
  brand: '#F5C518', // Good Fights yellow
  hairline: '#2C2C30',
};

interface ShareableFightCardProps {
  variant: 'hype' | 'rating';
  fight: ShareCardFight;
  value: number; // the user's hype (1-10) or rating (1-10)
  average?: number; // community aggregate (averageHype / averageRating)
  distribution?: Record<number, number>; // community vote counts, keyed 1-10
  total?: number; // total community votes (incl. the user's)
  style?: ViewStyle;
}

function FighterColumn({ fighter }: { fighter: ShareCardFighter }) {
  const [imgError, setImgError] = useState(false);
  // getFighterImage only reads profileImage; cast to satisfy its Fighter type.
  const source = imgError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fighter as any);
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || first;

  return (
    <View style={styles.fighterColumn}>
      <Image
        source={source}
        style={styles.headshot}
        onError={() => setImgError(true)}
      />
      {!!first && first !== last && (
        <Text style={styles.firstName} numberOfLines={1}>
          {first}
        </Text>
      )}
      <Text style={styles.lastName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {last}
      </Text>
    </View>
  );
}

const ShareableFightCard = forwardRef<View, ShareableFightCardProps>(
  ({ variant, fight, value, average = 0, distribution = {}, total = 0 }, ref) => {
    const isHype = variant === 'hype';
    const myAccent = getHypeHeatmapColor(value);
    const myDisplay = Number.isInteger(value) ? `${value}` : value.toFixed(1);

    // "Community" is only meaningful when someone other than this user has voted.
    const hasCommunity = total > 1 && average > 0;
    const commAccent = hasCommunity ? getHypeHeatmapColor(average) : CARD.textSecondary;
    const commDisplay = hasCommunity ? average.toFixed(1) : '—';

    const hasDistribution = total > 0 && Object.keys(distribution).length > 0;

    // Static fade value — the chart components animate via this; on the card we
    // just want the bars shown (the modal handles the open animation).
    const chartFade = useRef(new Animated.Value(1)).current;
    // Measure the available width so the chart fills the card without
    // overflowing on small screens. Safe default for first paint (~iPhone SE).
    const [chartWidth, setChartWidth] = useState(240);

    const renderIcon = (color: string, sz: number) =>
      isHype ? (
        <FontAwesome6 name="fire-flame-curved" size={sz} color={color} />
      ) : (
        <FontAwesome name="star" size={sz} color={color} />
      );

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        {/* Brand logo */}
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />

        {/* Event line */}
        {!!fight.event?.name && (
          <Text style={styles.eventLine} numberOfLines={1}>
            {formatEventName(fight.event.name, fight.event.promotion)}
            {!!fight.event.date && ` · ${formatDate(fight.event.date)}`}
          </Text>
        )}

        {/* Matchup */}
        <View style={styles.matchup}>
          <FighterColumn fighter={fight.fighter1} />
          <View style={styles.vsWrap}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <FighterColumn fighter={fight.fighter2} />
        </View>

        {/* Dual score: mine vs the community */}
        <View style={styles.scorePanel}>
          <View style={styles.scoreCell}>
            <Text style={styles.scoreLabel}>{isHype ? 'MY HYPE' : 'MY RATING'}</Text>
            <View style={styles.scoreValueRow}>
              {renderIcon(myAccent, 22)}
              <Text style={[styles.scoreNumber, { color: myAccent }]}>{myDisplay}</Text>
            </View>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreCell}>
            <Text style={styles.scoreLabel}>COMMUNITY</Text>
            <View style={styles.scoreValueRow}>
              {renderIcon(commAccent, 22)}
              <Text style={[styles.scoreNumber, { color: commAccent }]}>{commDisplay}</Text>
            </View>
            {hasCommunity && <Text style={styles.scoreCount}>({total})</Text>}
          </View>
        </View>

        {/* Community distribution with my vote marked */}
        {hasDistribution && (
          <View
            style={styles.chartWrap}
            onLayout={(e) => setChartWidth(Math.round(e.nativeEvent.layout.width))}
          >
            {isHype ? (
              <HypeDistributionChart
                distribution={distribution}
                totalPredictions={total}
                hasRevealedHype={true}
                fadeAnim={chartFade}
                userHype={value}
                width={chartWidth}
              />
            ) : (
              <RatingDistributionChart
                distribution={distribution}
                totalRatings={total}
                userRating={value}
                fadeAnim={chartFade}
                width={chartWidth}
              />
            )}
          </View>
        )}
      </View>
    );
  }
);

ShareableFightCard.displayName = 'ShareableFightCard';

export default ShareableFightCard;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: CARD.bg,
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  // Fixed box + resizeMode 'contain' (set on the Image) — the logo is fit
  // INSIDE this width×height box and centered, so it can never overflow. The
  // box is full card width, height tuned so the logo lands near-full-width on
  // phones. (Percentage width + aspectRatio on an <Image> is unreliable — it
  // can blow up to the asset's native pixel width.)
  logo: {
    width: '100%',
    height: 76,
    marginBottom: 0,
  },
  eventLine: {
    color: CARD.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: -3, // pull up slightly into the logo box's lower whitespace, toward the glyph
    marginBottom: 18,
    textAlign: 'center',
  },
  matchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  fighterColumn: {
    flex: 1,
    alignItems: 'center',
  },
  headshot: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: CARD.panel,
    borderWidth: 2,
    borderColor: CARD.hairline,
  },
  firstName: {
    color: CARD.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  lastName: {
    color: CARD.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  vsWrap: {
    paddingHorizontal: 6,
  },
  vsText: {
    color: CARD.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scorePanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD.hairline,
    backgroundColor: CARD.panel,
    overflow: 'hidden',
  },
  scoreCell: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreDivider: {
    width: 1,
    backgroundColor: CARD.hairline,
  },
  scoreLabel: {
    color: CARD.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  scoreValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 30,
    fontWeight: '900',
    marginLeft: 8,
  },
  scoreCount: {
    color: CARD.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  chartWrap: {
    width: '100%',
    marginTop: 18,
    alignItems: 'center',
  },
});
