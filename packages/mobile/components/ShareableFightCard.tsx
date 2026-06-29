import React, { forwardRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { getFighterImage, formatEventName, formatDate } from './fight-cards/shared/utils';
import { getHypeHeatmapColor } from '../utils/heatmap';

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
  ({ variant, fight, value }, ref) => {
    const isHype = variant === 'hype';
    const accent = getHypeHeatmapColor(value);
    const displayValue = Number.isInteger(value) ? `${value}` : value.toFixed(1);

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

        {/* Value badge */}
        <View style={[styles.valuePanel, { borderColor: accent }]}>
          <Text style={styles.valueLabel}>{isHype ? 'MY HYPE' : 'MY RATING'}</Text>
          <View style={styles.valueRow}>
            {isHype ? (
              <FontAwesome6 name="fire-flame-curved" size={34} color={accent} />
            ) : (
              <FontAwesome name="star" size={34} color={accent} />
            )}
            <Text style={[styles.valueNumber, { color: accent }]}>{displayValue}</Text>
            <Text style={styles.valueDenominator}>/10</Text>
          </View>
        </View>

        {/* CTA / watermark */}
        <Text style={styles.cta}>
          Rate this fight on <Text style={styles.ctaUrl}>goodfights.app</Text>
        </Text>
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
  logo: {
    width: '96%',
    aspectRatio: 2939 / 775,
    marginBottom: 6,
  },
  eventLine: {
    color: CARD.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 6,
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
  valuePanel: {
    marginTop: 22,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: CARD.panel,
    alignItems: 'center',
  },
  valueLabel: {
    color: CARD.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueNumber: {
    fontSize: 46,
    fontWeight: '900',
    marginLeft: 12,
    lineHeight: 52,
  },
  valueDenominator: {
    color: CARD.textSecondary,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 2,
    marginTop: 14,
  },
  cta: {
    color: CARD.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  ctaUrl: {
    color: CARD.brand,
    fontWeight: '800',
  },
});
