/**
 * FightCrewApp Color Scheme
 * Combat sports inspired design with golden accents
 */

const tintColorLight = '#F5C518'; // Golden accent
const tintColorDark = '#F5C518';  // Golden accent

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