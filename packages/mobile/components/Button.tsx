import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

/**
 * Button Variants
 * - primary: Main action button (yellow background)
 * - secondary: Less prominent action (gray background)
 * - outline: Outlined button with transparent background
 * - ghost: Text-only button with no background or border
 * - danger: Destructive action (red background)
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

/**
 * Button Sizes
 * - small: Compact button (padding 8x12)
 * - medium: Standard button (padding 12x16) - default
 * - large: Prominent button (padding 16x24)
 */
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  /** Button text */
  children: string;
  /** Button press handler */
  onPress: () => void;
  /** Button variant style */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Whether button is disabled */
  disabled?: boolean;
  /** Whether button is in loading state */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Custom style for button container */
  style?: ViewStyle;
  /** Custom style for button text */
  textStyle?: TextStyle;
  /** Icon to display before text (React element) */
  icon?: React.ReactNode;
}

/**
 * Reusable Button Component
 *
 * Provides consistent styling and behavior across the app.
 *
 * @example
 * ```tsx
 * // Primary button
 * <Button onPress={handleSubmit}>Submit</Button>
 *
 * // Secondary button with loading state
 * <Button variant="secondary" loading={isLoading} onPress={handleSave}>
 *   Save Changes
 * </Button>
 *
 * // Outline button with icon
 * <Button
 *   variant="outline"
 *   size="small"
 *   icon={<FontAwesome name="star" size={16} color="#F5C518" />}
 *   onPress={handleFavorite}
 * >
 *   Favorite
 * </Button>
 *
 * // Danger button for destructive actions
 * <Button variant="danger" onPress={handleDelete}>
 *   Delete Account
 * </Button>
 * ```
 */
export default function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Get background color based on variant
  const getBackgroundColor = () => {
    if (disabled) return colors.border;

    switch (variant) {
      case 'primary':
        return colors.primary; // Yellow
      case 'secondary':
        return colors.textSecondary; // Gray
      case 'outline':
        return 'transparent';
      case 'ghost':
        return 'transparent';
      case 'danger':
        return '#DC2626'; // Red
      default:
        return colors.primary;
    }
  };

  // Get text color based on variant
  const getTextColor = () => {
    if (disabled) return colors.textSecondary;

    switch (variant) {
      case 'primary':
        return '#000000'; // Black text on yellow
      case 'secondary':
        return '#FFFFFF'; // White text on gray
      case 'outline':
        return colors.primary; // Yellow text
      case 'ghost':
        return colors.text; // Default text color
      case 'danger':
        return '#FFFFFF'; // White text on red
      default:
        return colors.textOnAccent;
    }
  };

  // Get active/pressed color (slightly darker than background)
  const getActiveColor = () => {
    if (disabled) return colors.border;

    switch (variant) {
      case 'primary':
        return '#D4A017'; // Darker yellow
      case 'secondary':
        return '#4B5563'; // Darker gray
      case 'outline':
        return 'rgba(245, 197, 24, 0.1)'; // Light yellow tint
      case 'ghost':
        return 'rgba(0, 0, 0, 0.05)'; // Subtle gray tint
      case 'danger':
        return '#B91C1C'; // Darker red
      default:
        return '#D4A017';
    }
  };

  // Get padding based on size
  const getPadding = () => {
    switch (size) {
      case 'small':
        return { paddingVertical: 8, paddingHorizontal: 12 };
      case 'medium':
        return { paddingVertical: 12, paddingHorizontal: 16 };
      case 'large':
        return { paddingVertical: 16, paddingHorizontal: 24 };
      default:
        return { paddingVertical: 12, paddingHorizontal: 16 };
    }
  };

  // Get font size based on size
  const getFontSize = () => {
    switch (size) {
      case 'small':
        return 14;
      case 'medium':
        return 16;
      case 'large':
        return 18;
      default:
        return 16;
    }
  };

  // Get border style for outline variant
  const getBorderStyle = () => {
    if (variant === 'outline') {
      return {
        borderWidth: 2,
        borderColor: disabled ? colors.border : colors.primary,
      };
    }
    return {};
  };

  const buttonStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...getPadding(),
    ...getBorderStyle(),
    ...(fullWidth && { width: '100%' }),
    ...(disabled && { opacity: 0.6 }),
    ...style,
  };

  const buttonTextStyle: TextStyle = {
    color: getTextColor(),
    fontSize: getFontSize(),
    fontWeight: '600',
    ...textStyle,
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        buttonStyle,
        // Apply active color on press (Android ripple effect alternative)
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={getTextColor()}
        />
      ) : (
        <>
          {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
          <Text style={buttonTextStyle}>{children}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/**
 * Export Button component and types
 */
export { Button };
export type { ButtonVariant, ButtonSize };
