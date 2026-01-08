import { Colors } from '../constants/Colors';

/**
 * Returns the app color palette.
 * Currently forces dark mode for all users.
 */
export function useColors() {
  return Colors.dark;
}
