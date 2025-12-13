/**
 * FightCrewApp Color Scheme
 * Combat sports inspired design with semantic color system
 */

const tintColorLight = '#F5C518'; // Golden accent
const tintColorDark = '#F5C518';  // Golden accent

/**
 * Semantic Color System
 * Different colors for different data types to improve clarity
 */
export const SemanticColors = {
  // HYPE: Orange → Red (warm, energetic excitement)
  hype: {
    low: '#808080',      // Grey - no hype
    medium: '#F97316',   // Orange - moderate hype
    high: '#EF4444',     // Red-orange - high hype
    max: '#B91C1C',      // Deep red - maximum hype
  },

  // RATINGS: Blue → Purple (cool, analytical judgment)
  rating: {
    low: '#808080',      // Grey - no rating
    medium: '#3B82F6',   // Blue - moderate rating
    high: '#8B5CF6',     // Violet - high rating
    max: '#C026D3',      // Magenta-purple - maximum rating
  },

  // User ownership indicator
  userOwnership: '#F5C518',  // Gold - "This is yours"

  // Winners/Success
  winner: '#10b981',         // Green - positive outcomes

  // Community/Aggregate data
  community: '#808080',      // Grey - baseline/aggregate info
};

export const Colors = {
  light: {
    text: '#ffffff',           // White text
    textSecondary: '#9ca3af',  // Gray-400
    textOnAccent: '#202020',   // Dark text for golden backgrounds
    background: '#181818',     // Dark background
    backgroundSecondary: '#202020', // Lighter dark background
    tint: tintColorLight,
    tabIconDefault: '#6b7280', // Gray-500
    tabIconSelected: tintColorLight,
    border: '#374151',         // Gray-700
    card: '#202020',           // Lighter dark background
    primary: '#F5C518',        // Golden accent
    success: '#10b981',        // Emerald-500
    warning: '#F5C518',        // Golden accent
    danger: '#ef4444',         // Red-500
  },
  dark: {
    text: '#ffffff',           // White text
    textSecondary: '#9ca3af',  // Gray-400
    textOnAccent: '#202020',   // Dark text for golden backgrounds
    background: '#181818',     // Dark background
    backgroundSecondary: '#202020', // Lighter dark background
    tint: tintColorDark,
    tabIconDefault: '#6b7280', // Gray-500
    tabIconSelected: tintColorDark,
    border: '#374151',         // Gray-700
    card: '#202020',           // Lighter dark background
    primary: '#F5C518',        // Golden accent
    success: '#10b981',        // Emerald-500
    warning: '#F5C518',        // Golden accent
    danger: '#ef4444',         // Red-500
  },
};

export type ColorScheme = keyof typeof Colors;