/**
 * FightCrewApp Color Scheme
 * Combat sports inspired design with red accents
 */

const tintColorLight = '#dc2626'; // Red-600
const tintColorDark = '#ef4444';  // Red-500

export const Colors = {
  light: {
    text: '#1f2937',           // Gray-800
    textSecondary: '#6b7280',  // Gray-500
    background: '#ffffff',     // White
    backgroundSecondary: '#f9fafb', // Gray-50
    tint: tintColorLight,
    tabIconDefault: '#9ca3af', // Gray-400
    tabIconSelected: tintColorLight,
    border: '#e5e7eb',         // Gray-200
    card: '#ffffff',
    primary: '#dc2626',        // Red-600
    success: '#059669',        // Emerald-600
    warning: '#d97706',        // Amber-600
    danger: '#dc2626',         // Red-600
  },
  dark: {
    text: '#f9fafb',           // Gray-50
    textSecondary: '#9ca3af',  // Gray-400
    background: '#111827',     // Gray-900
    backgroundSecondary: '#1f2937', // Gray-800
    tint: tintColorDark,
    tabIconDefault: '#6b7280', // Gray-500
    tabIconSelected: tintColorDark,
    border: '#374151',         // Gray-700
    card: '#1f2937',           // Gray-800
    primary: '#ef4444',        // Red-500
    success: '#10b981',        // Emerald-500
    warning: '#f59e0b',        // Amber-500
    danger: '#ef4444',         // Red-500
  },
};

export type ColorScheme = keyof typeof Colors;